//! Ядро ZShelper: каркас приложения, каталог действий и первые «руки».
//!
//! Порядок этапов и контракты — `docs/BUILD-GUIDE.md`. Что уже умеет ядро:
//! * читает реестр и отдаёт его UI (`registry`);
//! * проводит каждое действие через политику риска (`policy`) и журнал (`audit`);
//! * выполняет десять инструментов (`tools`) с проверкой результата (`verifier`).
//!
//! Чего ещё нет: планировщика, моделей, голоса, памяти, MCP — они следующие.

pub mod audit;
pub mod executor;
pub mod ipc;
pub mod logging;
pub mod policy;
pub mod registry;
pub mod step;
pub mod tools;
pub mod tray;
pub mod verifier;

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use audit::Audit;
use ipc::{AppState, Inner};
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
        "реестр загружен"
    );

    let audit = Audit::new(
        app_dir
            .unwrap_or_else(std::env::temp_dir)
            .join("audit.jsonl"),
    );

    let state = AppState {
        inner: Arc::new(Inner {
            registry,
            audit,
            policy: PolicyState::new(),
            cancel: AtomicBool::new(false),
        }),
        log_file: log_file.display().to_string(),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            ipc::registry_snapshot,
            ipc::app_status,
            ipc::list_tools,
            ipc::policy_for,
            ipc::confirm_tool,
            ipc::run_tool,
            ipc::cancel_tool
        ])
        .setup(|app| {
            if let Err(error) = tray::install(app.handle()) {
                // Без трея приложение работает — окно открыто, логи есть.
                tracing::warn!(%error, "трей не установлен");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("приложение не запустилось");
}
