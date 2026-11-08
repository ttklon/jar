//! Глобальная горячая клавиша: `Ctrl+Alt+Z` показывает и скрывает окно.
//!
//! Зачем глобальная, а не оконная: ассистент живёт в фоне, окна может не быть на
//! экране — клавиша должна работать из любой программы. Поэтому плагин, а не
//! обработчик `keydown` в webview: последний работает, только когда окно в фокусе.
//!
//! Клавиша не выполняет действий сама: она только показывает окно. Всё опасное
//! по-прежнему требует подтверждения в интерфейсе — горячая клавиша не может
//! подтвердить ничего за человека.

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Акселератор в том виде, в каком он написан в документации и подсказке в UI.
pub const ACCELERATOR: &str = "Ctrl+Alt+KeyZ";

/// Что нажимает человек — для подсказок в интерфейсе.
pub const LABEL: &str = "Ctrl+Alt+Z";

pub fn shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyZ)
}

/// Показать окно из любого состояния: свёрнуто, скрыто, за другими окнами.
pub fn reveal_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(error) = window.show() {
        tracing::warn!(%error, "окно не показывается");
        return;
    }
    let _ = window.unminimize();
    if let Err(error) = window.set_focus() {
        tracing::warn!(%error, "окно не получает фокус");
    }
}

/// Показать окно, если скрыто; скрыть, если оно на экране и в фокусе.
pub fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        if let Err(error) = window.hide() {
            tracing::warn!(%error, "окно не скрывается");
        }
        return;
    }

    if let Err(error) = window.show() {
        tracing::warn!(%error, "окно не показывается");
        return;
    }
    let _ = window.unminimize();
    if let Err(error) = window.set_focus() {
        tracing::warn!(%error, "окно не получает фокус");
    }
}

/// Ставит плагин и обработчик. Ошибка регистрации не должна мешать запуску:
/// без клавиши приложение работает, окно открывается из трея.
pub fn install(app: &mut tauri::App) {
    let handle = app.handle().clone();
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |_app, pressed, event| {
            if pressed == &shortcut() && event.state() == ShortcutState::Pressed {
                toggle_main(&handle);
            }
        })
        .build();

    if let Err(error) = app.handle().plugin(plugin) {
        tracing::warn!(%error, "плагин горячих клавиш не подключён");
        return;
    }

    match app.global_shortcut().register(shortcut()) {
        Ok(()) => tracing::info!(
            accelerator = ACCELERATOR,
            "горячая клавиша зарегистрирована"
        ),
        Err(error) => tracing::warn!(%error, accelerator = ACCELERATOR, "горячая клавиша занята"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn accelerator_matches_the_registered_shortcut() {
        let parsed = Shortcut::from_str(ACCELERATOR).expect("акселератор разбирается");
        assert_eq!(
            parsed,
            shortcut(),
            "подсказка в интерфейсе должна совпадать с реальной клавишей"
        );
    }
}
