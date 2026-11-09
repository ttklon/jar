//! Память приложения: SQLite рядом с журналом и логами.
//!
//! Зачем отдельная база, если есть `audit.jsonl`: журнал отвечает на вопрос «что
//! произошло» и пишется построчно, чтобы пережить падение. Память отвечает на другой
//! вопрос — «что я об этом уже знаю»: какие запуски были, чем кончился каждый шаг,
//! какие параметры работали в прошлый раз. Это нужно планировщику и интерфейсу, и
//! это нельзя вычитать из плоского лога без боли.
//!
//! Правила:
//! * значения параметров, которые человек ввёл, хранятся, только если запуск удался —
//!   неудачный ввод не должен подставляться в следующий раз;
//! * секретов здесь нет по построению: инструменты принимают пути и маски, а не пароли;
//! * схема версионируется через `PRAGMA user_version`, миграции идемпотентны.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::Serialize;

/// Версия схемы. Поднимается вместе с новой миграцией в `migrate`.
pub const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, thiserror::Error)]
pub enum MemoryError {
    #[error("база не открылась: {0}")]
    Open(#[from] rusqlite::Error),
    #[error("путь базы не создан: {0}")]
    Path(String),
}

/// Один запуск: инструмент или сценарий. `finished_ms` пуст, пока запуск идёт.
#[derive(Debug, Clone, Serialize)]
pub struct RunRecord {
    pub id: i64,
    pub kind: String,
    pub subject: String,
    pub started_ms: u64,
    pub finished_ms: Option<u64>,
    pub outcome: String,
}

/// Память приложения. `Connection` не `Sync`, поэтому он под мьютексом: команды
/// ядра приходят из разных потоков, а база одна.
pub struct Memory {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Memory {
    /// Открывает (и при необходимости создаёт) базу. Схема приводится к текущей версии.
    pub fn open(path: PathBuf) -> Result<Self, MemoryError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| MemoryError::Path(error.to_string()))?;
        }

        let conn = Connection::open(&path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
        migrate(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            path,
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Начинает запуск. Возвращает его номер для шагов и завершения.
    pub fn start_run(&self, kind: &str, subject: &str) -> Result<i64, MemoryError> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO runs (kind, subject, started_ms, outcome) VALUES (?1, ?2, ?3, 'running')",
            params![kind, subject, now_ms()],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Закрывает запуск итогом (`ok`, `failed`, `denied`, `cancelled`).
    pub fn finish_run(&self, run_id: i64, outcome: &str) -> Result<(), MemoryError> {
        let conn = self.lock();
        conn.execute(
            "UPDATE runs SET finished_ms = ?2, outcome = ?3 WHERE id = ?1",
            params![run_id, now_ms(), outcome],
        )?;
        Ok(())
    }

    /// Записывает шаг запуска. `evidence` — короткое описание доказательства.
    pub fn add_step(
        &self,
        run_id: i64,
        position: i64,
        tool: &str,
        ok: bool,
        reason: &str,
        evidence: &str,
    ) -> Result<(), MemoryError> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO steps (run_id, position, tool, ok, reason, evidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![run_id, position, tool, ok as i64, reason, evidence],
        )?;
        Ok(())
    }

    /// Запоминает параметры удачного запуска — их подставит интерфейс в следующий раз.
    pub fn remember_params(
        &self,
        tool: &str,
        values: &BTreeMap<String, String>,
    ) -> Result<(), MemoryError> {
        let key = format!("params:{tool}");
        let value = serde_json::to_string(values).unwrap_or_else(|_| "{}".to_string());
        let conn = self.lock();
        conn.execute(
            "INSERT INTO facts (key, value, updated_ms) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_ms = ?3",
            params![key, value, now_ms()],
        )?;
        Ok(())
    }

    /// Прошлые удачные параметры инструмента. Битый JSON — это «нет данных», а не паника.
    pub fn last_params(&self, tool: &str) -> Option<BTreeMap<String, String>> {
        let key = format!("params:{tool}");
        let conn = self.lock();
        let value: String = conn
            .query_row("SELECT value FROM facts WHERE key = ?1", params![key], |row| {
                row.get(0)
            })
            .ok()?;
        serde_json::from_str(&value).ok()
    }

    /// Последние запуски, новые сверху.
    pub fn recent_runs(&self, limit: usize) -> Result<Vec<RunRecord>, MemoryError> {
        let conn = self.lock();
        let mut statement = conn.prepare(
            "SELECT id, kind, subject, started_ms, finished_ms, outcome
             FROM runs ORDER BY id DESC LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit as i64], |row| {
            Ok(RunRecord {
                id: row.get(0)?,
                kind: row.get(1)?,
                subject: row.get(2)?,
                started_ms: row.get(3)?,
                finished_ms: row.get(4)?,
                outcome: row.get(5)?,
            })
        })?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    /// Версия схемы — то, что записано в файле, а не в константе.
    pub fn schema_version(&self) -> i64 {
        let conn = self.lock();
        conn.query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap_or(0)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Connection> {
        // Отравленный мьютекс означает панику в другом потоке; база от этого не портится,
        // а терять память целиком хуже, чем продолжить с ней.
        self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Миграции. `user_version` — единственный источник правды о том, что уже применено.
fn migrate(conn: &Connection) -> Result<(), rusqlite::Error> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if version < 1 {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE IF NOT EXISTS runs (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               kind TEXT NOT NULL,
               subject TEXT NOT NULL,
               started_ms INTEGER NOT NULL,
               finished_ms INTEGER,
               outcome TEXT NOT NULL DEFAULT 'running'
             );
             CREATE TABLE IF NOT EXISTS steps (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               run_id INTEGER NOT NULL REFERENCES runs(id),
               position INTEGER NOT NULL,
               tool TEXT NOT NULL,
               ok INTEGER NOT NULL,
               reason TEXT NOT NULL DEFAULT '',
               evidence TEXT NOT NULL DEFAULT ''
             );
             CREATE INDEX IF NOT EXISTS steps_by_run ON steps(run_id, position);
             CREATE TABLE IF NOT EXISTS facts (
               key TEXT PRIMARY KEY,
               value TEXT NOT NULL,
               updated_ms INTEGER NOT NULL
             );
             PRAGMA user_version = 1;
             COMMIT;",
        )?;
    }

    Ok(())
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_memory(name: &str) -> (Memory, PathBuf) {
        let dir = std::env::temp_dir().join(format!("zshelper-memory-{name}-{}", now_ms()));
        let path = dir.join("memory.db");
        let memory = Memory::open(path.clone()).expect("база открывается");
        (memory, dir)
    }

    #[test]
    fn schema_is_created_and_versioned() {
        let (memory, dir) = temp_memory("schema");
        assert_eq!(memory.schema_version(), SCHEMA_VERSION);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn opening_twice_does_not_duplicate_the_schema() {
        let (memory, dir) = temp_memory("idempotent");
        let path = memory.path().to_path_buf();
        drop(memory);

        let again = Memory::open(path).expect("повторное открытие");
        assert_eq!(again.schema_version(), SCHEMA_VERSION);
        assert!(again.recent_runs(10).expect("пустая база").is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn run_with_steps_is_recorded_and_read_back() {
        let (memory, dir) = temp_memory("runs");
        let run_id = memory.start_run("tool", "files|создать|папку").expect("запуск");
        memory
            .add_step(run_id, 0, "files|создать|папку", true, "готово", "path_exists")
            .expect("шаг");
        memory.finish_run(run_id, "ok").expect("итог");

        let runs = memory.recent_runs(5).expect("запуски");
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].outcome, "ok");
        assert_eq!(runs[0].subject, "files|создать|папку");
        assert!(runs[0].finished_ms.is_some(), "запуск закрыт временем");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn params_are_remembered_only_when_asked() {
        let (memory, dir) = temp_memory("facts");
        assert!(memory.last_params("files|создать|папку").is_none());

        let values = BTreeMap::from([("path".to_string(), "C:\\tmp".to_string())]);
        memory
            .remember_params("files|создать|папку", &values)
            .expect("запомнено");

        let back = memory
            .last_params("files|создать|папку")
            .expect("прошлые параметры");
        assert_eq!(back["path"], "C:\\tmp");

        // Другой инструмент не видит чужих параметров.
        assert!(memory.last_params("files|удалить|в корзину").is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
