//! Где приложение держит свои файлы и сколько они занимают.
//!
//! Зачем это в интерфейсе: почти каждый вопрос «почему оно так сделало» упирается в
//! «а где посмотреть». Путь в документации бесполезен, если человек не знает, что файл
//! вообще есть; поэтому экран показывает путь, размер и — отдельно — **есть ли файл**.
//!
//! Три решения:
//!
//!  * **отсутствие — это `exists: false`, а не ноль байт.** «Занимает 0 КБ» и «файла нет»
//!    разные утверждения: первое читается как «пустой журнал», второе как «ещё не писали»;
//!  * **папка считается по файлам**, а не по «сколько-то»: иначе размер папки моделей был бы
//!    выдумкой. Ошибки чтения не скрываются нолём — они дают то, что удалось прочитать;
//!  * **здесь нет удаления и «очистки»**. Экран показывает; убирать файлы — отдельное дело
//!    с подтверждением, и делать его кнопкой рядом с путём было бы слишком легко.

use serde::Serialize;
use std::path::Path;

/// Одно место: что это, где лежит, сколько занимает.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Place {
    /// Название для человека: «Журнал действий».
    pub title: String,
    /// Полный путь — его можно скопировать.
    pub path: String,
    /// Есть ли файл (или папка) на диске.
    pub exists: bool,
    /// Байты. Для папки — сумма файлов внутри.
    pub bytes: u64,
    /// Зачем это нужно и что сюда пишется.
    pub note: String,
}

/// Итог по местам: сколько всего занимает приложение (шаг 395).
///
/// Зачем отдельно, а не «сложить на экране». Сумма мест — это не сумма файлов:
/// папка моделей и папка движков лежат рядом с `base`, но не внутри неё, и
/// программа — вообще отдельный файл. Сложи всё подряд — получишь число, в котором
/// модели посчитаны дважды или не посчитаны вовсе, и человеку придётся верить.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Totals {
    /// Сколько занимают данные приложения: журналы, память, копии.
    pub data_bytes: u64,
    /// Сколько занимают модели: гигабайты, и это главная часть установки.
    pub models_bytes: u64,
    /// Сколько занимают движки (`sidecars/`): llama и whisper.
    pub runtimes_bytes: u64,
    /// Сколько занимает сама программа (исполняемый файл).
    pub program_bytes: u64,
    /// Всё вместе — честная сумма без двойного счёта.
    pub total_bytes: u64,
}

/// Посчитать итог по тем же местам, которые показывает экран.
pub fn totals(base: &Path, models_dir: &Path, program: Option<&Path>) -> Totals {
    let models_bytes = size_of(models_dir);
    let runtimes_bytes = size_of(&base.join("sidecars"));
    let program_bytes = program.map(size_of).unwrap_or(0);
    // Данные — это файлы в `base`, кроме движков: они посчитаны отдельной строкой,
    // и второй раз входить в них значило бы показать установку больше настоящей.
    let data_bytes = size_of(base).saturating_sub(runtimes_bytes);
    Totals {
        data_bytes,
        models_bytes,
        runtimes_bytes,
        program_bytes,
        total_bytes: data_bytes + models_bytes + runtimes_bytes + program_bytes,
    }
}

/// Все места приложения по его папке.
pub fn all(base: &Path, log_file: &Path, models_dir: &Path) -> Vec<Place> {
    vec![
        place(
            "Журнал действий",
            &base.join("audit.jsonl"),
            "что просили, что решила политика и чем закончилось — это читает экран «История»",
        ),
        place(
            "Журнал отката",
            &base.join("undo.jsonl"),
            "как вернуть переносы и переименования этой сессии; без него откат не обещает ничего",
        ),
        place(
            "Память запусков",
            &base.join("memory.db"),
            "прошлые удачные запуски и их параметры, чтобы не спрашивать одно и то же дважды",
        ),
        place(
            "Логи приложения",
            log_file,
            "что делало приложение, шаг за шагом; сюда смотрят, когда что-то пошло не так",
        ),
        place(
            "Папка моделей",
            models_dir,
            "файлы .gguf, если человек их принёс; приложение само их не скачивает",
        ),
        place(
            "Движки",
            &base.join("sidecars"),
            "llama-server и whisper: без них не будет ни разговора, ни распознавания",
        ),
    ]
}

fn place(title: &str, path: &Path, note: &str) -> Place {
    Place {
        title: title.to_string(),
        path: path.display().to_string(),
        exists: path.exists(),
        bytes: size_of(path),
        note: note.to_string(),
    }
}

/// Размер файла или сумма размеров файлов внутри папки.
///
/// Чего не делает: не ходит по ссылкам (иначе можно зациклиться) и не падает на том, что
/// прочитать не вышло, — отдаёт то, что прочиталось.
fn size_of(path: &Path) -> u64 {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return 0,
    };
    if metadata.is_file() {
        return metadata.len();
    }
    if !metadata.is_dir() {
        return 0;
    }
    let mut total = 0;
    let entries = match std::fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => return 0,
    };
    for entry in entries.flatten() {
        let kind = match entry.file_type() {
            Ok(kind) => kind,
            Err(_) => continue,
        };
        if kind.is_symlink() {
            continue;
        }
        total += size_of(&entry.path());
    }
    total
}

/// Размер в человеческом виде: байты, килобайты, мегабайты.
///
/// Округление вниз до одного знака, а не «0.0 МБ» для маленького файла: врать про размер
/// в интерфейсе — то же, что врать про результат.
pub fn human(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    let value = bytes as f64;
    if bytes < 1024 {
        return format!("{bytes} Б");
    }
    if value < KB * KB {
        return format!("{:.1} КБ", value / KB);
    }
    format!("{:.1} МБ", value / (KB * KB))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zshelper-places-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка");
        dir
    }

    #[test]
    fn missing_files_are_marked_as_missing_not_as_zero_size() {
        let base = temp_dir("missing");

        let places = all(&base, &base.join("zshelper.log"), &base.join("models"));

        // Шесть, а не пять: «Движки» — отдельная строка, и её размер раньше
        // не был виден нигде. Число держим точным: новый файл без строки на экране —
        // это файл, о котором человек не узнает.
        assert_eq!(places.len(), 6);
        for place in &places {
            assert!(
                !place.exists,
                "{}: файла нет — так и должно быть",
                place.title
            );
            assert_eq!(place.bytes, 0, "размер не выдумывается");
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn sizes_are_read_from_disk_and_folders_add_their_files() {
        let base = temp_dir("sizes");
        std::fs::write(base.join("audit.jsonl"), "строка").expect("журнал");
        let models = base.join("models");
        std::fs::create_dir_all(&models).expect("папка моделей");
        std::fs::write(models.join("a.gguf"), vec![0u8; 2048]).expect("модель");

        let places = all(&base, &base.join("zshelper.log"), &models);

        let audit = places
            .iter()
            .find(|place| place.title == "Журнал действий")
            .expect("запись про журнал");
        assert!(audit.exists);
        assert_eq!(audit.bytes, "строка".len() as u64);

        let folder = places
            .iter()
            .find(|place| place.title == "Папка моделей")
            .expect("запись про модели");
        assert!(folder.exists);
        assert_eq!(folder.bytes, 2048, "папка считается по файлам внутри");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn paths_are_full_so_they_can_be_copied() {
        let base = temp_dir("paths");

        let places = all(&base, &base.join("zshelper.log"), &base.join("models"));

        let audit = places.first().expect("первое место");
        assert!(audit.path.ends_with("audit.jsonl"), "{}", audit.path);
        assert!(
            Path::new(&audit.path).is_absolute(),
            "путь должен быть полным: {}",
            audit.path
        );
        // Записи не пустые: у каждого места есть объяснение, а не только путь.
        for place in &places {
            assert!(!place.note.is_empty(), "{}: без объяснения", place.title);
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn the_install_size_is_not_counted_twice() {
        let base = temp_dir("totals");
        let models = temp_dir("totals-models");
        // Программа — вне папки данных, как в жизни (`Program Files`, а данные —
        // в `LOCALAPPDATA`). Внутри `base` она попала бы и в данные, и в свою строку.
        let program = temp_dir("totals-program").join("zshelper.exe");
        let sidecars = base.join("sidecars").join("llama");

        std::fs::create_dir_all(&sidecars).expect("движки");
        std::fs::write(base.join("audit.jsonl"), vec![b'a'; 1000]).expect("журнал");
        std::fs::write(sidecars.join("llama-server.exe"), vec![b'b'; 2000]).expect("движок");
        std::fs::write(models.join("m.gguf"), vec![b'c'; 5000]).expect("модель");
        std::fs::write(&program, vec![b'd'; 300]).expect("программа");

        let totals = totals(&base, &models, Some(&program));

        // Движки посчитаны один раз: в данных их нет, иначе установка «весила» бы
        // больше настоящей — а это ровно тот случай, когда человек не поймёт, куда девать место.
        assert_eq!(totals.runtimes_bytes, 2000);
        assert_eq!(totals.data_bytes, 1000);
        assert_eq!(totals.models_bytes, 5000);
        assert_eq!(totals.program_bytes, 300);
        assert_eq!(totals.total_bytes, 1000 + 2000 + 5000 + 300);

        let _ = std::fs::remove_dir_all(&base);
        let _ = std::fs::remove_dir_all(&models);
        if let Some(dir) = program.parent() {
            let _ = std::fs::remove_dir_all(dir);
        }
    }

    #[test]
    fn a_missing_program_is_zero_and_says_nothing_false() {
        let base = temp_dir("totals-missing");
        let models = base.join("models");

        let totals = totals(&base, &models, None);

        // Программу не нашли — это не ошибка: число просто не участвует.
        assert_eq!(totals.program_bytes, 0);
        assert_eq!(totals.total_bytes, totals.data_bytes + totals.models_bytes);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn size_is_human_and_does_not_round_small_files_to_zero_megabytes() {
        assert_eq!(human(0), "0 Б");
        assert_eq!(human(900), "900 Б");
        assert_eq!(human(2048), "2.0 КБ");
        assert_eq!(human(5 * 1024 * 1024), "5.0 МБ");
    }
}
