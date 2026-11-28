//! Место окна: восстановить и не потерять (шаг 228 / шаг 66).
//!
//! Почему это частый настоящий дефект. Человек отключил внешний монитор или
//! поменял масштаб с 150% на 100%. Приложение запомнило **логические**
//! координаты старого экрана и на новом открывается за пределами рабочего стола:
//! окна не видно, а в панели задач оно есть. Человек решает, что программа не
//! запустилась.
//!
//! Два правила:
//!
//!  1. **сохраняем место при закрытии** — иначе восстанавливать нечего;
//!  2. **проверяем, куда его вернуть**: если видно меньше четверти окна, окно
//!     переезжает на главный монитор с причиной «окно было за пределами
//!     экранов», а не молча.
//!
//! Мониторов не знаем — **не двигаем**: догадка о чужих экранах хуже, чем
//! сохранённое место.

use serde::{Deserialize, Serialize};

/// Прямоугольник в логических координатах.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Box4 {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Сколько окна должно быть видно, чтобы считать его «на месте».
///
/// Не целиком: человек вправе сдвинуть окно за край, оставив полосу. Но меньше
/// четверти — это уже не решение, а потеря: окно не найти.
pub const VISIBLE_PART: f64 = 0.25;

/// Где лежит место окна.
pub fn file() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("ZShelper").join("window.json")
}

/// Сохранить место окна.
pub fn save(placed: Box4) -> Result<(), String> {
    let path = file();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| format!("папка окна: {error}"))?;
    }
    let text = serde_json::to_string(&placed).map_err(|error| error.to_string())?;
    std::fs::write(&path, format!("{text}\n")).map_err(|error| format!("запись места окна: {error}"))
}

/// Прочитать место. Битый файл — `None`: окно откроется по умолчанию, а не
/// упадёт.
pub fn load() -> Option<Box4> {
    let text = std::fs::read_to_string(file()).ok()?;
    serde_json::from_str::<Box4>(&text).ok()
}

/// Спросить Windows о мониторах.
///
/// `None` — спросить не удалось (не Windows, нет окна, ошибка). Это **не** повод
/// двигать: тогда возвращаем место как есть.
#[cfg(windows)]
pub fn monitors(window: &tauri::Window) -> Option<Vec<Monitor>> {
    let list = window.app_handle().available_monitors().ok()?;
    if list.is_empty() {
        return None;
    }
    Some(
        list.into_iter()
            .map(|monitor| {
                let position = monitor.position();
                let size = monitor.size();
                let monitor_scale = monitor.scale_factor();
                // Приводим физические пиксели к логическим: интерфейс и окно
                // живут в логических, а Windows отдаёт физические.
                crate::window_place::Monitor {
                    x: (position.x as f64 / monitor_scale).round() as i32,
                    y: (position.y as f64 / monitor_scale).round() as i32,
                    width: (size.width as f64 / monitor_scale).round() as u32,
                    height: (size.height as f64 / monitor_scale).round() as u32,
                    primary: false,
                }
            })
            .map(|mut monitor| {
                // Главный — тот, что начинается в нуле: так его видно и без API,
                // которое врёт при разных масштабах.
                if monitor.x == 0 && monitor.y == 0 {
                    monitor.primary = true;
                }
                monitor
            })
            .collect(),
    )
}

#[cfg(not(windows))]
pub fn monitors(_window: &tauri::Window) -> Option<Vec<Monitor>> {
    None
}

/// Монитор в логических координатах.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Monitor {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub primary: bool,
}

/// Видимая доля окна на всех мониторах.
pub fn visible_fraction(window: Box4, monitors: &[Monitor]) -> f64 {
    if window.width == 0 || window.height == 0 {
        return 0.0;
    }
    let area = f64::from(window.width) * f64::from(window.height);
    let mut visible = 0.0;
    for monitor in monitors {
        let left = i64::from(window.x).max(i64::from(monitor.x));
        let top = i64::from(window.y).max(i64::from(monitor.y));
        let right = (i64::from(window.x) + i64::from(window.width))
            .min(i64::from(monitor.x) + i64::from(monitor.width));
        let bottom = (i64::from(window.y) + i64::from(window.height))
            .min(i64::from(monitor.y) + i64::from(monitor.height));
        if right > left && bottom > top {
            visible += ((right - left) * (bottom - top)) as f64;
        }
    }
    (visible / area).min(1.0)
}

/// Куда ставить окно и почему.
///
/// `moved` — пришлось поправить. `why` — словами, если поправили: человек должен
/// увидеть «окно было за пределами экранов», а не решить, что программа сама
/// переехала.
pub fn place(saved: Box4, monitors: &[Monitor]) -> (Box4, bool, String) {
    if monitors.is_empty() {
        return (saved, false, String::new());
    }
    let fraction = visible_fraction(saved, monitors);
    if fraction >= VISIBLE_PART {
        return (saved, false, String::new());
    }
    let main = monitors
        .iter()
        .find(|monitor| monitor.primary)
        .copied()
        .unwrap_or(monitors[0]);
    let width = saved.width.min(main.width);
    let height = saved.height.min(main.height);
    let placed = Box4 {
        x: main.x + (i32::try_from(main.width.saturating_sub(width)).unwrap_or(0)) / 2,
        y: main.y + (i32::try_from(main.height.saturating_sub(height)).unwrap_or(0)) / 2,
        width,
        height,
    };
    (
        placed,
        true,
        format!(
            "окно было за пределами экранов (видно {}%) — вернул на главный монитор",
            (fraction * 100.0).round() as i32
        ),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn primary() -> Monitor {
        Monitor { x: 0, y: 0, width: 1920, height: 1080, primary: true }
    }

    fn second() -> Monitor {
        Monitor { x: 1920, y: 0, width: 2560, height: 1440, primary: false }
    }

    fn window() -> Box4 {
        Box4 { x: 100, y: 100, width: 1200, height: 800 }
    }

    #[test]
    fn a_window_on_screen_is_not_moved() {
        let (placed, moved, why) = place(window(), &[primary(), second()]);
        assert_eq!(placed, window());
        assert!(!moved);
        assert!(why.is_empty(), "нечего объяснять — не двигали");
    }

    #[test]
    fn a_window_from_a_disconnected_monitor_comes_back_with_a_reason() {
        // Внешний монитор отключили: место осталось за правым краем.
        let lost = Box4 { x: 2600, y: 200, width: 1200, height: 800 };
        let (placed, moved, why) = place(lost, &[primary()]);
        assert!(moved);
        assert_eq!(placed.width, 1200, "окно не должно схлопнуться");
        assert!(placed.x >= 0 && placed.y >= 0);
        assert!(why.contains("за пределами экранов"), "{why}");
    }

    #[test]
    fn a_window_taller_than_the_screen_is_fitted_not_cut() {
        // Ноутбук 150% → 100%: окно выше экрана.
        let tall = Box4 { x: 0, y: 0, width: 1200, height: 1600 };
        let (placed, moved, _) = place(tall, &[primary()]);
        assert!(moved);
        assert_eq!(placed.height, 1080, "окно влезает в экран целиком");
    }

    #[test]
    fn a_quarter_visible_is_still_fine() {
        // Человек сам сдвинул окно, оставив полосу — это его решение.
        let edge = Box4 { x: 1700, y: 500, width: 1200, height: 800 };
        assert!(visible_fraction(edge, &[primary()]) > VISIBLE_PART);
        let (_, moved, _) = place(edge, &[primary()]);
        assert!(!moved);
    }

    #[test]
    fn without_monitors_we_do_not_guess() {
        let (placed, moved, why) = place(window(), &[]);
        assert_eq!(placed, window());
        assert!(!moved);
        assert!(why.is_empty());
    }
}
