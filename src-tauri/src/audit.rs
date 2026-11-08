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

pub struct Audit {
    path: PathBuf,
}

impl Audit {
    pub fn new(path: PathBuf) -> Self {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
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
