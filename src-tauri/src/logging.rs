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
            let _ = tracing_subscriber::fmt()
                .with_env_filter(filter)
                .try_init();
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
