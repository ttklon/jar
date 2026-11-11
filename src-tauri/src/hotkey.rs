//! Глобальная горячая клавиша: `Ctrl+Alt+Z` показывает и скрывает окно.
//!
//! Зачем глобальная, а не оконная: ассистент живёт в фоне, окна может не быть на
//! экране — клавиша должна работать из любой программы. Поэтому плагин, а не
//! обработчик `keydown` в webview: последний работает, только когда окно в фокусе.
//!
//! Клавиша не выполняет действий сама: она только показывает окно. Всё опасное
//! по-прежнему требует подтверждения в интерфейсе — горячая клавиша не может
//! подтвердить ничего за человека.
//!
//! Вторая клавиша — `Ctrl+Space`: удержание для разговора из **любой** программы.
//! Человек смотрит видео или пишет в чужом окне; переключаться на помощника он не хочет.
//! Поэтому удержание приходит из системы двумя событиями — нажал и отпустил, — а окно
//! показывается без перехвата фокуса: отбирать клавиатуру у того, кто печатает, нельзя.
//! Сама клавиша ничего не подтверждает и ничего не выполняет.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Акселератор в том виде, в каком он написан в документации и подсказке в UI.
pub const ACCELERATOR: &str = "Ctrl+Alt+KeyZ";

/// Что нажимает человек — для подсказок в интерфейсе.
pub const LABEL: &str = "Ctrl+Alt+Z";

/// Удержание для разговора из любой программы.
pub const TALK_ACCELERATOR: &str = "Ctrl+Space";

/// Подпись для интерфейса.
pub const TALK_LABEL: &str = "Ctrl+Space";

/// Имя события для интерфейса: то же, что `GLOBAL_TALK_EVENT` в `src/lib/globalTalk.ts`.
pub const TALK_EVENT: &str = "voice://hold";

/// Удержание из любой программы.
pub fn talk_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL), Code::Space)
}

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

/// Показать окно, не забирая фокус.
fn peek(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
}

/// Отправить интерфейсу «нажал» / «отпустил».
fn emit_talk(app: &AppHandle, state: &str) {
    if let Err(error) = app.emit(TALK_EVENT, state) {
        tracing::warn!(%error, state, "удержание не отправлено в интерфейс");
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

            if pressed == &talk_shortcut() {
                match event.state() {
                    ShortcutState::Pressed => {
                        // Окно показываем, но фокус не забираем: человек продолжает
                        // смотреть видео или печатать, а видит, что его слушают.
                        peek(&handle);
                        emit_talk(&handle, "down");
                    }
                    ShortcutState::Released => emit_talk(&handle, "up"),
                }
            }
        })
        .build();

    if let Err(error) = app.handle().plugin(plugin) {
        tracing::warn!(%error, "плагин горячих клавиш не подключён");
        return;
    }

    match app.global_shortcut().register(talk_shortcut()) {
        Ok(()) => tracing::info!(
            accelerator = TALK_ACCELERATOR,
            "удержание для разговора зарегистрировано"
        ),
        Err(error) => tracing::warn!(
            %error,
            accelerator = TALK_ACCELERATOR,
            "удержание занято другой программой — разговор из чужих окон недоступен"
        ),
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
    fn the_talk_key_is_its_own_keyboard_combination() {
        let parsed = Shortcut::from_str(TALK_ACCELERATOR).expect("акселератор разбирается");
        assert_eq!(
            parsed,
            talk_shortcut(),
            "подсказка должна совпадать с клавишей"
        );
        assert_ne!(
            talk_shortcut(),
            shortcut(),
            "окно и разговор — разные клавиши, иначе одно съест другое"
        );
    }

    #[test]
    fn the_talk_event_name_matches_the_frontend() {
        assert_eq!(TALK_EVENT, "voice://hold");
    }

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
