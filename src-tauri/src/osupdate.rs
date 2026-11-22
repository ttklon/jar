//! Обновилась ли Windows с прошлого запуска — и что тогда проверить.
//!
//! Зачем это отдельный модуль. Обновление Windows — частая причина поломок,
//! которую человек не связывает с программой: вчера всё работало, сегодня
//! движок не запускается, и виноватым выглядит приложение. Само обновление
//! приложение отменить не может, но может **заметить** его и предложить
//! проверить себя — пока человек ещё помнит, что «вчера работало».
//!
//! Три решения:
//!
//!  * **сравнение номеров — чистая функция.** Её можно проверить на всех
//!    платформах, без Windows и без настоящего обновления системы;
//!  * **прошлый номер хранится в памяти приложения**, а не в отдельном файле:
//!    он и есть часть «что я об этом знаю», и удаляется вместе с базой;
//!  * **молчим, когда сравнивать не с чем.** Первый запуск — не обновление;
//!    выдуманное «Windows только что обновилась» приучает не верить карточке.

/// Файл в папке приложения, где лежит номер сборки прошлого запуска.
///
/// Файл, а не база памяти: память может быть повреждена — и ровно тогда,
/// после обновления Windows, о котором и надо сказать, её и хочется проверить.
/// Маленький текстовый файл переживает и это.
const FILE: &str = "os-build.txt";

/// Заметить обновление и запомнить текущий номер.
///
/// Возвращает то, что стоит показать человеку, и **всегда** записывает
/// текущий номер: следующий запуск должен сравнивать с ним, а не с тем,
/// что было до прошлого раза.
pub fn notice_and_remember(base: &std::path::Path) -> Result<String, String> {
    let Some(current) = build_number() else {
        // Не Windows — сравнивать нечего, и это не провал проверки: приложение
        // работает и там, а выдумывать «обновление» было бы враньём.
        return Ok("не Windows: сравнивать нечего".to_string());
    };
    let path = base.join(FILE);
    let previous = std::fs::read_to_string(&path).ok();
    std::fs::write(&path, &current)
        .map_err(|error| format!("номер сборки не запомнился: {error}"))?;
    Ok(update_note(previous.as_deref(), &current)
        .unwrap_or_else(|| format!("сборка {current}; с прошлым запуском совпадает")))
}

/// Что сказать про номер сборки.
///
/// `None` — нечего сказать: первый запуск или номер не прочитался. `Some` —
/// обновление, и в строке названы оба номера: «было — стало» человек может
/// сверить сам, а «система обновилась» без чисел проверить нечем.
pub fn update_note(previous: Option<&str>, current: &str) -> Option<String> {
    let previous = previous?.trim();
    let current = current.trim();
    if previous.is_empty() || current.is_empty() || previous == current {
        return None;
    }
    // Сравниваем как числа, когда оба — числа: «19045» и «19046» отличаются
    // на единицу, а строкой это не видно.
    if let (Ok(before), Ok(after)) = (previous.parse::<u64>(), current.parse::<u64>()) {
        if after <= before {
            // Откат (восстановление системы) — тоже изменение, но говорить
            // «обновилась» было бы неправдой.
            return Some(format!(
                "Windows стала другой версией: сборка {before} → {after}. Если что-то перестало работать, прогоните проверку себя"
            ));
        }
    }
    Some(format!(
        "Windows обновилась с прошлого запуска: сборка {previous} → {current}. После обновлений Windows что-то ломается чаще, чем кажется — прогоните проверку себя"
    ))
}

/// Номер сборки Windows. `None` — не Windows или номер не прочитался.
#[cfg(windows)]
pub fn build_number() -> Option<String> {
    use std::os::windows::process::CommandExt;
    // `cmd /c ver` — самый дешёвый способ без WinAPI-вызовов и новых
    // зависимостей: он есть на любой Windows и печатает «10.0.19045.3803».
    // CREATE_NO_WINDOW — чтобы за программой не мигала консоль.
    let output = std::process::Command::new("cmd")
        .args(["/c", "ver"])
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    parse_build(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(not(windows))]
pub fn build_number() -> Option<String> {
    None
}

/// Достать номер сборки из строки `ver`.
///
/// Отдельной функцией, потому что формат — не наш: `ver` печатает пустую
/// строку перед текстом, локаль меняет слова, а хвост после сборки
/// (`10.0.19045.3803`) — не то же самое, что сборка (`19045`): обновление
/// меняет сборку, а точка-ревизия меняется и от патчей.
pub fn parse_build(text: &str) -> Option<String> {
    let version = text
        .split_whitespace()
        .find(|part| part.chars().filter(|c| *c == '.').count() >= 2)?;
    let mut numbers = version.split('.');
    let _major = numbers.next()?;
    let _minor = numbers.next()?;
    let build = numbers.next()?.trim_end_matches(|c: char| !c.is_ascii_digit());
    if build.is_empty() || !build.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(build.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Шаг 358: обновление видно по номеру сборки, а первый запуск — не обновление.
    #[test]
    fn an_update_is_named_between_the_two_builds() {
        let note = update_note(Some("19045"), "19046").unwrap();
        assert!(note.contains("19045"), "было названо: {note}");
        assert!(note.contains("19046"), "и стало: {note}");
        assert!(note.contains("проверку себя"), "и что делать: {note}");
    }

    #[test]
    fn the_first_run_says_nothing() {
        // Сравнивать не с чем — и выдумывать «только что обновилась» нельзя.
        assert!(update_note(None, "19045").is_none());
        assert!(update_note(Some(""), "19045").is_none());
        assert!(update_note(Some("   "), "19045").is_none());
    }

    #[test]
    fn the_same_build_says_nothing() {
        // Иначе карточка висела бы после каждого запуска.
        assert!(update_note(Some("19045"), "19045").is_none());
    }

    /// Откат — тоже изменение, но не «обновилась».
    #[test]
    fn a_rollback_is_not_called_an_update() {
        let note = update_note(Some("19046"), "19045").unwrap();
        assert!(note.contains("другой версией"), "честно названо: {note}");
        assert!(!note.contains("обновилась"), "не выдаётся за обновление: {note}");
    }

    #[test]
    fn the_build_is_read_from_the_system_string() {
        // Так `ver` отвечает на русской Windows.
        assert_eq!(
            parse_build("\r\nMicrosoft Windows [Version 10.0.19045.3803]\r\n").as_deref(),
            Some("19045")
        );
        assert_eq!(
            parse_build("Microsoft Windows [Version 10.0.22631.3155]").as_deref(),
            Some("22631")
        );
        // Не разобрали — честное «не знаю», а не догадка.
        assert_eq!(parse_build(""), None);
        assert_eq!(parse_build("что-то другое"), None);
    }

    /// Файл переживает запуски: номер записывается, и следующее сравнение
    /// идёт уже с ним. Без записи «обновилась» не заметить никогда.
    #[test]
    fn the_build_number_is_written_for_the_next_run() {
        let dir = std::env::temp_dir().join(format!("zshelper-osbuild-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Первый запуск: сравнивать не с чем, но номер уже записан.
        let first = notice_and_remember(&dir).unwrap();
        assert!(first.contains("сборка") || first.contains("не Windows"), "{first}");
        let written = std::fs::read_to_string(dir.join(FILE)).ok();
        if build_number().is_some() {
            assert_eq!(written, build_number(), "номер лёг в файл");
        } else {
            assert_eq!(written, None, "не Windows — и файла нет");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Номер сборки без точки-ревизии: патч в хвосте не должен выглядеть
    /// обновлением системы, иначе карточка появлялась бы после каждого патча.
    #[test]
    fn the_revision_in_the_tail_is_not_the_build() {
        let one = parse_build("Microsoft Windows [Version 10.0.19045.3803]").unwrap();
        let two = parse_build("Microsoft Windows [Version 10.0.19045.4000]").unwrap();
        assert_eq!(one, "19045");
        assert_eq!(two, "19045");
        assert!(update_note(Some(&one), &two).is_none(), "тот же номер сборки");
    }
}
