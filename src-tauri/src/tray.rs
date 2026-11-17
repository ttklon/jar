//! Иконка в системном трее: «открыть», «пауза», «выход».
//!
//! Ассистент живёт в фоне, поэтому трей — не украшение, а основной способ
//! управления: закрытие окна не завершает работу, завершение — только через
//! явный пункт меню.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Открыть ZShelper", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause", "Пауза (скоро)", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &pause, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("ZShelper — готово")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                tracing::info!("трей: выход");
                app.exit(0);
            }
            "show" => show_main_window(app),
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
fn voice_tooltip(active: bool) -> &'static str {
    if active {
        "ZShelper — голосовая клавиша зажата"
    } else {
        "ZShelper — готово"
    }
}

pub fn set_voice_hold(app: &AppHandle, active: bool) {
    let Some(tray) = app.tray_by_id("main") else {
        tracing::warn!("иконка трея не найдена для voice status");
        return;
    };
    if let Err(error) = tray.set_tooltip(Some(voice_tooltip(active))) {
        tracing::warn!(%error, "статус голоса не обновлён в трее");
    }
}

fn show_main_window(app: &AppHandle) {
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
    fn tray_distinguishes_held_voice_key_from_ready() {
        assert_eq!(voice_tooltip(true), "ZShelper — голосовая клавиша зажата");
        assert_eq!(voice_tooltip(false), "ZShelper — готово");
    }
}
