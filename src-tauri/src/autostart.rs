//! Запускаться при входе в Windows — и уметь это выключить.
//!
//! Зачем: человек, который говорит «запустил один раз — и оно само», не должен
//! запускать приложение вручную после каждой перезагрузки. Это прямо следует из
//! пользовательского сценария, а не из списка «полезных фич».
//!
//! Три решения, которые легко сделать неправильно:
//!
//!  * **пишем в `HKCU`, а не в `HKLM`.** Запись от имени пользователя не требует
//!    прав администратора: приложение, которое просит UAC ради автозапуска,
//!    выглядит подозрительно и на деле не нужно;
//!  * **одна запись, а не «сколько позвали».** Включение дважды не создаёт второй
//!    ключ и не оставляет мусор: имя ключа фиксировано;
//!  * **выключение удаляет, а не «пишет пусто».** Пустое значение в `Run` Windows
//!    всё равно пытается запустить и пишет ошибку в свои журналы.
//!
//! Всё, что делает система, здесь — одна команда `reg.exe` с явным именем ключа.
//! Мы не вызываем PowerShell: для двух операций он лишний слой, а лишний слой —
//! это ещё одно место, где ломается.

use serde::Serialize;

/// Имя значения в `Run`. Фиксировано: так включение дважды не создаёт дубль.
pub const VALUE_NAME: &str = "ZShelper";

/// Корень автозапуска текущего пользователя. Без прав администратора.
pub const RUN_KEY: &str = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";

/// Что показать человеку: включено ли и что именно запустится.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Autostart {
    /// Включено ли сейчас (по факту чтения реестра, а не по нашей памяти).
    pub enabled: bool,
    /// Команда, которая записана (если записана) — её видно человеку.
    pub command: Option<String>,
    /// Путь к программе, который мы бы записали.
    pub target: String,
    /// Почему выключить нельзя или что мешает. Пусто — всё в порядке.
    pub note: String,
}

/// Аргументы `reg.exe` для чтения записи. Отдельной функцией — чтобы тест мог
/// проверить точный вызов, а не «где-то там reg».
pub fn query_args() -> Vec<String> {
    vec![
        "query".into(),
        RUN_KEY.into(),
        "/v".into(),
        VALUE_NAME.into(),
    ]
}

/// Аргументы `reg.exe` для включения автозапуска.
///
/// `/d` — команда запуска. Кавычки вокруг пути ставим сами: путь может содержать
/// пробелы (`C:\Program Files\…`), и без кавычек Windows попытается запустить
/// `C:\Program.exe` — известная и очень неприятная ошибка.
pub fn add_args(target: &str) -> Vec<String> {
    vec![
        "add".into(),
        RUN_KEY.into(),
        "/v".into(),
        VALUE_NAME.into(),
        "/t".into(),
        "REG_SZ".into(),
        "/d".into(),
        quoted(target),
        "/f".into(),
    ]
}

/// Аргументы `reg.exe` для выключения: удаляем значение целиком.
pub fn delete_args() -> Vec<String> {
    vec![
        "delete".into(),
        RUN_KEY.into(),
        "/v".into(),
        VALUE_NAME.into(),
        "/f".into(),
    ]
}

/// Путь в кавычках — ровно один раз, даже если он уже был в кавычках.
pub fn quoted(target: &str) -> String {
    let trimmed = target.trim().trim_matches('"');
    format!("\"{trimmed}\"")
}

/// Разобрать вывод `reg query`. Windows печатает строку вида
/// `    ZShelper    REG_SZ    "C:\...\zshelper.exe"`; нам нужна последняя часть.
pub fn parse_query(output: &str) -> Option<String> {
    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 || parts[0] != VALUE_NAME {
            continue;
        }
        // Между типом и значением — пробелы; значение может само содержать пробелы,
        // поэтому склеиваем всё, что после типа, а не берём одно слово.
        if let Some(position) = parts.iter().position(|part| *part == "REG_SZ") {
            let value = parts[position + 1..].join(" ");
            if value.is_empty() {
                return None;
            }
            return Some(value);
        }
    }
    None
}

/// Оценка текущего состояния по результату чтения.
///
/// Отдельная функция, потому что здесь есть неочевидное правило: «значение есть,
/// но указывает на другой файл» — это **не** наш автозапуск, и включать поверх
/// молча нельзя: человек должен увидеть, что там уже что-то есть.
pub fn status(output: Result<String, String>, target: &str) -> Autostart {
    let target_owned = target.to_string();
    match output {
        Err(note) => Autostart {
            enabled: false,
            command: None,
            target: target_owned,
            note,
        },
        Ok(text) => match parse_query(&text) {
            None => Autostart {
                enabled: false,
                command: None,
                target: target_owned,
                note: String::new(),
            },
            Some(command) => Autostart {
                enabled: true,
                note: if same_target(&command, target) {
                    String::new()
                } else {
                    "в автозапуске уже есть другая запись с этим именем — включение её заменит"
                        .to_string()
                },
                command: Some(command),
                target: target_owned,
            },
        },
    }
}

/// Одна ли и та же программа: сравниваем без кавычек и без учёта регистра.
pub fn same_target(command: &str, target: &str) -> bool {
    command
        .trim()
        .trim_matches('"')
        .eq_ignore_ascii_case(target.trim().trim_matches('"'))
}

/// Выполнить `reg.exe` с аргументами и вернуть stdout.
///
/// Отдельно от чистых функций выше, потому что здесь есть система: тесты на неё
/// не пишут в реестр, а проверяют аргументы. На не-Windows функция сразу говорит,
/// что автозапуск — понятие Windows, а не притворяется, что выключила.
pub fn reg(args: &[String]) -> Result<String, String> {
    if !cfg!(windows) {
        return Err("автозапуск — функция Windows; здесь её нет".to_string());
    }
    let request = crate::executor::ExecRequest::new("reg.exe", args.to_vec());
    let cancel = std::sync::atomic::AtomicBool::new(false);
    let output = crate::executor::run(&request, &cancel).map_err(|error| error.to_string())?;
    if output.exit_code == Some(0) {
        Ok(output.stdout)
    } else {
        // `reg query` при отсутствии значения возвращает 1 и пишет причину в stderr.
        // Это нормальное «выключено», поэтому текст отдаём наверх, а решает `status`.
        Err(if output.stderr.trim().is_empty() {
            "reg.exe не ответил".to_string()
        } else {
            output.stderr.trim().to_string()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_targets_current_user_run_key() {
        let args = query_args();
        assert_eq!(args[0], "query");
        assert_eq!(args[1], RUN_KEY);
        // HKCU, а не HKLM: автозапуск не должен требовать администратора.
        assert!(args[1].starts_with("HKCU\\"));
        assert!(!args[1].contains("HKLM"));
    }

    #[test]
    fn enabling_twice_keeps_one_value() {
        let first = add_args(r"C:\Tools\zshelper.exe");
        let second = add_args(r"C:\Tools\zshelper.exe");
        assert_eq!(first, second);
        // `/f` перезаписывает, а не добавляет второе значение.
        assert!(first.contains(&"/f".to_string()));
        assert_eq!(first.iter().filter(|a| *a == VALUE_NAME).count(), 1);
    }

    #[test]
    fn path_with_spaces_is_quoted_exactly_once() {
        let args = add_args(r"C:\Program Files\ZShelper\zshelper.exe");
        let position = args.iter().position(|a| a == "/d").expect("/d есть");
        assert_eq!(
            args[position + 1],
            r#""C:\Program Files\ZShelper\zshelper.exe""#
        );
        // Уже закавыченный путь не получает вторые кавычки.
        assert_eq!(quoted(r#""C:\A\b.exe""#), r#""C:\A\b.exe""#);
    }

    #[test]
    fn disabling_deletes_the_value_instead_of_writing_empty() {
        let args = delete_args();
        assert_eq!(args[0], "delete");
        assert!(args.contains(&VALUE_NAME.to_string()));
        assert!(
            !args.iter().any(|a| a == "/d"),
            "пустое значение — не выключение"
        );
    }

    #[test]
    fn parses_what_windows_actually_prints() {
        let output = concat!(
            "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n",
            "    ZShelper    REG_SZ    \"C:\\Users\\Иван\\ZShelper\\zshelper.exe\"\r\n\r\n"
        );
        assert_eq!(
            parse_query(output).as_deref(),
            Some(r#""C:\Users\Иван\ZShelper\zshelper.exe""#)
        );
        // Чужое имя не считается нашим.
        assert_eq!(parse_query("    Другое    REG_SZ    x.exe"), None);
        // Ошибка чтения — не повод падать.
        assert_eq!(parse_query("ошибка: не найдено"), None);
    }

    #[test]
    fn a_foreign_entry_is_reported_not_silently_replaced() {
        let entry = status(
            Ok("    ZShelper    REG_SZ    \"C:\\old\\zshelper.exe\"".into()),
            r"C:\new\zshelper.exe",
        );
        assert!(entry.enabled);
        assert!(!entry.note.is_empty(), "чужая запись должна быть названа");

        let mine = status(
            Ok("    ZShelper    REG_SZ    C:\\new\\zshelper.exe".into()),
            r"c:\new\zshelper.exe",
        );
        assert!(mine.enabled);
        assert!(
            mine.note.is_empty(),
            "своя запись сравнивается без регистра"
        );
    }

    #[test]
    fn a_missing_entry_is_off_without_scary_words() {
        let off = status(
            Err("ОШИБКА: не удалось найти указанный раздел".into()),
            "x.exe",
        );
        assert!(!off.enabled);
        // Отсутствие записи — это норма, а не сбой: текст должен быть спокойным.
        assert!(!off.note.to_lowercase().contains("сбой"));
    }
}
