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

/// Аргумент «старт в трее»: по нему приложение узнаёт, что его поднял Windows
/// при входе, а не человек двойным кликом (шаг 77).
///
/// Флаг, а не отдельный exe и не настройка «всегда тихо»: правило
/// `trayStart` говорит, что окно зависит **от способа запуска**. Двойной клик
/// по ярлыку обязан показать окно — иначе это выглядит как «программа не
/// запустилась».
pub const QUIET_FLAG: &str = "--quiet";

/// Другой запуск — другой вид: автозапуск, второй экземпляр, после обновления
/// или обычный. Значение совпадает со словами правила `trayStart` (`How`).
pub fn how_from_args(args: &[String], first_run: bool) -> &'static str {
    if first_run {
        return "firstRun";
    }
    if args.iter().any(|arg| arg == QUIET_FLAG) {
        return "autostart";
    }
    "shortcut"
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
        // Флаг старта в трее — часть команды запуска, а не отдельная запись:
        // иначе Windows поднимет приложение без него, и «тихо» перестанет
        // работать после первого же включения автозапуска.
        format!("{} {}", quoted(target), QUIET_FLAG),
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
        // Имя значения и тип — по словам, а **значение берём как есть**: между
        // типом и путём Windows ставит несколько пробелов, а сам путь может
        // содержать двойные пробелы («Program  Files»). Пересборка из слов
        // склеила бы их в один и путь перестал бы совпадать с настоящим.
        let trimmed = line.trim_start();
        let Some(rest) = trimmed.strip_prefix(VALUE_NAME) else {
            continue;
        };
        if !rest.starts_with(char::is_whitespace) {
            continue;
        }
        let Some((_, after_type)) = rest.split_once("REG_SZ") else {
            continue;
        };
        let value = after_type.trim_start();
        if value.is_empty() {
            return None;
        }
        return Some(value.trim_end().to_string());
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
            // «Значения нет» — это нормальное «выключено», а не сбой: `reg query`
            // возвращает ту же единицу и на «раздел не найден», и на «нет доступа».
            // Показывать человеку «ОШИБКА: не удалось найти» под выключенным
            // выключателем — значит пугать его тем, что работает как задумано.
            note: if missing_entry(&note) {
                String::new()
            } else {
                note
            },
        },
        Ok(text) => match parse_query(&text) {
            None => Autostart {
                enabled: false,
                command: None,
                target: target_owned,
                note: String::new(),
            },
            Some(command) if same_target(&command, target) => Autostart {
                enabled: true,
                note: String::new(),
                command: Some(command),
                target: target_owned,
            },
            Some(command) => Autostart {
                // Значение есть, но запускает **не нас**. Показывать выключатель
                // включённым значит утверждать «автозапуск работает», а работать
                // будет чужая программа. Поэтому выключено, а причина названа.
                enabled: false,
                note: format!(
                    "в автозапуске уже есть другая запись с этим именем — она запускает «{command}», а не это приложение; включение её заменит"
                ),
                command: Some(command),
                target: target_owned,
            },
        },
    }
}

/// Сказал ли `reg.exe` «такого значения нет», а не «не смог прочитать».
///
/// Разница важна для человека: первое — нормальное «выключено», второе — сбой,
/// о котором нужно сказать. Сообщения локализованы, поэтому проверяем оба языка:
/// раннер CI и машины людей говорят по-разному.
pub fn missing_entry(note: &str) -> bool {
    let lower = note.to_lowercase();
    const ABSENT: [&str; 4] = [
        "не удалось найти",
        "не удалось открыть указанный раздел",
        "unable to find",
        "cannot find",
    ];
    ABSENT.iter().any(|sign| lower.contains(sign))
}

/// Одна ли и та же программа: сравниваем без кавычек и без учёта регистра.
///
/// Флаг `--quiet` не делает программу другой: запись `"…zshelper.exe" --quiet`
/// — это наш автозапуск, и говорить «тут чужая запись» было бы враньём.
pub fn same_target(command: &str, target: &str) -> bool {
    let left = command.trim();
    let want = target.trim().trim_matches('"');
    // Простой случай — сначала и целиком: команда без флага совпадает с путём
    // байт в байт, включая путь с пробелами и без кавычек. Сравниваем без
    // учёта регистра: `eq_ignore_ascii_case` латиницу приводит, а кириллицу
    // нет — «C:\\Пользователи» и «c:\\пользователи» разошлись бы.
    if left.trim_matches('"').to_lowercase() == want.to_lowercase() {
        return true;
    }
    // Путь может быть в кавычках (тогда флаг идёт после закрывающей) либо без
    // них (тогда путь — первое слово). Разбираем оба вида, а не «обычно так».
    let path = if let Some(rest) = left.strip_prefix('"') {
        match rest.find('"') {
            Some(end) => &rest[..end],
            None => rest,
        }
    } else {
        left.split_whitespace().next().unwrap_or("")
    };
    path.to_lowercase() == want.to_lowercase()
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
        // Путь в кавычках один раз, и сразу за ним — флаг старта в трее: он
        // часть команды, а не отдельная запись в реестре.
        assert_eq!(
            args[position + 1],
            r#""C:\Program Files\ZShelper\zshelper.exe" --quiet"#
        );
        // Уже закавыченный путь не получает вторые кавычки: важно ровно одно
        // обрамление, а не то, что строка совпала символ в символ.
        let once = quoted(r#""C:\A\b.exe""#);
        assert!(once.starts_with('"') && once.ends_with('"'), "{once}");
        assert_eq!(once.matches('"').count(), 2, "кавычки удвоились: {once}");
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
    fn the_quiet_flag_makes_autostart_look_like_autostart() {
        // Правило `trayStart`: тихо — только при входе в Windows. Флаг едет
        // вместе с командой запуска, иначе Windows поднимет приложение без него.
        let args = add_args(r"C:\Tools\zshelper.exe");
        // Флаг едет **внутрь** значения `/d`: в реестре команда запуска — одна
        // строка, и отдельного аргумента `reg.exe` для неё не бывает.
        let command = args
            .iter()
            .position(|arg| arg == "/d")
            .map(|at| args[at + 1].clone())
            .expect("/d есть");
        assert!(
            command.ends_with(QUIET_FLAG),
            "флага старта в трее нет в команде автозапуска: {command}"
        );
        assert_eq!(
            how_from_args(&[QUIET_FLAG.to_string()], false),
            "autostart"
        );
        // Двойной клик по ярлыку — окно: «тихо» здесь значит «ничего не произошло».
        assert_eq!(how_from_args(&[], false), "shortcut");
        // Первый запуск после установки важнее способа: иначе непонятно, что
        // установилось.
        assert_eq!(how_from_args(&[QUIET_FLAG.to_string()], true), "firstRun");
    }

    #[test]
    fn our_own_command_with_the_flag_is_still_ours() {
        // Настоящий дефект, который поймался бы только у людей: запись
        // `"…zshelper.exe" --quiet` не совпадала бы с путём, и настройка
        // говорила бы «в автозапуске чужая запись» про нашу же.
        let target = r"C:\Program Files\ZShelper\zshelper.exe";
        let command = r#""C:\Program Files\ZShelper\zshelper.exe" --quiet"#;
        assert!(same_target(command, target), "свой запуск принят за чужой");
        assert!(same_target(target, target), "путь без кавычек перестал совпадать");
        assert!(!same_target(r#""C:\Other\zshelper.exe" --quiet"#, target));
        // Кавычки не закрыты — не паникуем и не считаем совпадением.
        assert!(!same_target(r#""C:\Program Files\ZS"#, target));
        // Регистр кириллицы: `eq_ignore_ascii_case` её не приводит, и путь
        // «C:\Пользователи» разошёлся бы сам с собой.
        assert!(same_target(
            r#""c:\пользователи\zshelper.exe" --quiet"#,
            r"C:\Пользователи\zshelper.exe"
        ));
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
        // Путь с двойным пробелом читается как есть: пересборка из слов
        // склеила бы его в один и автозапуск перестал бы узнаваться.
        let spaced = "    ZShelper    REG_SZ    \"C:\\Program  Files\\z.exe\" --quiet\r\n";
        assert_eq!(
            parse_query(spaced).as_deref(),
            Some("\"C:\\Program  Files\\z.exe\" --quiet")
        );
        // Тип не тот — не наше значение, и не «почти совпало».
        assert_eq!(parse_query("    ZShelper    REG_EXPAND_SZ    x.exe"), None);
        // Ошибка чтения — не повод падать.
        assert_eq!(parse_query("ошибка: не найдено"), None);
    }

    #[test]
    fn a_foreign_entry_is_reported_not_silently_replaced() {
        let entry = status(
            Ok("    ZShelper    REG_SZ    \"C:\\old\\zshelper.exe\"".into()),
            r"C:\new\zshelper.exe",
        );
        // Чужая запись не «включена»: включённой выглядела бы работа, которой нет.
        assert!(!entry.enabled, "чужая программа — не наш автозапуск");
        assert!(!entry.note.is_empty(), "чужая запись должна быть названа");
        assert!(
            entry.note.contains("C:\\old\\zshelper.exe"),
            "человек должен видеть, что именно там записано: {}",
            entry.note
        );

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
        // «Значения нет» — это «выключено», а не сбой. Пустая заметка вместо
        // «ОШИБКА: не удалось найти» под спокойным выключателем.
        assert_eq!(off.note, "", "отсутствие записи — норма, а не ошибка");

        // А настоящий отказ доступа по-прежнему называется: молчать о нём нельзя.
        let denied = status(Err("ОШИБКА: отказано в доступе".into()), "x.exe");
        assert!(!denied.enabled);
        assert!(denied.note.contains("отказано"));
    }

    #[test]
    fn an_english_missing_entry_is_also_quiet() {
        // Раннер CI и системы с английским языком отвечают иначе — правило то же.
        let off = status(
            Err("ERROR: The system was unable to find the specified registry key or value.".into()),
            "x.exe",
        );
        assert!(!off.enabled);
        assert_eq!(off.note, "");
    }

    #[test]
    fn our_own_entry_is_on_and_silent() {
        let mine = status(
            Ok("    ZShelper    REG_SZ    \"C:\\Tools\\zshelper.exe\"".into()),
            r"C:\Tools\zshelper.exe",
        );
        assert!(mine.enabled);
        assert_eq!(mine.note, "");
        assert_eq!(mine.command.as_deref(), Some(r#""C:\Tools\zshelper.exe""#));
    }
}
