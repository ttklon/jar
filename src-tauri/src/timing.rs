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

/// Момент, когда окно впервые показало экран. Второй засечки без первой не бывает:
/// «окно готово» до входа в `main` — это не наш старт, а чужая секунда.
static WINDOW_READY: OnceLock<Instant> = OnceLock::new();

/// Момент, когда приложение проснулось из трея. `None` — ещё ни разу.
///
/// Зачем отдельно от `START`. Первый запуск читает модель с диска, поднимает
/// реестр и создаёт окно; возврат из трея уже ничего этого не делает, и мерять его
/// той же засечкой значит складывать несравнимое. Тёплый старт — это «сколько ждать,
/// пока окно снова покажется», и у него свой порог (шаг 399): полторы секунды.
static RESUMED: OnceLock<Instant> = OnceLock::new();

/// Обещанный тёплый старт, секунды (шаг 399).
///
/// Отдельно от `idle::WAKE_BUDGET_MS`: то порог подъёма выгруженного движка, а
/// здесь — показ уже существующего окна. Одинакое число у разных обещаний — это
/// способ потом перепутать, что именно нарушено.
pub const RESUME_BUDGET_S: f64 = 1.5;

/// Поставить засечку. Вызывается один раз, в самом начале `main`.
///
/// Повторный вызов ничего не меняет: засечка одна на процесс, иначе «старт»
/// стал бы зависеть от того, кто позвал последним.
pub fn mark_start() {
    let _ = START.set(Instant::now());
}

/// Сколько прошло с запуска. `None` — засечку не ставили (это не ошибка:
/// библиотечный запуск и тесты живут без неё).
///
/// Если окно уже показалось, ответ — время **до окна**, а не до сию секунды: иначе
/// число росло бы с каждым открытием «Состояния», и «холодный старт 3 с» через час
/// работы выглядел бы как 3600 с.
pub fn since_start() -> Option<std::time::Duration> {
    let start = *START.get()?;
    match WINDOW_READY.get() {
        Some(ready) => Some(ready.duration_since(start)),
        None => Some(start.elapsed()),
    }
}

/// Отметить, что окно показало первый экран. Повторный вызов ничего не меняет:
/// старт случается один раз, и переписывать его задним числом нельзя.
pub fn mark_window_ready() {
    let _ = WINDOW_READY.set(Instant::now());
}

/// Сколько прошло до готового окна. `None` — либо засечки не было, либо окно ещё
/// не показалось: врать «0 с» в этом случае нельзя.
pub fn to_window() -> Option<std::time::Duration> {
    let start = *START.get()?;
    let ready = *WINDOW_READY.get()?;
    Some(ready.duration_since(start))
}

/// Отметить возврат из трея. Каждый возврат — свой замер: тёплый старт меряется
/// заново, а не один раз за жизнь процесса.
pub fn mark_resumed() {
    let _ = RESUMED.set(Instant::now());
}

/// Сколько прошло с последнего возврата из трея. `None` — ещё не возвращались.
pub fn since_resume() -> Option<std::time::Duration> {
    RESUMED.get().map(|resumed| resumed.elapsed())
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

    /// Шаги 381/399: «до окна» — это отдельное число, и оно не растёт со временем.
    ///
    /// Главная ловушка: если `since_start` после готовности окна продолжал бы
    /// считать до текущей секунды, то через час работы отчёт показывал бы 3600 с
    /// «старта», и регрессию было бы не отличить от бездействия.
    #[test]
    fn the_start_stops_at_the_window_and_does_not_grow() {
        mark_start();
        std::thread::sleep(std::time::Duration::from_millis(30));
        mark_window_ready();
        let at_window = to_window().expect("окно отмечено");
        std::thread::sleep(std::time::Duration::from_millis(50));

        // Время до окна замерло: оно не растёт со временем после готовности.
        assert_eq!(
            since_start(),
            Some(at_window),
            "старт — это время до окна, а не до текущей секунды"
        );
        assert!(
            at_window >= std::time::Duration::from_millis(30),
            "до окна прошло не меньше тридцати миллисекунд: {at_window:?}"
        );

        // Повторная отметка окна не переписывает старт: он был один.
        mark_window_ready();
        assert_eq!(since_start(), Some(at_window));
    }

    #[test]
    fn a_warm_return_has_its_own_clock_and_its_own_threshold() {
        assert!(
            since_resume().is_none(),
            "до первого возврата тёплого старта нет — это не ноль секунд"
        );

        mark_resumed();
        let after = since_resume().expect("возврат отмечен");
        assert!(after < std::time::Duration::from_secs(1));

        // Порог тёплого старта — отдельное обещание, а не порог движка.
        assert!((RESUME_BUDGET_S - 1.5).abs() < f64::EPSILON);
        assert_ne!(
            RESUME_BUDGET_S,
            crate::idle::WAKE_BUDGET_MS as f64 / 1000.0,
            "два разных обещания не должны совпадать случайно"
        );
    }
}
