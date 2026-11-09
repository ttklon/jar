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

/// Один шаг запуска: что сделали, чем кончилось, чем это подтверждено.
#[derive(Debug, Clone, Serialize)]
pub struct RunStep {
    pub position: i64,
    pub tool: String,
    pub ok: bool,
    pub reason: String,
    pub evidence: String,
}

/// Один запуск: инструмент, сценарий, скачивание. `finished_ms` пуст, пока он идёт.
#[derive(Debug, Clone, Serialize)]
pub struct RunRecord {
    pub id: i64,
    pub kind: String,
    pub subject: String,
    pub started_ms: u64,
    pub finished_ms: Option<u64>,
    pub outcome: String,
    /// Шаги по порядку. Пусто у запусков без шагов (например, скачивания).
    pub steps: Vec<RunStep>,
}

/// Найденный эпизод: запуск и слова запроса, которые в нём действительно есть.
///
/// `matched` возвращается, чтобы интерфейс мог сказать, *почему* запуск нашёлся. Без
/// этого поиск по памяти выглядит как гадание.
#[derive(Debug, Clone, Serialize)]
pub struct Episode {
    pub run: RunRecord,
    pub matched: Vec<String>,
}

/// Сколько запусков просматривает поиск. Память — не полнотекстовый индекс: честный
/// предел лучше, чем запрос, который однажды начнёт тормозить незаметно.
pub const SEARCH_DEPTH: usize = 2000;

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

    /// Значение факта по ключу. Факты — это «что я об этом знаю»: прошлые параметры,
    /// известный хеш файла модели. Нет значения — нет и догадок.
    pub fn fact(&self, key: &str) -> Option<String> {
        let conn = self.lock();
        conn.query_row(
            "SELECT value FROM facts WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok()
    }

    /// Пишет факт. Повторная запись обновляет значение и время, а не заводит вторую строку.
    pub fn remember(&self, key: &str, value: &str) -> Result<(), MemoryError> {
        let conn = self.lock();
        conn.execute(
            "INSERT INTO facts (key, value, updated_ms) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_ms = ?3",
            params![key, value, now_ms()],
        )?;
        Ok(())
    }

    /// Забывает факт. Нужно, когда сам предмет исчез: помнить хеш удалённого файла
    /// значит помнить то, чего нет.
    pub fn forget(&self, key: &str) -> Result<(), MemoryError> {
        let conn = self.lock();
        conn.execute("DELETE FROM facts WHERE key = ?1", params![key])?;
        Ok(())
    }

    /// Все факты с заданным началом ключа: так читаются списки («чему учиться»),
    /// не заводя под них отдельной таблицы.
    pub fn facts_with_prefix(&self, prefix: &str) -> Vec<(String, String)> {
        let conn = self.lock();
        let mut statement = match conn.prepare(
            "SELECT key, value FROM facts WHERE key LIKE ?1 ORDER BY key",
        ) {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };

        let pattern = format!("{prefix}%");
        let rows = statement.query_map(params![pattern], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        });

        match rows {
            Ok(rows) => rows.filter_map(Result::ok).collect(),
            Err(_) => Vec::new(),
        }
    }

    /// Запоминает параметры удачного запуска — их подставит интерфейс в следующий раз.
    pub fn remember_params(
        &self,
        tool: &str,
        values: &BTreeMap<String, String>,
    ) -> Result<(), MemoryError> {
        let value = serde_json::to_string(values).unwrap_or_else(|_| "{}".to_string());
        self.remember(&format!("params:{tool}"), &value)
    }

    /// Прошлые удачные параметры инструмента. Битый JSON — это «нет данных», а не паника.
    pub fn last_params(&self, tool: &str) -> Option<BTreeMap<String, String>> {
        let value = self.fact(&format!("params:{tool}"))?;
        serde_json::from_str(&value).ok()
    }

    /// Последние запуски, новые сверху, вместе с шагами.
    ///
    /// Шаги читаются отдельным запросом на запуск: запусков в списке единицы, а
    /// соединение таблиц здесь усложнило бы чтение ради экономии, которой не видно.
    pub fn recent_runs(&self, limit: usize) -> Result<Vec<RunRecord>, MemoryError> {
        let conn = self.lock();
        let mut runs: Vec<RunRecord> = {
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
                    steps: Vec::new(),
                })
            })?;
            rows.filter_map(Result::ok).collect()
        };

        for run in &mut runs {
            run.steps = steps_for(&conn, run.id)?;
        }

        Ok(runs)
    }

    /// Ищет прошлые запуски по словам: «что я делал с этой папкой?».
    ///
    /// Правила нарочно простые и проверяемые: запрос режется на слова (короче двух
    /// букв — не слова), каждое слово обязано найтись в запуске. Поэтому два слова
    /// сужают ответ, а не расширяют его: поиск здесь — фильтр, а не угадывание.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<Episode>, MemoryError> {
        let words = words(query);
        if words.is_empty() {
            return Ok(Vec::new());
        }

        let runs = self.recent_runs(SEARCH_DEPTH)?;
        let mut found = Vec::new();

        for run in runs {
            let haystack = haystack(&run);
            let matched: Vec<String> = words
                .iter()
                .filter(|word| haystack.contains(word.as_str()))
                .cloned()
                .collect();

            // Совпали все слова — иначе запуск не отвечает на вопрос целиком.
            if matched.len() == words.len() {
                found.push(Episode { run, matched });
            }
            if found.len() == limit {
                break;
            }
        }

        Ok(found)
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
        self.conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// Шаги одного запуска по порядку.
fn steps_for(conn: &Connection, run_id: i64) -> Result<Vec<RunStep>, MemoryError> {
    let mut statement = conn.prepare(
        "SELECT position, tool, ok, reason, evidence FROM steps
         WHERE run_id = ?1 ORDER BY position",
    )?;
    let rows = statement.query_map(params![run_id], |row| {
        Ok(RunStep {
            position: row.get(0)?,
            tool: row.get(1)?,
            ok: row.get::<_, i64>(2)? != 0,
            reason: row.get(3)?,
            evidence: row.get(4)?,
        })
    })?;
    Ok(rows.filter_map(Result::ok).collect())
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

/// Слова запроса: нижний регистр, без повторов, короткие отбрасываются.
fn words(query: &str) -> Vec<String> {
    let words: Vec<String> = query
        .to_lowercase()
        .split(|symbol: char| !symbol.is_alphanumeric())
        .filter(|word| word.chars().count() >= 2)
        .map(str::to_string)
        .collect();
    let mut unique: Vec<String> = Vec::with_capacity(words.len());
    for word in words {
        if !unique.contains(&word) {
            unique.push(word);
        }
    }
    unique
}

/// Всё, по чему запуск можно узнать: предмет, вид, шаги и их доказательства.
fn haystack(run: &RunRecord) -> String {
    let mut text = format!("{} {}", run.kind, run.subject).to_lowercase();
    for step in &run.steps {
        text.push(' ');
        text.push_str(&step.tool.to_lowercase());
        text.push(' ');
        text.push_str(&step.reason.to_lowercase());
        text.push(' ');
        text.push_str(&step.evidence.to_lowercase());
    }
    text
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
        let run_id = memory
            .start_run("tool", "files|создать|папку")
            .expect("запуск");
        memory
            .add_step(
                run_id,
                0,
                "files|создать|папку",
                true,
                "готово",
                "path_exists",
            )
            .expect("шаг");
        memory.finish_run(run_id, "ok").expect("итог");

        let runs = memory.recent_runs(5).expect("запуски");
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].outcome, "ok");
        assert_eq!(runs[0].subject, "files|создать|папку");
        assert!(runs[0].finished_ms.is_some(), "запуск закрыт временем");
        assert_eq!(runs[0].steps.len(), 1, "шаг читается вместе с запуском");
        assert_eq!(runs[0].steps[0].tool, "files|создать|папку");
        assert!(runs[0].steps[0].ok);
        assert_eq!(runs[0].steps[0].evidence, "path_exists");

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

    /// Три запуска: чистка загрузок, проверка диска и скачивание модели.
    fn seeded(name: &str) -> (Memory, PathBuf) {
        let (memory, dir) = temp_memory(name);

        let clean = memory
            .start_run("tool", "Уборка в Загрузках")
            .expect("запуск");
        memory
            .add_step(
                clean,
                1,
                "files|удалить|в корзину",
                true,
                "",
                "path_missing",
            )
            .expect("шаг");
        memory
            .add_step(
                clean,
                2,
                "files|проверить|дубликаты по хэшу",
                true,
                "",
                "duplicates=3",
            )
            .expect("шаг");
        memory.finish_run(clean, "ok").expect("итог");

        let disk = memory.start_run("tool", "Свободное место").expect("запуск");
        memory
            .add_step(
                disk,
                1,
                "storage-backup|проверить|свободное место",
                true,
                "",
                "free_gb=12",
            )
            .expect("шаг");
        memory.finish_run(disk, "ok").expect("итог");

        let model = memory
            .start_run("download", "qwen2.5-1.5b.gguf")
            .expect("запуск");
        memory.finish_run(model, "ok").expect("итог");

        (memory, dir)
    }

    #[test]
    fn search_finds_a_run_by_word_in_any_case() {
        let (memory, dir) = seeded("search-case");

        let found = memory.search("загрузк", 10).expect("поиск");
        assert_eq!(found.len(), 1, "нашлась уборка: {found:?}");
        assert_eq!(found[0].run.subject, "Уборка в Загрузках");
        assert_eq!(found[0].matched, vec!["загрузк".to_string()]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn two_words_narrow_the_answer_and_are_named() {
        let (memory, dir) = seeded("search-two");

        // «папк» есть в шаге уборки, «диска» нет нигде — пустой ответ, а не «примерно».
        assert!(memory
            .search("загрузки диска", 10)
            .expect("поиск")
            .is_empty());

        let found = memory.search("уборка хэшу", 10).expect("поиск");
        assert_eq!(found.len(), 1);
        assert_eq!(
            found[0].matched,
            vec!["уборка".to_string(), "хэшу".to_string()]
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn search_looks_inside_steps_not_only_subjects() {
        let (memory, dir) = seeded("search-steps");

        let found = memory.search("duplicates", 10).expect("поиск");
        assert_eq!(
            found.len(),
            1,
            "слово из доказательства шага тоже считается"
        );
        assert!(found[0].run.subject.contains("Загрузк"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_query_and_empty_memory_answer_nothing() {
        let (memory, dir) = seeded("search-empty");

        // Короче двух букв — не слово: «я» ничего не значит.
        assert!(memory.search("я", 10).expect("поиск").is_empty());
        assert!(memory.search("   ", 10).expect("поиск").is_empty());

        let (empty, empty_dir) = temp_memory("search-nothing");
        assert!(empty.search("диск", 10).expect("поиск").is_empty());

        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&empty_dir);
    }

    #[test]
    fn search_returns_newest_first_and_respects_the_limit() {
        let (memory, dir) = temp_memory("search-limit");

        for subject in ["Папка А", "Папка Б", "Папка В"] {
            let run = memory.start_run("tool", subject).expect("запуск");
            memory.finish_run(run, "ok").expect("итог");
        }

        let all = memory.search("папка", 10).expect("поиск");
        assert_eq!(all.len(), 3);
        assert!(all[0].run.id > all[1].run.id, "новые сверху");
        assert_eq!(all[0].run.subject, "Папка В");

        assert_eq!(memory.search("папка", 2).expect("поиск").len(), 2);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
