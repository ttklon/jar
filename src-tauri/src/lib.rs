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
//! * знает, как это делается в 87 программах (`profiles`), и честно показывает, что из
//!   этого уже исполняется;
//! * вызывается из любой программы по `Ctrl+Alt+Z` (`hotkey`).
//!
//! Чего ещё нет: планировщика, моделей, голоса, памяти, MCP — они следующие.

pub mod audit;
pub mod executor;
pub mod flows;
pub mod hotkey;
pub mod ipc;
pub mod logging;
pub mod memory;
pub mod policy;
pub mod profiles;
pub mod registry;
pub mod step;
pub mod tools;
pub mod tray;
pub mod verifier;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

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
        .run(tauri::generate_context!())
        .expect("приложение не запустилось");
}
