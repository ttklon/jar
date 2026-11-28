//! Занят ли экран целиком — сейчас (шаги 444/455).
//!
//! Читаем окно переднего плана и сравниваем его прямоугольник с монитором.
//! Способ намеренно грубый: точный ответ даёт `SHQueryUserNotificationState`, но
//! он требует COM и ведёт себя по-разному в играх и конференциях. Нам нужно не
//! «игра это или нет», а «занимает ли чужое окно весь экран» — этого хватает,
//! чтобы не мешать.
//!
//! Ошибка чтения — `false`: не мешать нечему, и догадка хуже обычной работы.

#[cfg(windows)]
pub fn fullscreen_now() -> bool {
    use windows_sys::Win32::Foundation::RECT;
    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, IsWindowVisible,
    };

    let handle = unsafe { GetForegroundWindow() };
    if handle.is_null() || unsafe { IsWindowVisible(handle) } == 0 {
        return false;
    }

    let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    if unsafe { GetWindowRect(handle, &mut rect) } == 0 {
        return false;
    }

    let monitor = unsafe { MonitorFromWindow(handle, MONITOR_DEFAULTTONEAREST) };
    if monitor.is_null() {
        return false;
    }
    let mut info: MONITORINFO = unsafe { std::mem::zeroed() };
    info.cbSize = u32::try_from(std::mem::size_of::<MONITORINFO>()).unwrap_or(0);
    if unsafe { GetMonitorInfoW(monitor, &mut info) } == 0 {
        return false;
    }

    // Допуск в 2 пикселя: игры и браузеры в полном экране иногда на пиксель
    // меньше монитора, и это не «окно».
    let screen = info.rcMonitor;
    let slack = 2;
    (rect.left <= screen.left + slack)
        && (rect.top <= screen.top + slack)
        && (rect.right >= screen.right - slack)
        && (rect.bottom >= screen.bottom - slack)
}

#[cfg(not(windows))]
pub fn fullscreen_now() -> bool {
    false
}

#[cfg(test)]
mod tests {
    /// Правило то же, что в `fullscreen_now`: его и проверяем отдельно, чтобы
    /// ошибка в допуске не зависела от живой Windows.
    pub fn covers(window: (i32, i32, i32, i32), screen: (i32, i32, i32, i32)) -> bool {
        let slack = 2;
        window.0 <= screen.0 + slack
            && window.1 <= screen.1 + slack
            && window.2 >= screen.2 - slack
            && window.3 >= screen.3 - slack
    }

    #[test]
    fn a_maximized_window_is_not_fullscreen() {
        // Задача-панель и заголовок: до низа экрана не достаёт.
        assert!(!covers((0, 0, 1920, 1000), (0, 0, 1920, 1080)));
    }

    #[test]
    fn a_game_covering_the_screen_with_border_is_fullscreen() {
        assert!(covers((-1, -1, 1921, 1081), (0, 0, 1920, 1080)));
    }

    #[test]
    fn a_window_on_another_monitor_is_not_fullscreen_of_this_one() {
        assert!(!covers((1920, 0, 3840, 1080), (0, 0, 1920, 1080)));
    }

    #[cfg(not(windows))]
    #[test]
    fn off_windows_we_do_not_guess() {
        assert!(!fullscreen_now());
    }
}
