//! Команды, которые фронтенд вызывает через `invoke`.
//!
//! Тонкий слой без логики: всё, что здесь происходит, — выдать данные из состояния
//! и привести типы. Любая логика «что делать» живёт в `registry`/`orchestrator`,
//! любая логика «как показать» — в React. Формат ответов совпадает с
//! `src/ipc/types.ts`.

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::registry::{Registry, RegistrySnapshot};

/// Состояние приложения, доступное командам.
pub struct AppState {
    pub registry: Arc<Registry>,
    pub log_file: String,
}

#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub version: &'static str,
    pub actions: usize,
    pub domains: usize,
    pub data_loaded: bool,
    pub log_file: String,
}

/// Полный каталог действий. Вызывается один раз при старте UI: 829 строк —
/// это меньше 400 КБ, дешевле отдать всё, чем строить пагинацию.
#[tauri::command]
pub fn registry_snapshot(state: State<'_, AppState>) -> RegistrySnapshot {
    state.registry.snapshot()
}

/// Короткая сводка для строки состояния и «Настроек».
#[tauri::command]
pub fn app_status(state: State<'_, AppState>) -> AppStatus {
    AppStatus {
        version: env!("CARGO_PKG_VERSION"),
        actions: state.registry.len(),
        domains: state.registry.stats().domains,
        data_loaded: !state.registry.is_empty(),
        log_file: state.log_file.clone(),
    }
}
