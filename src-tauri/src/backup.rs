//! Резервная копия базы памяти и восстановление из неё.
//!
//! Зачем: база — это единственное, что приложение помнит о человеке. Повреждение
//! файла (обрыв питания, антивирус, полный диск) без копии означает потерю всего,
//! и `Memory::open` честно скажет «повреждена», но помочь уже нечем.
//!
//! Четыре правила, и все четыре — следствие того, как это ломается:
//!
//!  * **копия делается ДО открытия, а не после.** Если открыть битую базу и потом
//!    копировать, копия будет битой;
//!  * **копия проверяется, а не предполагается годной.** Целостность копии
//!    читается тем же `quick_check`, что и у оригинала: копия, которую нельзя
//!    открыть, — не страховка;
//!  * **старые копии не копятся без предела.** Пять штук: больше — это уже склад
//!    мусора на диске человека, меньше — нет точки отката;
//!  * **чужая копия не восстанавливается молча.** Восстановление заменяет файл,
//!    поэтому оно всегда называет, что именно заменяется, и требует явного слова.
//!
//! Модуль не решает, когда копировать, и не показывает диалогов: он умеет
//! «сделать», «проверить» и «вернуть». Решение — за вызывающим, и его видно.

use std::path::{Path, PathBuf};

/// Сколько копий держим. Пять: достаточно, чтобы откатиться на пару дней назад,
/// и мало, чтобы не превратить папку данных в свалку.
pub const KEEP: usize = 5;

/// Одна резервная копия.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Copy {
    pub path: PathBuf,
    /// Размер в байтах: ноль байт — не копия, а пустышка.
    pub bytes: u64,
}

/// Куда кладём копии: рядом с базой, в подпапку `backups`.
///
/// Рядом, а не в профиле пользователя и не во временной папке: человек, который
/// хочет сохранить данные, должен найти копию там же, где базу, — без поиска.
pub fn dir(base_dir: &Path) -> PathBuf {
    base_dir.join("backups")
}

/// Имя копии: дата-время в UTC, чтобы сортировка по имени совпадала с порядком.
///
/// Формат фиксированный и разбирается обратно, поэтому здесь именно `%Y%m%d-%H%M%S`:
/// двоеточия в именах файлов Windows запрещены.
pub fn name(stamp: &str, version: u32) -> String {
    format!("memory-{stamp}-v{version}.db")
}

/// Список копий, новые первыми.
///
/// Сортировка по имени, а не по времени файла: время файла меняется при
/// копировании и синхронизации, и порядок «какая копия новее» стал бы врать.
pub fn list(dir: &Path) -> Vec<Copy> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };

    let mut copies: Vec<Copy> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?.to_string();
            if !name.starts_with("memory-") || !name.ends_with(".db") {
                return None;
            }
            let bytes = entry.metadata().ok()?.len();
            // Пустой файл — не копия: обычно это след обрыва записи.
            if bytes == 0 {
                return None;
            }
            Some(Copy { path, bytes })
        })
        .collect();

    copies.sort_by(|left, right| right.path.file_name().cmp(&left.path.file_name()));
    copies
}

/// Что удалить, чтобы копий осталось не больше `keep`.
///
/// Отдельная функция, потому что решение «что стареет» должно быть проверяемым:
/// удалять по пути на диске в тесте — значит проверять удачу.
pub fn expired(copies: &[Copy], keep: usize) -> Vec<PathBuf> {
    copies
        .iter()
        .skip(keep)
        .map(|copy| copy.path.clone())
        .collect()
}

/// Итог копирования: что сделали и что сказали бы человеку.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Made {
    pub path: PathBuf,
    pub bytes: u64,
    /// Предупреждения: например, старая копия не удалилась (файл занят).
    pub notes: Vec<String>,
}

/// Сделать копию базы.
///
/// `source` может отсутствовать — тогда копии не нужны и функция говорит это
/// прямо, а не создаёт пустой файл «на всякий случай»: пустая копия опаснее её
/// отсутствия, потому что выглядит годной.
pub fn make(source: &Path, dest_dir: &Path, stamp: &str, version: u32, keep: usize) -> Result<Made, String> {
    if !source.exists() {
        return Err("копировать нечего: файла базы ещё нет".to_string());
    }

    std::fs::create_dir_all(dest_dir)
        .map_err(|error| format!("папка копий не создалась: {error}"))?;

    let path = dest_dir.join(name(stamp, version));
    std::fs::copy(source, &path).map_err(|error| format!("копия не записалась: {error}"))?;

    let bytes = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
    if bytes == 0 {
        let _ = std::fs::remove_file(&path);
        return Err("копия получилась пустой — удалена, чтобы не выдать пустое за страховку".to_string());
    }

    let mut notes = Vec::new();
    for old in expired(&list(dest_dir), keep) {
        if let Err(error) = std::fs::remove_file(&old) {
            // Не беда, если старая копия занята: предупреждаем и живём дальше.
            notes.push(format!("старая копия не удалилась: {error}"));
        }
    }

    Ok(Made { path, bytes, notes })
}

/// Проверить, что копия — действительно база, а не файл с расширением `.db`.
///
/// Открываем копию и читаем `quick_check`; любая ошибка значит «не годится».
/// Отдельная функция, потому что «файл есть» и «файл годен» — разные утверждения,
/// и путать их в отчёте было бы обманом.
pub fn verify(path: &Path) -> Result<(), String> {
    let conn = rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| format!("копия не открылась: {error}"))?;

    let answer: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("проверка копии не прошла: {error}"))?;

    if answer.trim().eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(format!("копия повреждена: {}", answer.trim()))
    }
}


/// Копия для показа человеку: путь, размер, годна ли и когда сделана.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Listed {
    /// Имя файла — то, что передаётся обратно в `restore`. Полный путь наружу не
    /// нужен: интерфейсу нечего с ним делать, а лишний путь в ответе — лишняя утечка.
    pub file: String,
    pub bytes: u64,
    /// Можно ли из неё восстановить. Не «существует ли файл», а «открывается ли».
    pub usable: bool,
    /// Почему не годится. Пусто, если годится.
    pub problem: String,
}

/// Собрать список для человека, проверив каждую копию.
pub fn listed(dir: &Path) -> Vec<Listed> {
    list(dir)
        .into_iter()
        .filter_map(|copy| {
            let file = copy.path.file_name()?.to_str()?.to_string();
            match verify(&copy.path) {
                Ok(()) => Some(Listed {
                    file,
                    bytes: copy.bytes,
                    usable: true,
                    problem: String::new(),
                }),
                Err(problem) => Some(Listed {
                    file,
                    bytes: copy.bytes,
                    usable: false,
                    problem,
                }),
            }
        })
        .collect()
}

/// Итог восстановления: что вернули и куда ушла прежняя база.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Restored {
    pub file: String,
    /// Куда сохранена база, которая была до восстановления. `None` — её не было.
    pub previous: Option<String>,
    pub bytes: u64,
}

/// Вернуть базу из копии.
///
/// Порядок важен и не косметичен:
///
/// 1. **проверяем копию** — восстанавливать битую значит разрушить рабочую базу
///    ради ничего;
/// 2. **откладываем текущую** в `backups/` под именем `replace-…` — иначе у
///    человека нет пути назад, и «откат» становится односторонним;
/// 3. **копируем поверх.** Не `rename`: `rename` снёс бы копию, и вторая попытка
///    уже не сработала бы.
///
/// `file` — имя в папке копий, а не произвольный путь: иначе команда стала бы
/// способом записать любой файл куда угодно.
pub fn restore(base_dir: &Path, file: &str) -> Result<Restored, String> {
    // Только имя: ни разделителей, ни `..`, ни абсолютных путей.
    if file.contains('/') || file.contains('\\') || file.contains("..") || file.is_empty() {
        return Err("восстановление принимает имя файла копии, а не путь".to_string());
    }

    let dir = dir(base_dir);
    let source = dir.join(file);
    if !source.exists() {
        return Err(format!("такой копии нет: {file}"));
    }

    verify(&source)?;

    let target = base_dir.join("memory.db");
    let previous = if target.exists() {
        let aside = dir.join(format!("replace-{file}"));
        std::fs::copy(&target, &aside)
            .map_err(|error| format!("прежняя база не отложена: {error}"))?;
        Some(aside.file_name().and_then(|name| name.to_str()).map(str::to_string))
    } else {
        None
    };

    std::fs::copy(&source, &target).map_err(|error| format!("копия не легла на место: {error}"))?;

    // После замены проверяем результат: «скопировали» и «открывается» — разные
    // утверждения, и человеку нужно второе.
    verify(&target)?;

    let bytes = std::fs::metadata(&target).map(|meta| meta.len()).unwrap_or(0);
    Ok(Restored {
        file: file.to_string(),
        previous,
        bytes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "zshelper-backup-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка");
        dir
    }

    /// Настоящая база, а не пустышка: копия должна проходить проверку.
    fn database(dir: &Path) -> PathBuf {
        let path = dir.join("memory.db");
        let conn = rusqlite::Connection::open(&path).expect("база");
        conn.execute_batch("CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('ok');")
            .expect("схема");
        path
    }

    #[test]
    fn a_copy_of_a_real_database_passes_the_check() {
        let dir = temp("real");
        let db = database(&dir);
        let made = make(&db, &dir.join("backups"), "20261121-120000", 1, KEEP).expect("копия");

        assert!(made.bytes > 0);
        assert!(made.path.exists());
        // Копия не просто «есть»: её можно открыть и проверить.
        verify(&made.path).expect("копия годна");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn copying_nothing_is_said_plainly_instead_of_making_an_empty_file() {
        let dir = temp("nothing");
        let error = make(&dir.join("нет.db"), &dir.join("backups"), "x", 1, KEEP)
            .expect_err("копировать нечего");
        assert!(error.contains("нечего"), "{error}");
        // И пустого файла не осталось: пустая копия выглядит годной.
        assert!(!dir.join("backups").join(name("x", 1)).exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn an_empty_file_is_not_accepted_as_a_copy() {
        let dir = temp("empty");
        let db = dir.join("memory.db");
        std::fs::write(&db, b"").expect("пустой");
        let error = make(&db, &dir.join("backups"), "x", 1, KEEP).expect_err("пусто");
        assert!(error.contains("пустой"), "{error}");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn old_copies_are_removed_and_the_newest_are_kept() {
        let dir = temp("rotate");
        let db = database(&dir);
        let backups = dir.join("backups");

        for index in 1..=7 {
            make(&db, &backups, &format!("2026112{index}-120000"), index, KEEP).expect("копия");
        }

        let left = list(&backups);
        assert_eq!(left.len(), KEEP, "должно остаться ровно {KEEP}");
        // Остались самые новые: имя V7 — последняя.
        assert!(
            left[0].path.to_string_lossy().contains("-v7"),
            "{:?}",
            left[0].path
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn newest_first_even_when_file_time_says_otherwise() {
        // Порядок по имени, а не по времени файла: синхронизация и копирование
        // меняют время, и «какая копия новее» стало бы врать.
        let dir = temp("order");
        std::fs::create_dir_all(&dir).expect("папка");
        std::fs::write(dir.join(name("20260101-000000", 1)), b"x").expect("старая");
        std::fs::write(dir.join(name("20261231-000000", 1)), b"x").expect("новая");

        let copies = list(&dir);
        assert!(copies[0].path.to_string_lossy().contains("20261231"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_broken_file_is_not_called_a_good_copy() {
        let dir = temp("broken");
        let path = dir.join(name("20261121-120000", 1));
        let mut bytes = b"SQLite format 3\0".to_vec();
        bytes.extend(std::iter::repeat_n(0xde, 512));
        std::fs::write(&path, bytes).expect("мусор");

        let error = verify(&path).expect_err("это не база");
        assert!(error.contains("повреждена") || error.contains("не открылась"), "{error}");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn expired_says_what_to_delete_without_touching_the_disk() {
        let copies: Vec<Copy> = (0..7)
            .map(|index| Copy {
                path: PathBuf::from(format!("memory-{index}.db")),
                bytes: 10,
            })
            .collect();

        let doomed = expired(&copies, 5);
        assert_eq!(doomed.len(), 2);
        // Стареют последние в списке (он уже отсортирован: новые первыми).
        assert_eq!(doomed[0], PathBuf::from("memory-5.db"));
    }

    #[test]
    fn restore_brings_back_a_good_copy_and_keeps_the_old_database() {
        let dir = temp("restore");
        let db = database(&dir);
        let backups = dir.join("backups");
        let made = make(&db, &backups, "20261121-120000", 1, KEEP).expect("копия");

        // Портим текущую базу: теперь восстановление — единственный путь.
        std::fs::write(&db, b"garbage").expect("порча");
        let file = made.path.file_name().expect("имя").to_string_lossy().to_string();

        let done = restore(&dir, &file).expect("восстановлено");
        assert!(done.bytes > 0);
        // Прежняя (битая) база отложена — иначе назад дороги нет.
        assert!(done.previous.is_some());
        verify(&dir.join("memory.db")).expect("база снова открывается");

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_refuses_a_path_instead_of_a_name() {
        let dir = temp("path");
        std::fs::create_dir_all(dir.join("backups")).expect("папка");

        for bad in ["../memory.db", "C:\\Windows\\x.db", "sub/dir.db", ""] {
            let error = restore(&dir, bad).expect_err("путь не принимается");
            assert!(error.contains("имя"), "{bad}: {error}");
        }
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn restore_does_not_replace_a_working_database_with_a_broken_copy() {
        let dir = temp("noreplace");
        let db = database(&dir);
        let backups = dir.join("backups");
        std::fs::create_dir_all(&backups).expect("папка");

        let broken = backups.join(name("20261121-120000", 1));
        let mut bytes = b"SQLite format 3\0".to_vec();
        bytes.extend(std::iter::repeat_n(0xde, 512));
        std::fs::write(&broken, bytes).expect("мусор");

        let error = restore(&dir, &name("20261121-120000", 1)).expect_err("битая копия");
        assert!(error.contains("повреждена") || error.contains("не открылась"), "{error}");

        // Рабочая база не тронута: отказ не должен ничего ломать.
        verify(&db).expect("рабочая база цела");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn the_list_says_which_copies_are_actually_usable() {
        let dir = temp("listed");
        let db = database(&dir);
        let backups = dir.join("backups");
        make(&db, &backups, "20261121-120000", 1, KEEP).expect("годная");

        let broken = backups.join(name("20261121-130000", 2));
        std::fs::write(&broken, b"not a database").expect("мусор");

        let rows = listed(&backups);
        assert_eq!(rows.len(), 2);
        let good = rows.iter().find(|row| row.file.contains("-v1")).expect("годная");
        let bad = rows.iter().find(|row| row.file.contains("-v2")).expect("битая");
        assert!(good.usable);
        assert!(!bad.usable);
        // Причина названа, а не «ошибка».
        assert!(!bad.problem.is_empty());
        let _ = std::fs::remove_dir_all(dir);
    }
}