//! Удержание клавиши: один нажим — одно действие (шаг 460).
//!
//! Держать клавишу — естественное действие: человек нажал, не сработало сразу,
//! подержал. Windows в это время присылает **поток автоповтора**, и без
//! карантина удержание превращается в десяток «нажатий».
//!
//! Для разговора это слышно: каждое новое «нажатие» снова включает запись, и
//! вместо одной фразы получается десяток коротких обрывков.
//!
//! Правило простое: пока клавиша не отпущена, повторные нажатия **не считаются
//! нажимами**. И дребезг (два `down` ближе 50 мс) — тоже один нажим: иначе
//! быстрый двойной щелчок превращается в два дела.

use serde::{Deserialize, Serialize};

/// Состояние клавиши.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct State {
    pub down: bool,
    /// Когда было последнее настоящее нажатие, миллисекунды.
    pub last_down_at: i64,
}

impl Default for State {
    fn default() -> Self {
        // `last_down_at` = очень давно: первое нажатие не должно считаться
        // дребезгом.
        State {
            down: false,
            last_down_at: i64::MIN / 2,
        }
    }
}

/// Карантин против дребезга: два `down` ближе этого — один нажим.
pub const DEBOUNCE_MS: i64 = 50;

/// Обработать событие. `fire` — считать ли это нажатием.
pub fn handle(state: State, down: bool, now: i64) -> (State, bool, &'static str) {
    if !down {
        return (
            State {
                down: false,
                last_down_at: state.last_down_at,
            },
            false,
            "отпущено",
        );
    }

    // Дребезг — первым: при нём `down` уже true, и проверка удержания назвала бы
    // дребезг удержанием. Именно этот порядок был дефектом.
    if now.saturating_sub(state.last_down_at) < DEBOUNCE_MS {
        return (state, false, "дребезг: это тот же нажим");
    }

    if state.down {
        // Автоповтор Windows: клавиша ещё не отпущена. Время нажатия не
        // обновляем — иначе поток повторов бесконечно продлевал бы карантин.
        return (state, false, "удержание: повторы не считаются нажатиями");
    }

    (
        State {
            down: true,
            last_down_at: now,
        },
        true,
        "нажатие",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_press_is_one_action() {
        let (state, fire, said) = handle(State::default(), true, 1_000);
        assert!(fire);
        assert_eq!(said, "нажатие");
        assert!(state.down);
    }

    #[test]
    fn holding_the_key_does_not_fire_again() {
        let (state, fire, _) = handle(State::default(), true, 1_000);
        assert!(fire);
        // Поток автоповтора: через 60, 120, … мс — клавишу не отпускали.
        let mut now = 1_000;
        for _ in 0..5 {
            now += 60;
            let (next, fire, said) = handle(state, true, now);
            assert!(!fire, "автоповтор не должен считаться нажатием");
            assert_eq!(said, "удержание: повторы не считаются нажатиями");
            assert_eq!(next.last_down_at, 1_000, "повторы не продлевают карантин");
        }
    }

    #[test]
    fn release_then_press_is_a_new_press() {
        let (pressed, fire, _) = handle(State::default(), true, 1_000);
        assert!(fire);
        let (released, _, _) = handle(pressed, false, 1_200);
        let (_, fire, _) = handle(released, true, 1_400);
        assert!(fire, "после отпускания нажим снова настоящий");
    }

    #[test]
    fn a_bounce_is_one_press_not_two() {
        let (state, fire, _) = handle(State::default(), true, 1_000);
        assert!(fire);
        let (_, fire, said) = handle(state, true, 1_020);
        assert!(!fire);
        assert_eq!(said, "дребезг: это тот же нажим");
    }
}

/// Карантин клавиши: атомарно, потому что обработчик глобальной клавиши может
/// зваться с другого потока.
///
/// Внутри — то же правило `handle`: без него арифметика времени разъезжается с
/// логикой, и «удержание» перестаёт быть удержанием.
#[derive(Default)]
pub struct Hold(std::sync::Mutex<State>);

impl Hold {
    /// Нажатие/отпускание сейчас. `true` — настоящее нажатие.
    pub fn pressed(&self, down: bool, now: i64) -> bool {
        let Ok(mut guard) = self.0.lock() else {
            // Блокировка отравлена (паника в другом потоке): считаем нажатие
            // настоящим. Пропустить действие хуже, чем сделать его дважды.
            return down;
        };
        let (next, fire, said) = handle(*guard, down, now);
        *guard = next;
        if down {
            tracing::debug!(%said, fire, "горячая клавиша");
        }
        fire
    }
}

/// Время в миллисекундах от старта системы — без часового пояса и без
/// «перевели часы».
pub fn now_ms() -> i64 {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    let start = START.get_or_init(std::time::Instant::now);
    i64::try_from(start.elapsed().as_millis()).unwrap_or(i64::MAX)
}

#[cfg(test)]
mod hold_tests {
    use super::*;

    #[test]
    fn the_hold_counts_real_presses_across_calls() {
        let hold = Hold::default();
        assert!(hold.pressed(true, 10_000));
        // Автоповтор в пределах удержания — не нажатие.
        assert!(!hold.pressed(true, 10_100));
        assert!(!hold.pressed(true, 10_200));
        assert!(!hold.pressed(false, 10_300));
        // Отпустили — новый нажим настоящий.
        assert!(hold.pressed(true, 11_000));
    }
}
