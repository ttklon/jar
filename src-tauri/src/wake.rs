//! Что делать после сна: движок перезапускается сам, фраза не теряется.
//!
//! Шаг 142. Ноутбук засыпает постоянно — это не сбой, а обычный режим. Но после
//! сна возможны три разных мира, и путать их дорого:
//!
//!  * **движок жив и отвечает** — ничего не делаем. Перезапускать работающий
//!    движок значит выбросить загруженную в память модель и заставить человека
//!    ждать её снова;
//!  * **движок был, но умер** (Windows часто убивает sidecar при пробуждении) —
//!    поднимаем заново. Это и есть обещание шага: движок перезапускается сам;
//!  * **движка не было** — не запускаем. «Сам» относится к тому, что человек уже
//!    включил, а не к нашему желанию поработать.
//!
//! И отдельно — **фраза**. Она не теряется не потому, что мы её где-то держим
//! после сна, а потому, что она не в движке: сказанное живёт в поле экрана и в
//! черновике (шаг 26). Этот модуль ничего не «спасает» — он просто не должен
//! сделать вид, что можно начать разговор с мёртвым движком.
//!
//! Решение отдельной чистой функцией: проверить его можно без Windows и без
//! настоящего сна, а ошибиться здесь легко — именно такие проверки обычно
//! пишут внутри обработчика события, где их никто не увидит.

/// Что было до сна и что стало после.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Before {
    /// Движок шёл и был записан как запущенный.
    Running,
    /// Движка не было.
    Stopped,
}

/// Что отвечает движок сейчас.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum After {
    /// Процесс жив **и** ответил на проверку здоровья.
    Alive,
    /// Процесс жив, но не ответил: завис, а не умер.
    Silent,
    /// Процесса нет.
    Dead,
}

/// Что сделать.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WakeAction {
    /// Ничего: движок отвечает.
    Nothing,
    /// Поднять заново: он был и умер.
    Restart,
    /// Не запускать: его и не было.
    Leave,
    /// Было и зависло — остановить и поднять. Оставлять висеть нельзя: он
    /// держит порт и память, а новый на тот же порт не встанет.
    RestartStuck,
}

/// Решение. Порядок веток — это и есть правила шага.
pub fn after_wake(before: Before, after: After) -> WakeAction {
    match (before, after) {
        // Отвечает — не трогаем, даже если до сна «не было»: значит, его поднял
        // кто-то другой (или человек), и это не наше дело.
        (_, After::Alive) => WakeAction::Nothing,
        (Before::Stopped, After::Dead) => WakeAction::Leave,
        (Before::Stopped, After::Silent) => WakeAction::Leave,
        (Before::Running, After::Dead) => WakeAction::Restart,
        // Зависший процесс надо сначала убрать: иначе порт занят и новый движок
        // не встанет, а человек увидит «перезапускаю» и не дождётся ничего.
        (Before::Running, After::Silent) => WakeAction::RestartStuck,
    }
}

/// Словами для журнала: что случилось, а не код действия.
pub fn explain(action: WakeAction) -> &'static str {
    match action {
        WakeAction::Nothing => "после сна движок отвечает — не трогаю",
        WakeAction::Restart => "после сна движок умер — поднимаю заново",
        WakeAction::Leave => "после сна движка не было — сам не запускаю",
        WakeAction::RestartStuck => "после сна движок завис — останавливаю и поднимаю заново",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Главное обещание шага: включённый движок переживает сон.
    #[test]
    fn an_engine_that_died_during_sleep_comes_back_by_itself() {
        assert_eq!(after_wake(Before::Running, After::Dead), WakeAction::Restart);
    }

    /// А тот, который выключен, — не включается. «Сам» относится к тому, что
    /// человек уже включил, и незачем приписывать себе лишнее.
    #[test]
    fn an_engine_that_was_off_stays_off() {
        assert_eq!(after_wake(Before::Stopped, After::Dead), WakeAction::Leave);
        // Даже если процесс висит, но его не включали, — не наше дело.
        assert_eq!(after_wake(Before::Stopped, After::Silent), WakeAction::Leave);
    }

    /// Живой движок не перезапускается: это выбросило бы модель из памяти и
    /// заставило человека ждать её снова.
    #[test]
    fn a_working_engine_is_left_alone() {
        assert_eq!(after_wake(Before::Running, After::Alive), WakeAction::Nothing);
        // И даже если до сна он «не было» — раз отвечает, значит, работает.
        assert_eq!(after_wake(Before::Stopped, After::Alive), WakeAction::Nothing);
    }

    /// Зависший — отдельный случай: порт занят, и без остановки новый не встанет.
    #[test]
    fn a_stuck_engine_is_stopped_before_the_new_one() {
        assert_eq!(
            after_wake(Before::Running, After::Silent),
            WakeAction::RestartStuck
        );
        assert_ne!(
            after_wake(Before::Running, After::Silent),
            after_wake(Before::Running, After::Dead),
            "зависший и умерший — разные случаи: одного надо сначала убрать"
        );
    }

    /// Каждое действие объяснено словами, и объяснения разные: одинаковые
    /// подписи у разных решений — способ перестать их различать.
    #[test]
    fn every_action_says_what_it_did() {
        let texts: Vec<&str> = [
            WakeAction::Nothing,
            WakeAction::Restart,
            WakeAction::Leave,
            WakeAction::RestartStuck,
        ]
        .iter()
        .map(|action| explain(*action))
        .collect();

        assert!(texts.iter().all(|text| !text.is_empty()));
        let unique: std::collections::BTreeSet<&&str> = texts.iter().collect();
        assert_eq!(unique.len(), texts.len(), "подписи не должны совпадать");
    }
}
