//! Логи приложения: файл в `%LOCALAPPDATA%\ZShelper\logs\zshelper.log`.
//!
//! Почему в файл, а не «в консоль»: это десктопное приложение, у пользователя нет
//! консоли, а разбираться в проблеме нужно по факту. Логи не содержат содержимого
//! файлов и секретов — это правило `policy.rs`/`audit.rs`, здесь только каркас.

use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use tracing_subscriber::EnvFilter;

/// Куда писать логи. На Windows — LOCALAPPDATA (не требует прав администратора),
/// иначе — временная папка: код должен собираться и на CI-раннере.
pub fn log_dir() -> PathBuf {
    match std::env::var_os("LOCALAPPDATA") {
        Some(base) => PathBuf::from(base).join("ZShelper").join("logs"),
        None => std::env::temp_dir().join("zshelper-logs"),
    }
}

pub fn log_file() -> PathBuf {
    log_dir().join("zshelper.log")
}

/// Сколько лог занимает до ротации.
///
/// Журнал действий ограничен отдельно (`audit.rs`), и это разные файлы: здесь
/// диагностика приложения, там — отчёт о делах. Правило одно: файл, который только
/// дописывается, обязан иметь предел, иначе диск съедается молча. Один мегабайт
/// лога — это дни работы с запасом.
pub const MAX_BYTES: u64 = 1024 * 1024;

/// Ротация лога: перерос — старый уезжает в `zshelper.log.1`, новый начинается с нуля.
///
/// Одна копия, а не десять: разбираться нужно в свежем, а не в архиве за полгода.
/// Ошибки не возвращаются: приложение обязано запуститься и без этого.
pub fn rotate() {
    rotate_at(&log_file(), MAX_BYTES);
}

/// Ротация конкретного файла.
///
/// Отдельно от `rotate`, потому что путь лога берётся из окружения: проверять
/// правило на настоящем `LOCALAPPDATA` значило бы трогать чужие файлы в тесте.
fn rotate_at(path: &Path, max_bytes: u64) {
    let size = match std::fs::metadata(path) {
        Ok(meta) => meta.len(),
        Err(_) => return,
    };
    if size < max_bytes {
        return;
    }
    let backup = path.with_file_name("zshelper.log.1");
    // Старая копия заменяется целиком: `rename` на Windows не перезапишет занятый файл.
    let _ = std::fs::remove_file(&backup);
    if let Err(error) = std::fs::rename(path, &backup) {
        eprintln!("zshelper: лог не ротируется: {error}");
    }
}

/// Писатель, который умеет клонироваться (tracing требует `MakeWriter`).
#[derive(Clone)]
struct FileSink(Arc<Mutex<std::fs::File>>);

impl Write for FileSink {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self.0.lock() {
            Ok(mut file) => file.write(buf),
            Err(_) => Err(io::Error::other("лог-файл заблокирован")),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self.0.lock() {
            Ok(mut file) => file.flush(),
            Err(_) => Ok(()),
        }
    }
}

/// Инициализирует подписчик и возвращает путь к файлу (его показывает UI).
/// Ошибки не фатальны: приложение обязано запуститься даже без прав на запись.
pub fn init() -> PathBuf {
    let path = log_file();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // До открытия: иначе новый файл открылся бы уже старым размером и дописывался дальше.
    rotate();

    let filter = EnvFilter::try_from_env("ZSHELPER_LOG")
        .unwrap_or_else(|_| EnvFilter::new("info,zshelper_lib=debug"));

    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(file) => {
            let sink = FileSink(Arc::new(Mutex::new(file)));
            let _ = tracing_subscriber::fmt()
                .with_env_filter(filter)
                .with_ansi(false)
                .with_target(true)
                .with_writer(move || sink.clone())
                .try_init();
        }
        Err(error) => {
            // Без файла — в stderr, но приложение работает.
            let _ = tracing_subscriber::fmt().with_env_filter(filter).try_init();
            eprintln!("zshelper: не удалось открыть {}: {error}", path.display());
        }
    }

    path
}

/// Создать папку для данных приложения (позже здесь база памяти и модели).
pub fn ensure_app_dir() -> Option<PathBuf> {
    let dir = log_dir().parent()?.to_path_buf();
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir)
}

pub fn path_display(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("zshelper-log-{name}-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        dir.join("zshelper.log")
    }

    #[test]
    fn a_log_over_the_limit_moves_aside() {
        let path = temp_path("rotate");
        let _ = std::fs::remove_file(path.with_file_name("zshelper.log.1"));
        std::fs::write(&path, "старый лог, который перерос предел\n").expect("лог");

        rotate_at(&path, 10);

        assert!(
            !path.exists(),
            "старый лог должен уехать в копию, а не остаться"
        );
        let backup = path.with_file_name("zshelper.log.1");
        assert!(backup.exists(), "копия должна быть рядом с логом");
        let moved = std::fs::read_to_string(&backup).unwrap_or_default();
        assert!(moved.contains("перерос"), "в копии должен быть прежний лог");

        let _ = std::fs::remove_dir_all(path.parent().unwrap_or(&path));
    }

    #[test]
    fn a_small_log_stays_where_it_is() {
        let path = temp_path("young");
        let _ = std::fs::remove_file(path.with_file_name("zshelper.log.1"));
        std::fs::write(&path, "мало\n").expect("лог");

        rotate_at(&path, MAX_BYTES);

        assert!(path.exists(), "молодой лог не трогаем");
        assert!(!path.with_file_name("zshelper.log.1").exists());

        let _ = std::fs::remove_dir_all(path.parent().unwrap_or(&path));
    }

    #[test]
    fn a_missing_log_is_not_an_error() {
        let path = temp_path("missing");
        let _ = std::fs::remove_file(&path);

        // Файла нет — ротация молчит, а не падает и не создаёт пустую копию.
        rotate_at(&path, 10);

        assert!(!path.with_file_name("zshelper.log.1").exists());
    }
}
