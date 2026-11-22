//! Простой движка: когда его отпускать и почему это не ломает разговор.
//!
//! Движок — это процесс `llama-server` с моделью в памяти: гигабайты, которые
//! занимают видеопамять и ОЗУ всё время, пока приложение открыто. Человек говорит
//! фразу раз в час, а движок в это время «висит готовым» и ест память. Отсюда шаг
//! 385/398: по простою движок выгружается, а перед следующим разговором поднимается
//! снова.
//!
//! Здесь только правило, без процессов: что считать простоем и сколько его ждать.
//! Так видно, что решает оно, а не случайность, и это можно проверить без машины.
//!
//! Почему не «выгружать сразу, как ответил»: повторный запуск — это секунды до
//! первого токена (файл модели читается с диска). Разговор из двух фраз подряд не
//! должен платить за это дважды. Порог — компромисс: короткая пауза человека не
//! трогает движок, длинная — освобождает память.

use std::time::{Duration, Instant};

/// Сколько движок живёт без обращения к нему.
///
/// Десять минут: короче — выгрузка успевала бы случиться между фразами одного
/// разговора (человек отошёл за чаем), длиннее — память занята зря. Ноль или
/// отрицательное значение в настройках означает «не выгружать»: это выбор человека,
/// а не повод спорить.
pub const IDLE_AFTER: Duration = Duration::from_secs(10 * 60);

/// Предел подъёма, который мы обещаем: не больше двух секунд (шаг 385).
///
/// Это не замер, а обещание, против которого меряем: `wake_ms` в статусе движка
/// показывает настоящее время подъёма, и если оно больше — это видно числом, а не
/// на словах «долго».
pub const WAKE_BUDGET_MS: u64 = 2_000;

/// Когда движок трогали в последний раз и сколько ждать до выгрузки.
#[derive(Debug, Clone)]
pub struct Idle {
    after: Option<Duration>,
    last: Instant,
}

impl Idle {
    /// Новое правило. `after` — `None`, если выгрузка выключена человеком.
    pub fn new(after: Option<Duration>) -> Self {
        Self {
            after,
            last: Instant::now(),
        }
    }

    /// Отметить обращение к движку: продлить жизнь.
    pub fn touch(&mut self) {
        self.last = Instant::now();
    }

    /// Пора отпускать? `false`, если выгрузка выключена.
    ///
    /// Отдельным вопросом, а не «останови, если…»: решает вызывающий, и решение
    /// видно в одном месте.
    pub fn expired(&self) -> bool {
        match self.after {
            Some(after) => self.last.elapsed() >= after,
            None => false,
        }
    }

    /// Сколько прошло с последнего обращения — для честного «почему выгрузил».
    pub fn idle_for(&self) -> Duration {
        self.last.elapsed()
    }

    /// Сколько ещё ждать до выгрузки. `None` — выгрузка выключена.
    pub fn left(&self) -> Option<Duration> {
        self.after
            .map(|after| after.saturating_sub(self.last.elapsed()))
    }
}

impl Default for Idle {
    fn default() -> Self {
        Self::new(Some(IDLE_AFTER))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_engine_is_not_released() {
        let idle = Idle::default();

        assert!(!idle.expired(), "только что запущенный движок отпускать нечего");
        assert!(
            idle.left().is_some_and(|left| left > Duration::ZERO),
            "время до выгрузки должно быть положительным"
        );
    }

    #[test]
    fn the_threshold_is_a_choice_not_a_constant() {
        // Нулевой порог — «выгружай сразу»: правило работает и с ним.
        let idle = Idle::new(Some(Duration::ZERO));

        assert!(idle.expired());
    }

    #[test]
    fn a_switched_off_release_never_fires() {
        let idle = Idle::new(None);

        // Даже спустя сколько угодно времени: человек сказал «не выгружай».
        assert!(!idle.expired());
        assert_eq!(idle.left(), None, "выключенная выгрузка не обещает срок");
    }

    #[test]
    fn touching_the_engine_extends_its_life() {
        let mut idle = Idle::new(Some(Duration::from_secs(60)));
        // Сдвигаем «последнее обращение» в прошлое, чтобы простой уже наступил.
        idle.last = Instant::now() - Duration::from_secs(120);
        assert!(idle.expired(), "простой должен был наступить");

        idle.touch();

        assert!(!idle.expired(), "обращение к движку продлевает ему жизнь");
        assert!(idle.idle_for() < Duration::from_secs(1));
    }

    #[test]
    fn a_fresh_engine_is_not_released_right_after_start() {
        // Движок запускали минуту: таймер тикал всё это время, но простой — это
        // время без обращения, а не время с запуска. Без отметки первый же статус
        // выгрузил бы только что поднятый движок.
        let mut idle = Idle::new(Some(Duration::from_secs(60)));
        idle.last = Instant::now() - Duration::from_secs(600);
        assert!(idle.expired());

        idle.touch();
        let left = idle.left().unwrap_or_default();
        assert!(left >= Duration::from_secs(59), "после запуска ждать почти весь срок");
    }

    #[test]
    fn a_long_idle_is_named_in_the_reason() {
        let mut idle = Idle::new(Some(Duration::from_secs(60)));
        idle.last = Instant::now() - Duration::from_secs(600);

        let idle_for = idle.idle_for();
        assert!(idle_for >= Duration::from_secs(600));
        // Причина для человека — числом: «простоял 10 минут», а не «давно».
        assert!(idle_for.as_secs() / 60 >= 10);
    }
}
