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
    /// Файл открылся, но база внутри битая. Отдельная ошибка, потому что действие
    /// человека другое: не «проверьте путь», а «база повреждена, вот копия».
    #[error("база повреждена: {0}")]
    Corrupt(String),
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
        // Целостность проверяется до миграций: `ALTER` по битой базе превращает
        // «повреждён один индекс» в «файл не открывается вовсе». Проверка
        // быстрая (`quick_check`), а не `integrity_check`: полный проход по
        // гигабайтной базе задерживал бы запуск на секунды.
        check_integrity(&conn)?;
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

    /// Все факты, по ключу. Нужно интерфейсу, чтобы не спрашивать одно и то же дважды.
    /// Пустая память — пустой список, а не ошибка.
    pub fn facts(&self) -> Vec<(String, String)> {
        let conn = self.lock();
        let mut statement = match conn.prepare("SELECT key, value FROM facts ORDER BY key") {
            Ok(statement) => statement,
            Err(_) => return Vec::new(),
        };

        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        });

        match rows {
            Ok(rows) => rows.filter_map(Result::ok).collect(),
            Err(_) => Vec::new(),
        }
    }

    /// Все факты с заданным началом ключа: так читаются списки («чему учиться»),
    /// не заводя под них отдельной таблицы.
    pub fn facts_with_prefix(&self, prefix: &str) -> Vec<(String, String)> {
        let conn = self.lock();
        let mut statement =
            match conn.prepare("SELECT key, value FROM facts WHERE key LIKE ?1 ORDER BY key") {
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
        let mut found: Vec<(usize, Episode)> = Vec::new();

        for run in runs {
            let haystack = haystack(&run);
            // Сравнение по началу слова, а не по вхождению подстроки:
            // «загрузки» иначе не находит «уборка в загрузках». Человек
            // говорит в именительном падеже, а запись может быть в любом.
            let matched: Vec<String> = words
                .iter()
                .filter(|word| contains_word(&haystack, word))
                .cloned()
                .collect();

            // Раньше требовалось совпадение **всех** слов — и «то, что было
            // вчера про диск» не находило ничего, потому что «было», «вчера»
            // и «про» в записях не встречаются. Фраза человека — не запрос к
            // базе: в ней есть служебные слова, и они не должны обнулять поиск.
            //
            // Теперь: засчитывается запуск, где нашлось **содержательное**
            // слово (не из служебных), а служебные только не мешают. Если все
            // слова служебные («что было вчера»), ищем по любому совпадению.
            if matched.is_empty() {
                continue;
            }
            let strong = matched.iter().filter(|word| !is_filler(word)).count();
            if strong > 0 || words.iter().all(|word| is_filler(word)) {
                found.push((strong, Episode { run, matched }));
            }
        }

        // Больше содержательных совпадений — выше: «про диск» должен идти
        // раньше, чем совпадение по одному «было». Сортировка устойчивая, и
        // при равном счёте порядок остаётся прежним — новые сверху.
        found.sort_by_key(|(strong, _)| std::cmp::Reverse(*strong));
        Ok(found
            .into_iter()
            .take(limit)
            .map(|(_, episode)| episode)
            .collect())
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

/// Проверить целостность базы и сказать о повреждении по-человечески.
///
/// `quick_check` возвращает одну строку `ok`, если всё цело, и список проблем
/// иначе. Отсутствие строки (пустой результат) — тоже проблема: молча продолжать
/// с базой, о которой ничего не известно, значит потерять данные тихо.
///
/// `PRAGMA` не может параметризоваться, поэтому строка запроса — константа, а не
/// собранная из чего-либо: подстановки здесь нет и быть не может.
pub fn check_integrity(conn: &Connection) -> Result<(), MemoryError> {
    let answer: String = conn
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| MemoryError::Corrupt(error.to_string()))?;

    if answer.trim().eq_ignore_ascii_case("ok") {
        return Ok(());
    }

    Err(MemoryError::Corrupt(format!(
        "проверка целостности не прошла: {}",
        answer.trim()
    )))
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
/// Есть ли слово в тексте — по началу слова, а не по вхождению подстроки.
///
/// «загрузки» должно находить «загрузках», «папка» — «папок», «диск» —
/// «диска». Искать `contains` здесь значит требовать точной формы слова,
/// которой у человека в голове нет.
fn contains_word(text: &str, word: &str) -> bool {
    // Русский текст: границей слова считаем всё, что не буква и не цифра.
    text.split(|symbol: char| !symbol.is_alphanumeric())
        .any(|part| shares_stem(part, word))
}

/// Общий корень: «загрузки» и «загрузках», «папка» и «папок».
///
/// Не `starts_with` в одну сторону: слово человека и слово записи могут
/// отличаться окончанием в любую сторону. Берём общее начало длиной не меньше
/// четырёх знаков — короче начинают совпадать случайные слова.
fn shares_stem(part: &str, word: &str) -> bool {
    let part: Vec<char> = part.chars().collect();
    let word: Vec<char> = word.chars().collect();
    let common = part
        .iter()
        .zip(word.iter())
        .take_while(|(left, right)| left == right)
        .count();
    if common == part.len() && common == word.len() {
        return true;
    }
    // Общий корень не короче четырёх знаков, а хвост отличается не больше
    // чем на два: «загрузки»/«загрузках» и «диска»/«диск» — да,
    // «сеть»/«сетка» — нет. Порог — не точная морфология, а проверяемое
    // правило: его видно и его можно оспорить, в отличие от «похоже звучит».
    common >= 4 && part.len().abs_diff(word.len()) <= 2
}

/// Служебные слова: в записях их нет, и требовать их совпадения — значит
/// обнулять поиск на живом вопросе.
///
/// Список нарочно короткий: только то, что человек говорит о времени и о самом
/// действии. Добавлять сюда редкие слова опасно — тогда они перестанут
/// находиться по-настоящему.
fn is_filler(word: &str) -> bool {
    matches!(
        word,
        "что"
            | "было"
            | "был"
            | "была"
            | "были"
            | "вчера"
            | "сегодня"
            | "позавчера"
            | "про"
            | "как"
            | "где"
            | "когда"
            | "это"
            | "мне"
            | "я"
            | "он"
            | "она"
            | "ещё"
            | "еще"
            | "уже"
            | "надо"
            | "можно"
            | "делал"
            | "делали"
            | "the"
            | "a"
            | "about"
    )
}

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

/// Пересоздать базу памяти: старую — копией рядом, новую — пустой рабочей.
///
/// Зачем это вообще нужно. Битый файл базы — единственное, что нельзя починить
/// кнопкой «скачать заново»: журнал в нём, и потерять его страшнее, чем
/// расстаться с фактами. Поэтому старая база не удаляется, а становится
/// копией в `backups/`, годность копии проверяется тем же `backup::verify`,
/// что и при старте, — и только потом на месте базы создаётся новая.
///
/// Возвращает путь копии: человеку нужно знать, куда смотреть, если он захочет
/// вернуть журнал.
pub fn rebuild(base_dir: &Path) -> Result<String, String> {
    let path = base_dir.join("memory.db");
    let copies = crate::backup::dir(base_dir);
    let stamp = format!("{}-rebuild", now_ms());
    let made = crate::backup::make(
        &path,
        &copies,
        &stamp,
        SCHEMA_VERSION as u32,
        crate::backup::KEEP,
    )
    .map_err(|error| format!("копию сделать не удалось: {error}"))?;
    // Годность копии проверяется ДО удаления оригинала: «наверное, целая» —
    // не страховка, а надежда.
    crate::backup::verify(&made.path).map_err(|error| {
        format!(
            "копия не проходит проверку ({error}); база оставлена как есть, чтобы не потерять её"
        )
    })?;
    std::fs::remove_file(&path).map_err(|error| format!("старая база не удалилась: {error}"))?;
    // Новая создаётся тем же путём, что и при обычном старте: схема, миграции
    // и проверки не должны расходиться между «первым запуском» и «ремонтом».
    Memory::open(path.clone()).map_err(|error| format!("новая база не создалась: {error}"))?;
    Ok(made.path.display().to_string())
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
    fn facts_are_read_back_and_forgotten() {
        let (memory, dir) = temp_memory("facts");

        assert!(memory.facts().is_empty(), "пустая память — пустой список");

        memory
            .remember("вопрос:путь", "D:\\Отчёты")
            .expect("запись");
        memory.remember("вопрос:браузер", "Chrome").expect("запись");

        let facts = memory.facts();
        assert_eq!(
            facts,
            vec![
                ("вопрос:браузер".to_string(), "Chrome".to_string()),
                ("вопрос:путь".to_string(), "D:\\Отчёты".to_string()),
            ],
            "факты приходят по ключу, чтобы интерфейс мог их сопоставить"
        );

        memory.forget("вопрос:путь").expect("забывание");
        assert_eq!(
            memory.fact("вопрос:путь"),
            None,
            "забытый факт не подставляется второй раз"
        );

        let _ = std::fs::remove_dir_all(&dir);
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

        // Шаг 363: «загрузки диска» теперь находит уборку — по слову
        // «загрузки», хотя «диска» нет нигде. Прежнее правило требовало всех
        // слов и не находило живую фразу.
        let softer = memory.search("загрузки диска", 10).expect("поиск");
        assert_eq!(softer.len(), 1, "нашлось по содержательному слову");
        assert_eq!(softer[0].run.subject, "Уборка в Загрузках");

        let found = memory.search("уборка хэшу", 10).expect("поиск");
        assert_eq!(found.len(), 1);
        assert_eq!(
            found[0].matched,
            vec!["уборка".to_string(), "хэшу".to_string()]
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Шаг 363: сюда приходят с фразой, а не с запросом к базе.
    ///
    /// «то, что было вчера про диск» раньше не находило ничего: слова «что»,
    /// «было», «вчера», «про» в записях не встречаются, а требовались все.
    #[test]
    fn a_spoken_phrase_finds_a_deed_by_its_meaningful_words() {
        let (memory, dir) = seeded("search-phrase");

        let found = memory
            .search("то, что было вчера про загрузки", 10)
            .expect("поиск");
        assert_eq!(found.len(), 1, "служебные слова не обнуляют поиск: {found:?}");
        assert_eq!(found[0].run.subject, "Уборка в Загрузках");
        // Совпавшими называются все найденные слова, включая служебное «было»,
        // если оно вдруг встретилось в записи: человек должен видеть, почему
        // это нашлось.
        assert!(found[0].matched.contains(&"загрузки".to_string()));

        // А фраза целиком из служебных слов ищет по любому совпадению, а не
        // отвечает «ничего»: вопрос был, пусть и без содержательных слов.
        let vague = memory.search("что было вчера", 10).expect("поиск");
        assert!(vague.is_empty(), "в записях нет даже служебных слов");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Шаг 363: падежи не должны мешать. Человек говорит «загрузки», а в
    /// записи «загрузках»; требовать точной формы значит требовать того,
    /// чего у человека в голове нет.
    #[test]
    fn a_case_ending_does_not_break_a_match() {
        assert!(contains_word("уборка в загрузках", "загрузки"));
        assert!(contains_word("уборка в загрузках", "загрузк"));
        assert!(contains_word("отчёт по диску", "диска"));
        assert!(contains_word("модели в папке", "модель"));
    }

    /// А похожие, но разные слова — не совпадают: иначе «сеть» находила бы
    /// «сетку», и поиск врал бы тихо.
    #[test]
    fn similar_but_different_words_do_not_match() {
        assert!(!contains_word("сетка для проводов", "сеть"));
        assert!(!contains_word("дисконт в магазине", "диск"));
        // «форма» и «формально» — разные слова; различие в хвосте больше
        // падежного окончания, и находить одно по другому значит врать.
        assert!(!contains_word("формально всё верно", "форма"));
    }

    /// Содержательное совпадение важнее: оно идёт первым.
    #[test]
    fn the_most_meaningful_match_comes_first() {
        let (memory, dir) = temp_memory("search-rank");

        for subject in ["Отчёт по диску", "Про диск и память"] {
            let run = memory.start_run("tool", subject).expect("запуск");
            memory.finish_run(run, "ok").expect("итог");
        }

        // «было» служебное, «диск» — нет: оба запуска подходят по «диск»,
        // а по числу содержательных совпадений они равны, и порядок — новый
        // сверху, как и раньше.
        let found = memory.search("было диск", 10).expect("поиск");
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].run.subject, "Про диск и память");

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

    #[test]
    fn a_healthy_database_passes_the_integrity_check() {
        let (memory, dir) = temp_memory("healthy");
        // Факт записан — база не пустая, проверка идёт по настоящим страницам.
        memory.remember("проверка", "значение").expect("запись");
        check_integrity(&memory.lock()).expect("целая база проходит");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_broken_file_is_named_corrupt_not_silently_opened() {
        // Файл есть, но это не база: ровно то, что остаётся после обрыва записи.
        let dir = std::env::temp_dir().join(format!("zshelper-broken-{}", now_ms()));
        std::fs::create_dir_all(&dir).expect("папка");
        let path = dir.join("memory.db");
        // Заголовок правильный, дальше — мусор: именно так выглядит файл после
        // обрыва записи. Байты только ASCII: клиппи справедливо запрещает
        // кириллицу в байтовом литерале (кодировка не видна из кода).
        let mut bytes = b"SQLite format 3\0".to_vec();
        bytes.extend(std::iter::repeat_n(0xde, 512));
        std::fs::write(&path, bytes).expect("запись");

        // `expect_err` требует `Debug` у успешного значения, а `Memory` его не
        // реализует нарочно (внутри соединение). Поэтому сравниваем явно.
        let error = match Memory::open(path) {
            Ok(_) => panic!("битая база не должна открываться как здоровая"),
            Err(error) => error,
        };
        let text = error.to_string();
        // Действие человека другое: не «проверьте путь», а «база повреждена».
        assert!(
            text.contains("повреждена") || text.contains("не открылась"),
            "{text}"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn an_empty_file_still_becomes_a_working_database() {
        // Пустой файл — это не повреждение: так выглядит база, созданная нулевым
        // размером при первом запуске.
        let dir = std::env::temp_dir().join(format!("zshelper-empty-{}", now_ms()));
        std::fs::create_dir_all(&dir).expect("папка");
        let path = dir.join("memory.db");
        std::fs::write(&path, b"").expect("пустой файл");

        let memory = Memory::open(path).expect("пустой файл открывается");
        memory
            .remember("ключ", "значение")
            .expect("запись работает");
        assert_eq!(memory.fact("ключ").as_deref(), Some("значение"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
