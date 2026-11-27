//! Иконка в системном трее: «открыть», «пауза», «выход».
//!
//! Ассистент живёт в фоне, поэтому трей — не украшение, а основной способ
//! управления: закрытие окна не завершает работу, завершение — только через
//! явный пункт меню.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Открыть ZShelper", true, None::<&str>)?;
    let stop_voice =
        MenuItem::with_id(app, "stop-voice", "Остановить микрофон", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &stop_voice, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("жду вашу фразу")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                tracing::info!("трей: выход");
                app.exit(0);
            }
            "show" => show_main_window(app),
            "stop-voice" => {
                // Не ставим ready здесь: emit лишь отправляет запрос, а не доказывает,
                // что UI получил его и действительно закрыл микрофон.
                if let Err(error) = app.emit("voice://stop", ()) {
                    tracing::warn!(%error, "команда остановки голоса не отправлена");
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    tracing::info!("трей установлен");
    Ok(())
}

/// Индикатор удержания для фонового разговора. Окно остаётся скрытым;
/// системный tooltip — единственная видимая подсказка без вмешательства в чужое окно.
fn voice_tooltip(status: &str) -> Result<&'static str, String> {
    match status {
        "ready" => Ok("жду вашу фразу"),
        "key-down" => Ok("голосовая клавиша зажата"),
        "key-up" => Ok("клавиша отпущена"),
        "listening" => Ok("слушаю"),
        "working" => Ok("обрабатываю запрос"),
        "awaiting-confirmation" => Ok("жду подтверждения"),
        // Шаг 98: дело из памяти видно и в трее. Правило `runningGlobally`
        // требует, чтобы идущее дело не терялось при уходе с экрана, а
        // `waitingGlobally` — чтобы ждущее было настойчивее: без ответа оно не
        // сдвинется никогда.
        "deed-running" => Ok("дело идёт"),
        "deed-waiting" => Ok("дело ждёт вашего ответа"),
        "executing" => Ok("выполняю действие"),
        "error" => Ok("ошибка; откройте окно"),
        _ => Err("неизвестное состояние голоса".to_string()),
    }
}

pub fn set_voice_status(app: &AppHandle, status: &str) -> Result<(), String> {
    let tooltip = voice_tooltip(status)?;
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "иконка трея не найдена".to_string())?;
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| format!("статус голоса не обновлён в трее: {error}"))
}

pub fn set_voice_hold(app: &AppHandle, active: bool) {
    let status = if active { "key-down" } else { "key-up" };
    if let Err(error) = set_voice_status(app, status) {
        tracing::warn!(%error, "voice status не обновлён");
    }
}

fn show_main_window(app: &AppHandle) {
    // Засечка возврата до `show`: человек ждёт с того момента, как нажал, а не с
    // момента, когда окно уже на экране (шаг 399: тёплый старт ≤ 1.5 с).
    crate::timing::mark_resumed();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::voice_tooltip;

    #[test]
    fn tray_has_explicit_voice_states_and_rejects_unknown_values() {
        assert_eq!(
            voice_tooltip("key-down").unwrap(),
            "голосовая клавиша зажата"
        );
        assert_eq!(voice_tooltip("listening").unwrap(), "слушаю");
        assert_eq!(voice_tooltip("working").unwrap(), "обрабатываю запрос");
        assert_eq!(
            voice_tooltip("awaiting-confirmation").unwrap(),
            "жду подтверждения"
        );
        assert_eq!(voice_tooltip("executing").unwrap(), "выполняю действие");
        assert_eq!(voice_tooltip("error").unwrap(), "ошибка; откройте окно");
        // Шаг 98: дело не теряется при уходе с экрана.
        assert_eq!(voice_tooltip("deed-running").unwrap(), "дело идёт");
        assert_eq!(
            voice_tooltip("deed-waiting").unwrap(),
            "дело ждёт вашего ответа"
        );
        assert!(voice_tooltip("untrusted arbitrary tooltip").is_err());
    }
}
