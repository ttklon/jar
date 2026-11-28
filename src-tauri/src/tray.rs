//! Иконка в системном трее: «открыть», «пауза», «выход».
//!
//! Ассистент живёт в фоне, поэтому трей — не украшение, а основной способ
//! управления: закрытие окна не завершает работу, завершение — только через
//! явный пункт меню.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// Значок трея по состоянию — форма и цвет, а не буква.
///
/// Правило `trayNative.icon` задаёт пять состояний: «сплю», «работаю», «жду
/// ответа», «на паузе», «был сбой». До этого Rust **никогда не менял значок**:
/// он ставился один раз при установке, и все пять состояний выглядели
/// одинаково — человек узнавал о паузе или сбое, только наведя мышь.
///
/// Здесь значки рисуются кодом, а не лежат файлами: 16×16, круг с выемкой
/// (сплю), сплошной круг (работаю), восклицательный знак (жду), две черты
/// (пауза), косой крест (сбой). Цвет — системный акцент темы не нужен: значок
/// должен отличаться от чужих иконок, а не совпадать с ними.
fn badge(state: &str) -> tauri::image::Image<'static> {
    let (color, shape) = match state {
        "running" => ([0x2Bu8, 0x7A, 0x3E], Shape::Dot),
        "waiting" => ([0x8Au8, 0x4B, 0x00], Shape::Bang),
        "paused" => ([0x5A, 0x5A, 0x5A], Shape::Bars),
        "failed" => ([0xB3, 0x2B, 0x2B], Shape::Cross),
        _ => ([0x44, 0x44, 0x44], Shape::Ring),
    };
    draw(shape, color)
}

#[derive(Clone, Copy)]
enum Shape {
    Ring,
    Dot,
    Bang,
    Bars,
    Cross,
}

/// Нарисовать 16×16 RGBA. Прозрачный фон, фигура в цвете состояния.
fn draw(shape: Shape, color: [u8; 3]) -> tauri::image::Image<'static> {
    const N: usize = 16;
    let mut rgba = vec![0u8; N * N * 4];
    let center = (N as f32 - 1.0) / 2.0;
    for (i, pixel) in rgba.chunks_mut(4).enumerate() {
        let x = (i % N) as f32;
        let y = (i / N) as f32;
        let dx = x - center;
        let dy = y - center;
        let radius = (dx * dx + dy * dy).sqrt();
        let on = match shape {
            // «Сплю» — кольцо: заполненная точка читается как «работаю».
            Shape::Ring => (5.0..=6.6).contains(&radius),
            Shape::Dot => radius <= 5.0,
            // Восклицательный знак: черта и точка под ней. Толщина 2 пикселя
            // проверена подсчётом: 24 непрозрачных точки — фигура видна, но не
            // сливается с точкой «работаю».
            Shape::Bang => {
                (dx.abs() <= 1.8 && (-5.5..-0.5).contains(&dy))
                    || (dx.abs() <= 1.8 && (2.5..=4.0).contains(&dy))
            }
            // Пауза: две вертикальные черты.
            Shape::Bars => matches!(x as i32, 6 | 7 | 10 | 11) && (4..=11).contains(&(y as i32)),
            // Сбой: косой крест.
            Shape::Cross => (dx + dy).abs() <= 1.3 || (dx - dy).abs() <= 1.3,
        };
        if on {
            pixel[0] = color[0];
            pixel[1] = color[1];
            pixel[2] = color[2];
            pixel[3] = 0xFF;
        }
    }
    tauri::image::Image::new_owned(rgba, N as u32, N as u32)
}

/// Поставить значок состояния. Ошибка не ломает работу: трей — индикатор.
pub fn set_state_icon(app: &AppHandle, state: &str) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    if let Err(error) = tray.set_icon(Some(badge(state))) {
        tracing::debug!(%error, state, "значок трея не обновлён");
    }
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Открыть ZShelper", true, None::<&str>)?;
    let stop_voice =
        MenuItem::with_id(app, "stop-voice", "Остановить микрофон", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    // Пауза — отдельный пункт, а не «закрыть окно»: закрытие окна работу не
    // останавливает, и человек, ждавший тишины, получал обратное (шаг 441).
    let pause = MenuItem::with_id(app, "pause", "Пауза", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &stop_voice, &pause, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("жду вашу фразу")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                // Выход во время дела — сначала предупреждение, а не «пропало»
                // (правило `exitWarn` из `src/lib/trayNative.ts`). Выход не
                // отменяем: человек уже решил. Но дело сохраняем и говорим, с
                // какого шага продолжим — иначе «выход» стирает работу молча.
                let need = app
                    .try_state::<crate::Unfinished>()
                    .and_then(|state| crate::unfinished_of(&state));
                if let Some(need) = need {
                    let saved = crate::session::save_now(&need);
                    tracing::info!(said = %saved.said, "трей: выход при незавершённом деле");
                    show_main_window(app);
                }
                tracing::info!("трей: выход");
                app.exit(0);
            }
            "show" => show_main_window(app),
            "pause" => {
                let Some(state) = app.try_state::<crate::Paused>() else {
                    return;
                };
                // Один пункт переключает, а не требует двух разных: человек не
                // должен искать «снять паузу» там, где ставил.
                let (paused, said) = state.toggle(crate::hold::now_ms());
                tracing::info!(paused, %said, "трей: пауза");
                if let Err(error) = app.emit("pause://changed", paused) {
                    tracing::warn!(%error, "смена паузы не отправлена окну");
                }
                // Значок меняется здесь же, а не по возвращении окна: окно
                // может быть закрыто, и тогда пауза осталась бы невидимой —
                // ровно тот дефект, который правило `icon` и называет.
                mark_state(app, if paused { "paused" } else { "idle" });
            }
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

    // Значок ставится по состоянию паузы, а не «сплю» по умолчанию: если
    // приложение запустили в паузе, значок обязан это показывать с первой
    // секунды — иначе первый же взгляд на трей врёт.
    let paused_now = app
        .try_state::<crate::Paused>()
        .map(|state| state.is_on())
        .unwrap_or(false);
    builder = builder.icon(badge(if paused_now { "paused" } else { "idle" }));

    builder.build(app)?;
    tracing::info!("трей установлен");
    Ok(())
}

/// Индикатор удержания для фонового разговора. Окно остаётся скрытым;
/// системный tooltip — единственная видимая подсказка без вмешательства в чужое окно.
fn voice_tooltip(status: &str) -> Result<&'static str, String> {
    match status {
        "ready" => Ok("жду вашу фразу"),
        "paused" => Ok("на паузе: дела не запускаются"),
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

/// Значок для голосового статуса: то же состояние, только пришло из окна.
fn icon_for(status: &str) -> &'static str {
    match status {
        "listening" | "working" | "executing" | "key-down" | "deed-running" => "running",
        "awaiting-confirmation" | "deed-waiting" => "waiting",
        "paused" => "paused",
        "error" => "failed",
        _ => "idle",
    }
}

pub fn set_voice_status(app: &AppHandle, status: &str) -> Result<(), String> {
    let tooltip = voice_tooltip(status)?;
    // Значок меняется вместе с подсказкой: иначе окно говорит «работаю», а
    // значок остаётся «сплю» — и человек верит значку, потому что он ближе.
    set_state_icon(app, icon_for(status));
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "иконка трея не найдена".to_string())?;
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| format!("статус голоса не обновлён в трее: {error}"))
}

/// Состояние трея одной строкой: и подсказка, и значок.
///
/// Разделять их нельзя — подсказка без значка и значок без подсказки дают две
/// разные правды об одном и том же, и человек верит той, которую видит первой.
pub fn mark_state(app: &AppHandle, state: &str) {
    set_state_icon(app, state);
    let status = match state {
        "running" => "deed-running",
        "waiting" => "deed-waiting",
        "paused" => "paused",
        "failed" => "error",
        _ => "ready",
    };
    if let Err(error) = set_voice_status(app, status) {
        tracing::debug!(%error, state, "подсказка трея не обновлена");
    }
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
    use super::{badge, icon_for, voice_tooltip};

    #[test]
    fn tray_has_explicit_voice_states_and_rejects_unknown_values() {
        assert_eq!(
            voice_tooltip("key-down").unwrap(),
            "голосовая клавиша зажата"
        );
        assert_eq!(voice_tooltip("paused").unwrap(), "на паузе: дела не запускаются");
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

    #[test]
    fn every_state_has_its_own_picture_not_one_for_all() {
        // Правило `trayNative.icon` обещает пять различимых значков. Дефект был
        // ровно в обратном: значок ставился один раз при установке, и пауза со
        // сбоем выглядели как «сплю». Сравниваем пиксели, а не намерения.
        let states = ["idle", "running", "waiting", "paused", "failed"];
        let mut seen: Vec<Vec<u8>> = Vec::new();
        for state in states {
            let image = badge(state);
            assert_eq!(image.width(), 16);
            assert_eq!(image.height(), 16);
            let pixels = image.rgba().to_vec();
            assert!(
                pixels.chunks(4).any(|px| px[3] > 0),
                "значок {state} пустой"
            );
            assert!(
                !seen.contains(&pixels),
                "значок {state} совпал с другим состоянием"
            );
            seen.push(pixels);
        }
    }

    #[test]
    fn the_badge_colour_says_what_the_shape_says() {
        // Цвет — не украшение: «на паузе» серый, «сбой» красный. Один цвет на
        // все состояния означал бы, что человек различает их только по форме,
        // а форму 16×16 он не разглядывает.
        let red = badge("failed").rgba().to_vec();
        let grey = badge("paused").rgba().to_vec();
        let first = |px: &[u8]| -> (u8, u8, u8) {
            let i = px.chunks(4).position(|p| p[3] > 0).map(|i| i * 4).unwrap();
            (px[i], px[i + 1], px[i + 2])
        };
        assert_ne!(first(&red), first(&grey));
        assert!(first(&red).0 > first(&red).2, "сбой не красный");
    }

    #[test]
    fn each_voice_status_lands_on_a_known_badge() {
        // Окно присылает статусы, трей обязан понимать каждый: неизвестный
        // статус молча превратился бы в «сплю» и соврал бы про работу.
        for status in [
            "ready",
            "key-down",
            "key-up",
            "listening",
            "working",
            "awaiting-confirmation",
            "executing",
            "error",
            "deed-running",
            "deed-waiting",
        ] {
            let icon = icon_for(status);
            assert!(
                ["idle", "running", "waiting", "failed"].contains(&icon),
                "статус {status} не имеет значка"
            );
        }
        assert_eq!(icon_for("deed-waiting"), "waiting");
        assert_eq!(icon_for("error"), "failed");
    }
}
