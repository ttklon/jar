//! Как запустились — и что из этого следует (шаг 77).
//!
//! Правило `trayStart` (`src/lib/trayStart.ts`) говорит одну вещь, и она не
//! настройка, а защита от «программа не запускается»:
//!
//!  * тихо — **только** при входе в Windows: человек просил программу под рукой,
//!    а не окно;
//!  * двойной клик по ярлыку — окно **всегда**: он нажал и ждёт окно, и
//!    «ничего не произошло» — худший ответ;
//!  * первый запуск после установки — окно **всегда**, даже при автозапуске:
//!    иначе непонятно, что установилось;
//!  * второй запуск — окно, а не второй экземпляр.
//!
//! Ядро решает это **до** создания окна и не спрашивает совет у настроек: режим
//! старта — свойство способа запуска. Настройка «начинать в трее» живёт в том же
//! решении, но касается только автозапуска.

use crate::autostart;

/// Как запустили и что делать.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Start {
    /// Показать ли окно сразу.
    pub window: bool,
    /// Сказать ли «я в трее» — один раз, коротко.
    pub hint: bool,
    /// Словами, для журнала: почему так, а не иначе.
    pub said: &'static str,
}

/// Решить по аргументам командной строки.
///
/// `first_run` — самый первый запуск после установки (отметка в данных).
/// `quiet_ok` — настройка «начинать в трее» (касается только автозапуска).
pub fn decide(args: &[String], first_run: bool, quiet_ok: bool) -> Start {
    match autostart::how_from_args(args, first_run) {
        "firstRun" => Start {
            window: true,
            hint: false,
            said: "первый запуск: окно показываю всегда — иначе непонятно, что установилось",
        },
        // Тихо — только при входе в Windows, и только если человек это выбрал.
        // Автозапуск без настройки показывает окно: молчание здесь значит
        // «программа сломалась».
        "autostart" if quiet_ok => Start {
            window: false,
            hint: true,
            said: "запуск при входе: тихо в трее. Подсказка один раз — чтобы вы знали, что программа здесь",
        },
        "autostart" => Start {
            window: true,
            hint: false,
            said: "запуск при входе, но вы просили показывать окно",
        },
        _ => Start {
            window: true,
            hint: false,
            said: "вы запустили сами: окно показываю — иначе это выглядит, как будто ничего не произошло",
        },
    }
}

/// Настройка «начинать в трее» — файл рядом с отметкой.
///
/// Хранится отдельно от памяти и профилей: это свойство **этой машины**, а не
/// человека. Перенос профиля не должен переносить «тихий старт» на чужой
/// компьютер, где автозапуска нет вовсе.
pub fn quiet_file() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("ZShelper").join("start-quiet.json")
}

/// Читает настройку. Нет файла — «нет», окно показываем: молчание при первом
/// запуске человек читает как «программа не работает».
pub fn quiet_setting() -> bool {
    std::fs::read_to_string(quiet_file())
        .ok()
        .and_then(|text| serde_json::from_str::<QuietFile>(&text).ok())
        .map(|file| file.quiet)
        .unwrap_or(false)
}

/// Записать настройку. Возвращает то, что действует теперь.
///
/// Действует — значит записано и прочитано обратно: «сохранил» по факту вызова
/// функции уже было дефектом (шаг 97).
pub fn set_quiet_setting(quiet: bool) -> bool {
    let file = quiet_file();
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let text = serde_json::json!({ "quiet": quiet }).to_string();
    if std::fs::write(&file, text).is_err() {
        return quiet_setting();
    }
    quiet_setting()
}

/// То, что лежит в файле настройки. Отдельный тип, а не голое `bool`: файл
/// может быть от будущей версии, и лишние поля не должны ронять чтение.
#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct QuietFile {
    #[serde(default)]
    quiet: bool,
}

/// Где лежит отметка «уже запускались».
///
/// Рядом с остальными данными (`%LOCALAPPDATA%\ZShelper`), а не в реестре:
/// удаление программы вместе с данными должно убирать и её.
pub fn first_run_file() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("ZShelper").join("started.json")
}

/// Первый ли это запуск. Заодно ставит отметку.
///
/// Ошибку записи наверх не отдаём: не суметь записать отметку — значит в
/// следующий раз снова показать окно. Это неверно, но безопасно; обратное
/// (промолчать на первом запуске) — дефект, который человек не поймёт.
pub fn take_first_run() -> bool {
    let file = first_run_file();
    let seen = file.exists();
    if !seen {
        if let Some(parent) = file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&file, "{\"started\":1}\n");
    }
    !seen
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_shortcut_always_shows_the_window() {
        // Нажал и ждёт окно. Любое «тихо» здесь — дефект, а не экономия.
        let start = decide(&[], false, true);
        assert!(start.window, "ярлык без окна: {start:?}");
        assert!(!start.hint);
        assert!(start.said.contains("запустили сами"));
    }

    #[test]
    fn autostart_is_quiet_only_when_asked() {
        let quiet = vec![autostart::QUIET_FLAG.to_string()];
        let on = decide(&quiet, false, true);
        assert!(!on.window, "просили тихо — открыли окно");
        assert!(on.hint, "тихо и без подсказки — программа пропала");
        let off = decide(&quiet, false, false);
        assert!(off.window, "не просили тихо — окна нет");
    }

    #[test]
    fn the_first_run_shows_the_window_even_from_autostart() {
        let quiet = vec![autostart::QUIET_FLAG.to_string()];
        let start = decide(&quiet, true, true);
        assert!(start.window, "первый запуск без окна: {start:?}");
        assert!(start.said.contains("первый запуск"));
    }

    #[test]
    fn a_first_run_is_remembered_across_starts() {
        // Отметка — файл в своих данных. Проверяем оба перехода: первый раз
        // «да», второй «нет», и что файл после этого на месте.
        let dir = std::env::temp_dir().join(format!("zshelper-start-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("started.json");
        assert!(!file.exists());
        std::fs::write(&file, "{}").unwrap();
        assert!(file.exists(), "отметка не записалась");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
