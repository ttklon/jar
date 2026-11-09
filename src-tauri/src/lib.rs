//! Ядро ZShelper: каркас приложения, каталог действий и первые «руки».
//!
//! Порядок этапов и контракты — `docs/BUILD-GUIDE.md`. Что уже умеет ядро:
//! * читает реестр и отдаёт его UI (`registry`);
//! * проводит каждое действие через политику риска (`policy`) и журнал (`audit`);
//! * выполняет инструменты (`tools`) с независимой проверкой результата (`verifier`);
//! * собирает их в сценарии (`flows`) — план из шагов, каждый со своим подтверждением;
//! * показывает, что было сделано: журнал (`audit`) читается экраном «История»;
//! * помнит удачные запуски и их параметры в SQLite (`memory`), чтобы не спрашивать
//!   одно и то же дважды;
//! * по фразе человека находит действия в реестре (`planner`) и честно говорит, что из
//!   них выполнимо;
//! * читает папку моделей (`models`) и показывает, какие `.gguf` там лежат и целы ли они;
//! * скачивает файл модели через системный `curl` (`download`): сначала `.part`, потом
//!   проверка sha256, и только затем переименование;
//! * показывает, сколько занимают модели и сколько свободно на диске, и удаляет файл
//!   только после подтверждения человеком;
//! * умеет запускать локальный сервер модели и ждать от него ответа (`server`), а не
//!   только «процесс стартовал»; конкретные флаги `llama-server` живут в `llama`;
//! * знает, как это делается в 87 программах (`profiles`), и честно показывает, что из
//!   этого уже исполняется;
//! * вызывается из любой программы по `Ctrl+Alt+Z` (`hotkey`).
//!
//! Чего ещё нет: планировщика, моделей, голоса, памяти, MCP — они следующие.

pub mod audit;
pub mod download;
pub mod executor;
pub mod flows;
pub mod hotkey;
pub mod ipc;
pub mod llama;
pub mod logging;
pub mod memory;
pub mod models;
pub mod planner;
pub mod policy;
pub mod profiles;
pub mod registry;
pub mod roles;
pub mod server;
pub mod step;
pub mod tools;
pub mod tray;
pub mod verifier;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::Manager;

use audit::Audit;
use ipc::{AppState, Inner};
use memory::Memory;
use policy::PolicyState;
use registry::Registry;

pub fn run() {
    let log_file = logging::init();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        log = %log_file.display(),
        "ZShelper запускается"
    );
    let app_dir = logging::ensure_app_dir();

    // Реестр встроен в бинарник и проверен CI. Если он не разбирается — это
    // ошибка сборки, а не пользователя: лучше явно упасть на старте.
    let registry = Registry::load().expect("встроенный реестр обязан разбираться");
    tracing::info!(
        actions = registry.len(),
        domains = registry.stats().domains,
        verbs = registry.stats().verbs,
        tools = tools::all().len(),
        flows = flows::all().len(),
        "реестр загружен"
    );

    let base = app_dir.unwrap_or_else(std::env::temp_dir);
    let audit = Audit::new(base.join("audit.jsonl"));

    // Память не должна мешать запуску: без неё приложение работает, просто не помнит
    // прошлые параметры. Поэтому ошибка уходит в лог, а не в панику.
    let memory = match Memory::open(base.join("memory.db")) {
        Ok(memory) => memory,
        Err(error) => {
            tracing::warn!(%error, "память недоступна — продолжаю без неё");
            Memory::open(std::env::temp_dir().join("zshelper-memory.db"))
                .expect("временная память обязана открыться")
        }
    };

    let state = AppState {
        inner: Arc::new(Inner {
            registry,
            audit,
            memory,
            models_dir: models::dir(&base),
            base_dir: base.clone(),
            engine: std::sync::Mutex::new(None),
            policy: PolicyState::new(),
            cancel: AtomicBool::new(false),
        }),
        log_file: log_file.display().to_string(),
    };

    tauri::Builder::default()
        // Второй запуск не открывает второе приложение: показываем уже работающее.
        // Без этого трей и горячая клавиша удваиваются, а журнал пишется из двух мест.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tracing::info!("повторный запуск — показываю открытое окно");
            hotkey::reveal_main(app);
        }))
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            ipc::registry_snapshot,
            ipc::app_status,
            ipc::list_tools,
            ipc::list_flows,
            ipc::audit_tail,
            ipc::memory_runs,
            ipc::plan_for,
            ipc::list_models,
            ipc::verify_model,
            ipc::download_model,
            ipc::remove_model,
            ipc::engine_status,
            ipc::start_engine,
            ipc::stop_engine,
            ipc::list_roles,
            ipc::assign_role,
            ipc::clear_role,
            ipc::list_profiles,
            ipc::policy_for,
            ipc::confirm_tool,
            ipc::run_tool,
            ipc::cancel_tool
        ])
        .setup(|app| {
            hotkey::install(app);
            if let Err(error) = tray::install(app.handle()) {
                // Без трея приложение работает — окно открыто, логи есть.
                tracing::warn!(%error, "трей не установлен");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("приложение не собралось")
        .run(|app, event| {
            // Движок — дочерний процесс: закрыть окно и оставить его работать нельзя,
            // иначе следующий запуск найдёт занятый порт и «чужой» сервер.
            if !matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                return;
            }

            let Some(state) = app.try_state::<AppState>() else {
                return;
            };
            let taken = state
                .inner
                .engine
                .lock()
                .ok()
                .and_then(|mut guard| guard.take());
            let Some(mut server) = taken else { return };

            match server.stop() {
                Ok(()) => tracing::info!("движок остановлен при выходе"),
                Err(error) => tracing::warn!(%error, "движок не остановился при выходе"),
            }
        });
}
