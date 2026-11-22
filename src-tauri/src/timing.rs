//! Засечка старта: сколько прошло от запуска процесса до «окно готово».
//!
//! Зачем отдельный модуль, а не `Instant::now()` в двух местах. Порог «холодный
//! старт ≤ 3 с» (шаг 381) проверяем, только если известно, **от чего** считать.
//! От первого кадра окна — это уже не старт; от загрузки реестра — ещё не
//! старт. Считаем от входа в `main`: всё, что до окна, — наша забота.
//!
//! Часы — `OnceLock<Instant>`, а не системное время: `Instant` монотонны и не
//! прыгают при переводе часов, а старт меряется секундами.

use std::sync::OnceLock;
use std::time::Instant;

static START: OnceLock<Instant> = OnceLock::new();

/// Поставить засечку. Вызывается один раз, в самом начале `main`.
///
/// Повторный вызов ничего не меняет: засечка одна на процесс, иначе «старт»
/// стал бы зависеть от того, кто позвал последним.
pub fn mark_start() {
    let _ = START.set(Instant::now());
}

/// Сколько прошло с запуска. `None` — засечку не ставили (это не ошибка:
/// библиотечный запуск и тесты живут без неё).
pub fn since_start() -> Option<std::time::Duration> {
    START.get().map(|start| start.elapsed())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Шаг 381: засечка одна на процесс и не переписывается.
    ///
    /// Иначе «старт» зависел бы от того, кто позвал последним, и замер
    /// показывал бы не то.
    #[test]
    fn the_start_mark_is_set_once_and_keeps_ticking() {
        mark_start();
        let first = since_start().expect("засечка поставлена");
        std::thread::sleep(std::time::Duration::from_millis(20));
        mark_start();
        let second = since_start().expect("засечка та же");
        assert!(
            second >= first,
            "время не пошло назад: {first:?} -> {second:?}"
        );
        assert!(
            second >= std::time::Duration::from_millis(20),
            "прошло не меньше двадцати миллисекунд: {second:?}"
        );
    }
}
