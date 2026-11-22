//! Расписания: когда автоматизация должна сработать — и почему ровно один раз.
//!
//! Главная ошибка расписаний — не «не сработало», а «сработало дважды»: таймер
//! срабатывает при открытии, при возврате из сна и при перезапуске, и одно и то
//! же дело уходит два раза. Человек видит два письма, две отправки, два
//! перевода — и перестаёт доверять автоматизации навсегда.
//!
//! Поэтому здесь две вещи, и порознь они бесполезны:
//!
//!  * **окно запуска** — расписание «каждый день в 09:00» живёт в минуте 09:00,
//!    а не «когда таймер проснулся». Если момент пропущен (компьютер спал),
//!    решает человек: сделать или пропустить (шаг 334);
//!  * **метка «уже сработало»** — id запуска в памяти. Два тика на одной минуте
//!    дают один запуск, а не два.
//!
//! Здесь только решение «пора или нет»: оно проверяется тестами без таймеров и
//! без сна. Сам запуск дела — отдельно, в исполнителе.

use serde::{Deserialize, Serialize};

/// Когда расписание срабатывает.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Cadence {
    /// Каждый день в `минута` от полуночи (0..1439).
    Daily,
    /// Каждый час в `минута` от начала часа (0..59).
    Hourly,
}

/// Одно расписание. `id` — имя, которое человек видит; оно же ключ метки.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    /// Что делать — словами человека, не именем функции.
    pub what: String,
    pub cadence: Cadence,
    /// Минута внутри дня или часа: 09:00 — это 540.
    pub minute: u32,
    /// Пауза всех расписаний (отпуск). Одна кнопка — все молчат.
    pub paused: bool,
}

impl Schedule {
    /// Пора ли срабатывать сейчас.
    ///
    /// `now` — минуты с начала эпохи (UTC), как их даёт `now_minutes()`. Так же
    /// считает метка, поэтому окно и метка не расходятся.
    pub fn due_at(&self, now: u64) -> bool {
        if self.paused {
            return false;
        }
        match self.cadence {
            Cadence::Hourly => (now % 60) as u32 == self.minute % 60,
            Cadence::Daily => (now % 1440) as u32 == self.minute % 1440,
        }
    }

    /// Ключ метки: расписание плюс минута, в которую оно сработало.
    ///
    /// В ключе — именно момент, а не только имя: иначе вчерашняя метка не дала
    /// бы сработать сегодня. И именно минута, а не «сейчас»: два тика внутри
    /// одной минуты — это один запуск.
    pub fn stamp(&self, now: u64) -> String {
        format!("run:{}:{}", self.id, now)
    }
}

/// Минуты с начала эпохи — то же время, что в метке.
pub fn now_minutes() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() / 60)
        .unwrap_or(0)
}

/// Решение по времени и по памяти: запускать или нет, и почему.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Decision {
    pub run: bool,
    /// Причина всегда есть — и когда «да», и когда «нет»: молчаливый отказ
    /// неотличим от поломки.
    pub why: String,
}

/// Решает, пора ли, и не сработало ли это расписание уже в эту минуту.
///
/// `done` — проверка метки в памяти (её даёт вызывающий, чтобы функция
/// проверялась без базы). Два тика на одной минуте: первый видит «метки нет» и
/// запускает, второй видит «есть» и молчит.
pub fn decide<F>(schedule: &Schedule, now: u64, done: F) -> Decision
where
    F: Fn(&str) -> bool,
{
    if schedule.paused {
        return Decision {
            run: false,
            why: "расписания на паузе".into(),
        };
    }
    if !schedule.due_at(now) {
        return Decision {
            run: false,
            why: "не время".into(),
        };
    }
    let stamp = schedule.stamp(now);
    if done(&stamp) {
        return Decision {
            run: false,
            why: "уже сработало в эту минуту".into(),
        };
    }
    Decision {
        run: true,
        why: "пора".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn daily(minute: u32) -> Schedule {
        Schedule {
            id: "утренний отчёт".into(),
            what: "собрать отчёт по почте".into(),
            cadence: Cadence::Daily,
            minute,
            paused: false,
        }
    }

    /// Шаг 330: расписание срабатывает ровно один раз, а не два за минуту.
    ///
    /// Это классическая ошибка расписаний: таймер тикает дважды — по «проснись»
    /// и по «прошла минута», — и дело уходит два раза. Метка на минуту делает
    /// второй тик пустым.
    #[test]
    fn two_ticks_in_the_same_minute_do_not_run_the_job_twice() {
        let schedule = daily(540); // 09:00
        // Минута 09:00 конкретного дня: 20000-е сутки с эпохи.
        let now = 20_000 * 1440 + 540;
        // Метки нет — запуск.
        let first = decide(&schedule, now, |_| false);
        assert!(first.run, "первый тик запускает");
        // Метка есть — второй тик молчит, и говорит почему.
        let second = decide(&schedule, now, |stamp| stamp == schedule.stamp(now));
        assert!(!second.run, "второй тик в ту же минуту не должен запускать");
        assert!(second.why.contains("уже сработало"), "причина названа: {}", second.why);
    }

    /// Та же ошибка через сутки: вчерашняя метка не должна глушить сегодняшний
    /// запуск. Иначе «каждый день» тихо становится «один раз навсегда».
    #[test]
    fn yesterdays_stamp_does_not_silence_today() {
        let schedule = daily(540);
        let yesterday = 20_000 * 1440 + 540;
        let today = yesterday + 1440;
        let done = |stamp: &str| stamp == schedule.stamp(yesterday);
        assert!(!decide(&schedule, yesterday, done).run, "вчера уже было");
        assert!(decide(&schedule, today, done).run, "сегодня — снова запуск");
    }

    /// Две автоматизации на одном времени — разные дела: метка одной не должна
    /// глушить другую. Ключ включает имя, а не только минуту.
    #[test]
    fn two_schedules_at_the_same_time_do_not_block_each_other() {
        let first = daily(540);
        let second = Schedule {
            id: "проверка почты".into(),
            ..first.clone()
        };
        let now = 20_000 * 1440 + 540;
        // Первое уже сработало.
        let done = |stamp: &str| stamp == first.stamp(now);
        assert!(!decide(&first, now, done).run, "первое сработало");
        assert!(
            decide(&second, now, done).run,
            "второе — другое дело, и метка первого его не касается"
        );
    }

    /// Вне минуты запуска — молчит, и это тоже названо, а не пустота.
    #[test]
    fn outside_its_minute_the_schedule_waits() {
        let schedule = daily(540);
        let now = 20_000 * 1440 + 541; // 09:01
        let decision = decide(&schedule, now, |_| false);
        assert!(!decision.run);
        assert_eq!(decision.why, "не время");
    }

    /// Пауза сильнее времени: отпуск значит «молчать», а не «молчать, пока не
    /// совпадёт минута». И причина названа словом, а не пустотой.
    #[test]
    fn a_paused_schedule_never_runs_and_says_why() {
        let schedule = Schedule {
            paused: true,
            ..daily(540)
        };
        let now = 20_000 * 1440 + 540;
        let decision = decide(&schedule, now, |_| false);
        assert!(!decision.run);
        assert!(decision.why.contains("паузе"), "причина: {}", decision.why);
    }

    /// Каждый час — своя минута внутри часа, и в сутках таких окон 24.
    #[test]
    fn hourly_matches_once_per_hour() {
        let schedule = Schedule {
            id: "напоминание".into(),
            what: "напомнить про воду".into(),
            cadence: Cadence::Hourly,
            minute: 15,
            paused: false,
        };
        let base = 20_000 * 1440;
        let hits: Vec<u64> = (0..1440u64)
            .map(|m| base + m)
            .filter(|now| schedule.due_at(*now))
            .collect();
        assert_eq!(hits.len(), 24, "ровно 24 раза в сутки, а не 25 и не 23");
    }

    /// Метка — про момент, а не про имя: она годится и как ключ в памяти,
    /// и как ответ на вопрос «а в эту минуту уже?».
    #[test]
    fn the_stamp_names_the_moment_not_only_the_job() {
        let schedule = daily(540);
        let now = 20_000 * 1440 + 540;
        assert_eq!(schedule.stamp(now), format!("run:утренний отчёт:{now}"));
        assert_ne!(schedule.stamp(now), schedule.stamp(now + 1));
    }
}

/// Проверка и запуск через настоящую память.
///
/// `decide` проверяется без базы; здесь — то, чем приложение пользуется:
/// метка «уже сработало» живёт фактом в памяти и переживает перезапуск
/// (шаг 328: иначе расписание срабатывало бы заново при каждом старте).
///
/// Метки старше суток забываются: иначе факты копились бы по штуке в минуту
/// на каждое расписание. Чистка идёт здесь, а не по таймеру, — в тот момент,
/// когда метка всё равно нужна.
pub fn take(memory: &crate::memory::Memory, schedule: &Schedule, now: u64) -> Decision {
    let prefix = format!("run:{}:", schedule.id);
    // Старые метки этого расписания — вон: память помнит «сработало ли в эту
    // минуту», а не «срабатывало ли когда-нибудь».
    for (key, _) in memory.facts_with_prefix(&prefix) {
        let minute = key.rsplit(':').next().and_then(|m| m.parse::<u64>().ok());
        if minute.is_none_or(|minute| now.saturating_sub(minute) > 1440) {
            let _ = memory.forget(&key);
        }
    }
    let decision = decide(schedule, now, |stamp| memory.fact(stamp).is_some());
    if decision.run {
        // Метка пишется ДО дела, а не после: падение посреди работы не должно
        // приводить к повторному запуску в ту же минуту — иначе ошибка в деле
        // превращается в петлю повторов.
        let _ = memory.remember(&schedule.stamp(now), "запущено");
    }
    decision

    /// Метка в настоящей памяти: то же расписание, та же минута, два вызова —
    /// один запуск. И память переживает «перезапуск»: новый объект `Memory` на
    /// том же файле метку видит, иначе расписание срабатывало бы при каждом
    /// старте приложения (шаг 328).
    #[test]
    fn the_stamp_lives_in_memory_and_survives_a_restart() {
        let dir = std::env::temp_dir().join(format!(
            "zshelper-schedule-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("memory.db");
        let schedule = daily(540);
        let now = 20_000 * 1440 + 540;

        let first = {
            let memory = crate::memory::Memory::open(path.clone()).unwrap();
            take(&memory, &schedule, now)
        };
        assert!(first.run, "первый запуск");

        // «Перезапуск»: другое соединение к тому же файлу.
        let memory = crate::memory::Memory::open(path.clone()).unwrap();
        let second = take(&memory, &schedule, now);
        assert!(!second.run, "после перезапуска в ту же минуту — не запускать");
        assert!(second.why.contains("уже сработало"));

        drop(memory);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Старая метка убирается, а не копится: память помнит «в эту минуту», а
    /// не «когда-нибудь». Проверяем и то, что свежая метка остаётся.
    #[test]
    fn stale_stamps_are_forgotten_and_fresh_ones_stay() {
        let dir = std::env::temp_dir().join(format!(
            "zshelper-schedule-stale-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let memory = crate::memory::Memory::open(dir.join("memory.db")).unwrap();
        let schedule = daily(540);
        let now = 20_000 * 1440 + 540;
        memory
            .remember(&schedule.stamp(now - 5_000), "запущено")
            .unwrap();

        let decision = take(&memory, &schedule, now);
        assert!(decision.run, "старая метка не глушит сегодняшний запуск");
        assert!(
            memory.fact(&schedule.stamp(now - 5_000)).is_none(),
            "старая метка убрана"
        );
        assert!(
            memory.fact(&schedule.stamp(now)).is_some(),
            "новая метка записана"
        );

        drop(memory);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
