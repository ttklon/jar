//! Пауза: «сейчас не надо» — одна кнопка, и она честная (шаг 441).
//!
//! Пауза — не «выключено навсегда» и не «закрыть окно». Три правила, и каждое
//! проверяется:
//!
//!  1. **пауза не теряет уже сделанное**: дело, которое шло, встаёт на шаге — но
//!     не исчезает молча;
//!  2. **пауза не выключает то, что человек не просил**: расписания, горячие
//!     клавиши и микрофон — да; модель, память и настройки — нет. Иначе «пауза»
//!     превращается в «сброс настроек»;
//!  3. **выход из паузы не запускает пропущенное скопом**: спрашиваем по одному
//!     (то же правило, что после сна и после игры).

use serde::{Deserialize, Serialize};

/// Состояние паузы.
///
/// `Default` — «не на паузе»: приложение стартует работающим, а не
/// заторможенным.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Pause {
    pub paused: bool,
    /// Когда поставили — миллисекунды от старта.
    pub since_ms: i64,
}

/// Что пауза останавливает.
pub fn stops() -> Vec<&'static str> {
    vec![
        "расписания: не запускаются, а не «запустятся потом все разом»",
        "горячие клавиши: не перехватывают, игра и работа получают их обратно",
        "микрофон: выключается — иначе «на паузе» означает «записывает»",
        "новые фразы: не начинаются; начатые встают на шаге, а не рвутся посередине",
    ]
}

/// Что пауза **не** трогает.
///
/// Список короткий и намеренный: человек, который нажал «пауза», не просил
/// ничего удалять.
pub fn keeps() -> Vec<&'static str> {
    vec![
        "память и журнал: остаются на месте и читаются",
        "скачанная модель: заново качать не придётся",
        "настройки: экран, тема, язык",
        "уже выполненные шаги: не откатываются — журнал помнит, кто их сделал",
    ]
}

/// Текст паузы для человека. Пусто — не на паузе.
pub fn say(state: Pause, now: i64, missed: u32) -> String {
    if !state.paused {
        return String::new();
    }
    let minutes = (now.saturating_sub(state.since_ms)) / 60_000;
    let head = if minutes < 1 {
        "на паузе".to_string()
    } else {
        format!("на паузе {minutes} мин")
    };
    if missed == 0 {
        return format!("{head}: расписания и клавиши не работают, память и модель на месте");
    }
    format!("{head}: пропущено {missed}. При снятии с паузы спрошу по одному — не запущу всё разом")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pause_is_named_with_its_length() {
        let state = Pause {
            paused: true,
            since_ms: 0,
        };
        assert!(say(state, 30_000, 0).starts_with("на паузе:"));
        assert!(say(state, 5 * 60_000, 0).starts_with("на паузе 5 мин:"));
    }

    #[test]
    fn no_pause_says_nothing() {
        assert!(say(Pause::default(), 100_000, 3).is_empty());
    }

    #[test]
    fn missed_deeds_are_not_run_all_at_once() {
        let said = say(
            Pause {
                paused: true,
                since_ms: 0,
            },
            10 * 60_000,
            4,
        );
        assert!(said.contains("пропущено 4"), "{said}");
        assert!(said.contains("по одному"), "не «всё разом»: {said}");
    }

    #[test]
    fn a_pause_keeps_the_model_and_memory() {
        let keeps = keeps().join("; ");
        assert!(keeps.contains("модель"), "{keeps}");
        assert!(keeps.contains("память"), "{keeps}");
        assert!(stops().join("; ").contains("микрофон"));
    }
}
