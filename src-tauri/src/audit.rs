//! Журнал действий: что просили, что решили, что вышло.
//!
//! Требования простые и жёсткие:
//! * журнал локальный (`%LOCALAPPDATA%\ZShelper\audit.jsonl`), никуда не отправляется;
//! * пишется **до** и **после** выполнения — если приложение упало посреди действия,
//!   останется запись «начал»;
//! * в журнал не попадают секреты и содержимое файлов: только ключ действия, риск,
//!   решение политики, хеш аргументов и результат.
//!
//! Формат — JSON Lines: одна строка на событие, дописывание без перезаписи, файл
//! читается и глазами, и `jq`, и будущим экраном «История».

use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Одно событие журнала.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    /// Unix-время в миллисекундах: сортировать и склеивать с логами проще, чем строки.
    pub at_ms: u128,
    pub kind: AuditKind,
    /// Ключ реестра `domain|verb|object` или `policy` для решений без действия.
    pub subject: String,
    pub risk: String,
    pub decision: String,
    /// Хеш аргументов: сам путь или текст в журнал не пишем.
    pub args_fingerprint: String,
    /// Короткий итог: `ok`, `error: …`, `denied: …`.
    pub outcome: String,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuditKind {
    Requested,
    Confirmed,
    Started,
    Finished,
    Denied,
}

/// Сколько журнал занимает до ротации.
///
/// Почему предел вообще нужен: журнал дописывается на каждое действие и не
/// переписывается, поэтому растёт вечно. Через год работы это десятки мегабайт, а
/// читается он целиком — `recent` и `tail` открывают файл как строку, чтобы взять
/// последние двадцать событий. Диск и память упирались бы в историю, которую никто
/// не читает. Два мегабайта — это десятки тысяч событий: с лихвой хватает, чтобы
/// разобраться в «что случилось вчера».
pub const MAX_BYTES: u64 = 2 * 1024 * 1024;

pub struct Audit {
    path: PathBuf,
    max_bytes: u64,
}

impl Audit {
    pub fn new(path: PathBuf) -> Self {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        Self {
            path,
            max_bytes: MAX_BYTES,
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Ротация: перерос журнал предел — старый уезжает в `audit.1.jsonl`, новый
    /// начинается с нуля.
    ///
    /// Одна копия, а не десять: журнал нужен, чтобы понять недавнее, а не вести
    /// архив. Копия перезаписывается — иначе «ротация» была бы тем же бесконечным
    /// ростом, только с другим именем. Ошибка не возвращается: журнал важен, но
    /// действие важнее, и падать из-за него нельзя — то же правило, что у `write`.
    fn rotate_if_needed(&self) {
        let size = match std::fs::metadata(&self.path) {
            Ok(meta) => meta.len(),
            // Файла ещё нет — ротировать нечего.
            Err(_) => return,
        };
        if size < self.max_bytes {
            return;
        }

        let backup = match self.path.file_name() {
            Some(name) => {
                let mut name = name.to_os_string();
                name.push(".1");
                self.path.with_file_name(name)
            }
            None => return,
        };

        // Копия заменяется целиком: `rename` на Windows не перезапишет занятый файл,
        // поэтому старую копию убираем заранее, а не надеемся на удачу.
        let _ = std::fs::remove_file(&backup);
        if let Err(error) = std::fs::rename(&self.path, &backup) {
            // Не удалось — журнал продолжает расти, но приложение работает.
            tracing::warn!(%error, path = %self.path.display(), "журнал не ротируется");
        }
    }

    /// Дописывает событие. Ошибки записи не должны ломать действие: журнал важен,
    /// но приложение важнее — поэтому ошибка уходит в лог, а не наружу.
    pub fn write(&self, event: AuditEvent) {
        let line = match serde_json::to_string(&event) {
            Ok(line) => line,
            Err(error) => {
                tracing::warn!(%error, "событие журнала не сериализуется");
                return;
            }
        };

        // Ротация — до открытия: иначе новый файл открылся бы уже старым размером.
        self.rotate_if_needed();

        match std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            Ok(mut file) => {
                if let Err(error) = writeln!(file, "{line}") {
                    tracing::warn!(%error, path = %self.path.display(), "журнал не пишется");
                }
            }
            Err(error) => {
                tracing::warn!(%error, path = %self.path.display(), "журнал не открывается");
            }
        }
    }

    /// Последние события, новые сверху — для экрана «Журнал».
    ///
    /// Битая строка (например, оборванная запись при падении приложения) молча
    /// пропускается: экран истории не должен ломаться из-за одной испорченной строки.
    /// Поэтому журнал и пишется построчно, а не как один JSON-документ.
    pub fn recent(&self, limit: usize) -> Vec<AuditEvent> {
        let text = match std::fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(_) => return Vec::new(),
        };

        text.lines()
            .rev()
            .filter(|line| !line.trim().is_empty())
            .filter_map(|line| serde_json::from_str::<AuditEvent>(line).ok())
            .take(limit)
            .collect()
    }

    /// Последние `limit` строк — для экрана истории.
    pub fn tail(&self, limit: usize) -> Vec<String> {
        let text = match std::fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(_) => return Vec::new(),
        };
        let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
        if lines.len() > limit {
            lines = lines.split_off(lines.len() - limit);
        }
        lines
    }
}

pub fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(kind: AuditKind, outcome: &str) -> AuditEvent {
        AuditEvent {
            at_ms: now_ms(),
            kind,
            subject: "files|создать|папку".into(),
            risk: "write-local".into(),
            decision: "confirm".into(),
            args_fingerprint: "abc".into(),
            outcome: outcome.into(),
            duration_ms: 12,
        }
    }

    #[test]
    fn writes_and_reads_back() {
        let dir = std::env::temp_dir().join(format!("zshelper-audit-{}", now_ms()));
        let audit = Audit::new(dir.join("audit.jsonl"));
        audit.write(event(AuditKind::Started, "started"));
        audit.write(event(AuditKind::Finished, "ok"));

        let tail = audit.tail(10);
        assert_eq!(tail.len(), 2);
        assert!(tail[1].contains("\"outcome\":\"ok\""));
        // Журнал — это JSON Lines: каждая строка парсится отдельно.
        let parsed: serde_json::Value = serde_json::from_str(&tail[0]).unwrap();
        assert_eq!(parsed["kind"], "started");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn tail_limits_oldest_first() {
        let dir = std::env::temp_dir().join(format!("zshelper-audit-tail-{}", now_ms()));
        let audit = Audit::new(dir.join("audit.jsonl"));
        for index in 0..5 {
            audit.write(event(AuditKind::Finished, &format!("ok-{index}")));
        }
        let tail = audit.tail(2);
        assert_eq!(tail.len(), 2);
        assert!(tail[1].contains("ok-4"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn recent_returns_newest_first_and_skips_broken_lines() {
        let dir = std::env::temp_dir().join(format!("zshelper-audit-recent-{}", now_ms()));
        let path = dir.join("audit.jsonl");
        let audit = Audit::new(path.clone());
        audit.write(event(AuditKind::Requested, "requested"));
        audit.write(event(AuditKind::Finished, "ok"));

        // Оборванная запись — так выглядит падение посреди строки.
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .expect("файл открывается");
        std::io::Write::write_all(&mut file, b"{\"at_ms\": 1, \"kind\": \"fini").expect("дописано");
        drop(file);

        let recent = audit.recent(10);
        assert_eq!(recent.len(), 2, "битая строка не должна ломать экран");
        assert_eq!(recent[0].outcome, "ok", "сначала новые события");
        assert_eq!(recent[1].outcome, "requested");

        assert_eq!(audit.recent(1).len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Журнал с маленьким пределом: настоящие два мегабайта в тесте не наберёшь без
    /// тысяч событий, а проверять надо саму ротацию, а не терпение.
    fn small(path: PathBuf, max_bytes: u64) -> Audit {
        // Папку создаём здесь же: `Audit::new` это делает, а этот конструктор идёт
        // мимо него — без папки запись молча не удалась бы, и тест врал бы о ротации.
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        Audit { path, max_bytes }
    }

    #[test]
    fn the_journal_does_not_grow_without_limit() {
        let dir = std::env::temp_dir().join(format!("zshelper-audit-rotate-{}", now_ms()));
        let path = dir.join("audit.jsonl");
        let audit = small(path.clone(), 900);
        for index in 0..40 {
            audit.write(event(AuditKind::Finished, &format!("ok-{index}")));
        }

        // Журнал ограничен, а не просто «стал поменьше». Запас в одну запись честный:
        // ротация смотрит на размер перед записью, поэтому последняя строка может
        // переступить предел — но не больше чем на себя саму.
        let size = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
        assert!(
            size < 900 + 400,
            "журнал дорос до {size} байт при пределе 900: ротация не работает"
        );
        // Сорок событий целиком в журнале не лежат: иначе предела нет вовсе.
        let lines = std::fs::read_to_string(&path)
            .map(|text| text.lines().count())
            .unwrap_or(0);
        assert!(lines < 40, "в журнале {lines} строк — ротация не срабатывала");
        // Одна резервная копия, а не десять: архив не растёт вместо журнала.
        let backup = dir.join("audit.jsonl.1");
        assert!(backup.exists(), "старый журнал должен уехать в копию");
        let copies = std::fs::read_dir(&dir)
            .map(|entries| {
                entries
                    .filter_map(Result::ok)
                    .filter(|entry| entry.file_name().to_string_lossy().contains(".jsonl"))
                    .count()
            })
            .unwrap_or(0);
        assert_eq!(copies, 2, "журнал и ровно одна копия");

        // Новое читается, старое не потеряно целиком.
        assert!(!audit.recent(5).is_empty());
        let archive = std::fs::read_to_string(&backup).unwrap_or_default();
        assert!(!archive.trim().is_empty(), "в копии должны остаться события");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_young_journal_is_not_rotated() {
        let dir = std::env::temp_dir().join(format!("zshelper-audit-young-{}", now_ms()));
        let path = dir.join("audit.jsonl");
        let audit = small(path.clone(), MAX_BYTES);
        audit.write(event(AuditKind::Started, "started"));

        assert!(!dir.join("audit.jsonl.1").exists(), "молодой журнал не трогаем");
        assert_eq!(audit.tail(10).len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_file_reads_as_empty() {
        let audit = Audit::new(
            std::env::temp_dir()
                .join("zshelper-audit-missing")
                .join("none.jsonl"),
        );
        assert!(audit.tail(5).is_empty());
    }
}
