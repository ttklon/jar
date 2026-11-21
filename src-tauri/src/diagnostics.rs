//! Диагностический пакет: то, что можно отдать в разбор, не отдавая человека.
//!
//! Зачем это отдельный модуль, а не «просто собрать логи». Пакет для поддержки
//! опасен именно тем, что его легко собрать «на всякий случай»: в логах адреса
//! файлов с именем пользователя, в сообщениях — названия документов, в путях —
//! имя машины. Человек нажимает «отправить», не читая, и отправляет свою жизнь.
//!
//! Три правила, и каждое — про разный вид утечки:
//!
//!  * **вычищаем пути целиком, а не «маскируем имя».** `C:\Users\Анна\Документы\x.docx`
//!    после чистки — `<путь>`, потому что половина пути — тоже личное;
//!  * **секреты вычищаются по имени, а не по значению.** Значение токена мы не
//!    знаем заранее, но знаем, как называется переменная: `TOKEN`, `KEY`, `SECRET`,
//!    `PASSWORD`. Всё, что похоже, уходит в `<скрыто>`;
//!  * **человек видит ровно то, что отправит.** Пакет собирается на просмотр, а
//!    не «сразу наружу»: показать и потом отправить — единственный честный порядок.
//!
//! Модуль ничего не отправляет и не лезет в сеть: он умеет собрать строку и
//! сказать, что в ней вычищено. Решение «отправлять» остаётся за человеком.

use std::path::Path;

/// Что попало в пакет и что пришлось вычистить.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Pack {
    /// Готовый текст для просмотра и отправки.
    pub text: String,
    /// Сколько путей вычищено.
    pub paths_scrubbed: usize,
    /// Сколько похожих на секреты строк скрыто.
    pub secrets_scrubbed: usize,
    /// Что вычищено — списком, чтобы человек видел масштаб, а не верил на слово.
    pub notes: Vec<String>,
}

/// Похоже ли имя переменной на секрет.
///
/// Проверяем имя, а не значение: значение мы не знаем, а имя написано в конфиге
/// руками и почти всегда говорит правду. Регистр не важен, разделители тоже.
pub fn looks_secret(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [
        "token",
        "secret",
        "password",
        "passwd",
        "api_key",
        "apikey",
        "private_key",
        "credential",
    ]
    .iter()
    .any(|needle| lower.contains(needle))
}

/// Путь ли это.
///
/// Четыре признака: диск (`C:\`), UNC (`\\server`), `~/`, и «слэш внутри слова».
/// Просто «есть слэш» не годится: `and/or` — не путь, и маскировать его значит
/// портить текст, который потом читает человек.
pub fn looks_path(word: &str) -> bool {
    // `\\server\share` и `~/file` — пути без диска.
    if word.starts_with("\\") || word.starts_with("~/") {
        return true;
    }

    let bytes = word.as_bytes();
    // Диск: `C:\Users\…`. Проверяется ДО проверки длины, потому что `C:\x` — это
    // три символа, и любое «короче четырёх — не путь» отсекло бы настоящий путь.
    if bytes.len() > 2
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
    {
        return true;
    }

    // Слэш внутри слова: `src/lib/queueStore.ts`, `docs/GUIDE.md`.
    // Но `1/2`, `24/7` и `он/она` — не пути: маскировать их значит портить текст,
    // из которого человеку ещё предстоит понять, что случилось.
    if word.contains('/') {
        let parts: Vec<&str> = word.split('/').collect();
        // Признак имени файла — кусок с точкой/подчёркиванием/дефисом. Чистая дробь
        // состоит из цифр и коротких слов и ни одного такого куска не даёт.
        return parts
            .iter()
            .any(|part| part.contains('.') || part.contains('_') || part.contains('-'))
            || parts.iter().any(|part| part.chars().count() > 3);
    }

    false
}

/// Вычистить одну строку.
///
/// Порядок важен: сначала секреты (по имени), потом пути. Наоборот было бы нельзя:
/// после замены пути на `<путь>` имя переменной могло исчезнуть, и `TOKEN=…`
/// перестал бы опознаваться как секрет.
pub fn scrub_line(line: &str) -> (String, usize, usize) {
    // `ИМЯ=значение` и `ИМЯ: значение` — обе формы встречаются в логах и конфигах.
    //
    // Двоеточие считается разделителем ТОЛЬКО когда за ним пробел и слева нет
    // пробелов. Иначе `открываю C:\Users\…` распадалось бы на ключ «открываю C» и
    // «значение» `:\Users\…`, путь переставал быть путём и уезжал в пакет
    // целиком. Это ровно та утечка, ради которой модуль написан, и её нашёл CI,
    // а не придуманная строка в тесте.
    let split = line.find('=').or_else(|| {
        line.find(": ")
            .filter(|index| !line[..*index].contains(' '))
    });

    let (key, rest) = match split {
        Some(index) if index > 0 => (&line[..index], &line[index..]),
        _ => ("", line),
    };

    // Секрет: пути в этой строке не считаются — она уходит целиком, искать в ней
    // пути уже нечего. Поэтому здесь явный ноль, а не «сколько успели».
    if !key.is_empty() && looks_secret(key.trim()) {
        return (format!("{key}=<скрыто>"), 0, 1);
    }

    let mut paths = 0usize;
    let mut out: Vec<String> = Vec::new();
    for word in rest.split(' ') {
        if looks_path(word) {
            paths += 1;
            out.push("<путь>".to_string());
        } else {
            out.push(word.to_string());
        }
    }

    (format!("{key}{}", out.join(" ")), paths, 0)
}

/// Собрать пакет из строк журнала.
///
/// `head` — то, что о приложении знать полезно и не стыдно: версия, система,
/// сколько инструментов. Вычищается тем же правилом: доверять «своим» строкам
/// на слово значит оставить дыру ровно там, где её не проверят.
pub fn pack(head: &[String], log: &[String]) -> Pack {
    let mut text = String::new();
    let mut paths = 0usize;
    let mut secrets = 0usize;

    for line in head.iter().chain(log.iter()) {
        let (clean, line_paths, line_secrets) = scrub_line(line);
        paths += line_paths;
        secrets += line_secrets;
        text.push_str(&clean);
        text.push('\n');
    }

    let mut notes = Vec::new();
    if paths > 0 {
        notes.push(format!("вычищено путей: {paths}"));
    }
    if secrets > 0 {
        notes.push(format!("скрыто похожих на секреты строк: {secrets}"));
    }
    if paths == 0 && secrets == 0 {
        notes.push("личных данных не найдено".to_string());
    }

    Pack {
        text,
        paths_scrubbed: paths,
        secrets_scrubbed: secrets,
        notes,
    }
}

/// Есть ли в файле что-то, что нельзя отдавать наружу.
///
/// Дешёвая проверка «перед отправкой»: если она говорит «есть», значит чистка
/// не сработала. Это защита от регресса, а не замена чистке.
pub fn leak(text: &str) -> Option<String> {
    for line in text.lines() {
        for word in line.split(' ') {
            if looks_path(word) {
                return Some(format!("остался путь: {word}"));
            }
        }
    }

    // Имена переменных с секретами не должны встречаться в пакете вовсе.
    for line in text.lines() {
        if let Some(index) = line.find('=') {
            let key = line[..index].trim();
            if looks_secret(key) && !line.ends_with("<скрыто>") {
                return Some(format!("остался секрет: {key}"));
            }
        }
    }

    None
}

/// Человеческое имя системы для шапки пакета.
///
/// Без путей и без имени пользователя: `windows` и номер версии — всё, что нужно
/// для разбора, и ничего, что опознаёт машину.
pub fn platform() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

/// Сколько весит пакет: у поддержки бывают пределы, и «не влезло» лучше узнать
/// до отправки.
pub fn size_note(pack: &Pack, limit: usize) -> Option<String> {
    if pack.text.len() <= limit {
        None
    } else {
        Some(format!(
            "пакет больше предела ({} из {limit} символов) — приложите только начало",
            pack.text.len()
        ))
    }
}

/// Каталог журналов — нужен, чтобы интерфейс мог сказать «откуда берётся пакет»,
/// не показывая сам путь.
pub fn log_source(base_dir: &Path) -> bool {
    base_dir.join("logs").is_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_user_path_is_removed_whole_not_masked_in_half() {
        let (clean, paths, _) = scrub_line(r"открываю C:\Users\Анна\Документы\отчёт.docx");
        // Половина пути — тоже личное, поэтому маскируется весь.
        assert!(!clean.contains("Анна"), "{clean}");
        assert!(clean.contains("<путь>"), "{clean}");
        assert_eq!(paths, 1);
    }

    #[test]
    fn a_secret_is_hidden_by_its_name_not_by_its_value() {
        let (clean, _, secrets) = scrub_line("OPENAI_API_KEY=sk-1234567890abcdef");
        assert_eq!(clean, "OPENAI_API_KEY=<скрыто>");
        assert_eq!(secrets, 1);
        // Значения в тексте нет вообще — это и есть проверка.
        assert!(!clean.contains("sk-123"));
    }

    #[test]
    fn a_plain_word_with_a_slash_is_not_a_path() {
        // `and/or` — не путь; маскировать его значило бы портить читаемый текст.
        let (clean, paths, _) = scrub_line("выбор and/or подтверждение");
        assert_eq!(clean, "выбор and/or подтверждение");
        assert_eq!(paths, 0);
    }

    #[test]
    fn a_drive_letter_colon_is_not_a_key_separator() {
        // Именно эта строка уронила CI: двоеточие в `C:` принималось за разделитель
        // «ИМЯ: значение», путь распадался, и имя человека уезжало в пакет целиком.
        let (clean, paths, _) = scrub_line(r"открываю C:\Users\Иван\Документы\отчёт.docx");
        assert!(!clean.contains("Иван"), "{clean}");
        assert!(clean.contains("<путь>"), "{clean}");
        assert_eq!(paths, 1);
    }

    #[test]
    fn a_short_path_is_still_a_path() {
        // `C:\x` — три символа. Раньше здесь стояла проверка «короче четырёх — не
        // путь», и настоящий короткий путь проходил в пакет нетронутым. CI это и
        // поймал: путь остался в тексте, который уже готов к отправке.
        assert!(looks_path("C:\\x"));
        assert!(looks_path("D:/a"));
        assert!(looks_path("~/.zshrc"));
        assert!(looks_path("\\\\host\\share"));
        // И наоборот: короткие слова путями не становятся.
        assert!(!looks_path("and/or"));
        assert!(!looks_path("1/2"));
    }

    #[test]
    fn fractions_and_plain_pairs_are_not_paths() {
        for text in ["готово 1/2", "работаем 24/7", "он/она выбрал"] {
            let (clean, paths, _) = scrub_line(text);
            assert_eq!(paths, 0, "{text} → {clean}");
            assert_eq!(clean, text);
        }
    }

    #[test]
    fn a_pack_counts_what_it_removed_and_says_so() {
        let pack = pack(
            &["версия: 0.1.0".to_string()],
            &[
                r"папка: C:\Users\Иван\AppData\Local\ZShelper".to_string(),
                "TOKEN=abcdef".to_string(),
                "ошибка: не удалось открыть".to_string(),
            ],
        );

        assert_eq!(pack.paths_scrubbed, 1);
        assert_eq!(pack.secrets_scrubbed, 1);
        assert!(pack.notes.iter().any(|note| note.contains("путей: 1")));
        // Причина ошибки остаётся: без неё пакет бесполезен.
        assert!(pack.text.contains("не удалось открыть"));
    }

    #[test]
    fn leak_finds_a_path_that_survived_the_scrub() {
        // Если чистка сломается, проверка должна это заметить, а не пропустить.
        let bad = pack(&[], &[r"C:\Users\Иван\file.txt".to_string()]);
        // Сам пакет чистый — значит `leak` на нём молчит.
        assert!(leak(&bad.text).is_none(), "{:?}", bad.text);

        // А вот нечищеный текст `leak` обязан поймать.
        assert!(leak(r"C:\Users\Иван\file.txt").is_some());
        assert!(leak("PASSWORD=hunter2").is_some());
    }

    #[test]
    fn an_empty_log_is_reported_honestly_as_nothing_personal() {
        let pack = pack(&[], &[]);
        assert_eq!(pack.text, "");
        assert_eq!(pack.notes, vec!["личных данных не найдено"]);
        assert_eq!(pack.paths_scrubbed, 0);
    }

    #[test]
    fn a_pack_over_the_limit_says_so_before_sending() {
        let pack = pack(&[], &["x".repeat(200)]);
        assert!(size_note(&pack, 100).is_some());
        assert!(size_note(&pack, 1000).is_none());
    }

    #[test]
    fn platform_names_the_system_without_naming_the_machine() {
        let name = platform();
        assert!(name.contains('-'));
        // Ни имени пользователя, ни пути: только система и разрядность.
        assert!(!looks_path(&name));
    }
}
