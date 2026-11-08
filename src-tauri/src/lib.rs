//! Ядро ZShelper: каркас приложения (окно, трей, логи) и каталог действий.
//!
//! Порядок этапов и контракты — `docs/BUILD-GUIDE.md`. На этом этапе (M1) ядро
//! умеет: прочитать реестр, отдать его UI, держать трей и писать логи. Политики
//! риска, планировщика и исполнителя здесь ещё нет — они следующие.

pub mod ipc;
pub mod logging;
pub mod registry;
pub mod tray;

use std::sync::Arc;

use registry::Registry;

pub fn run() {
    let log_file = logging::init();
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        log = %log_file.display(),
        "ZShelper запускается"
    );
    logging::ensure_app_dir();

    // Реестр встроен в бинарник и проверен CI. Если он не разбирается — это
    // ошибка сборки, а не пользователя: лучше явно упасть на старте.
    let registry = Registry::load().expect("встроенный реестр обязан разбираться");
    tracing::info!(
        actions = registry.len(),
        domains = registry.stats().domains,
        verbs = registry.stats().verbs,
        "реестр загружен"
    );

    let state = ipc::AppState {
        registry: Arc::new(registry),
        log_file: log_file.display().to_string(),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            ipc::registry_snapshot,
            ipc::app_status
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
