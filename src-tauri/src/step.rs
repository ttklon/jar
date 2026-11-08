//! Результат шага и доказательство.
//!
//! Правило проекта: шаг считается выполненным не потому, что «команда не выдала
//! ошибку», а потому, что есть независимое доказательство результата. Поэтому
//! `StepResult` всегда несёт `evidence`, а не только `ok`.

use serde::Serialize;

/// Что именно подтверждает результат.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Evidence {
    ExitCode { code: i32 },
    PathExists { path: String, exists: bool },
    StdoutMarker { marker: String, found: bool },
    Failed { reason: String },
}

impl Evidence {
    pub fn kind(&self) -> &'static str {
        match self {
            Evidence::ExitCode { .. } => "exit_code",
            Evidence::PathExists { .. } => "path_exists",
            Evidence::StdoutMarker { .. } => "stdout_marker",
            Evidence::Failed { .. } => "failed",
        }
    }

    /// Человекочитаемая строка для интерфейса и журнала.
    pub fn summary(&self) -> String {
        match self {
            Evidence::ExitCode { code } => format!("код возврата {code}"),
            Evidence::PathExists { path, exists } => {
                if *exists {
                    format!("путь существует: {path}")
                } else {
                    format!("путь отсутствует: {path}")
                }
            }
            Evidence::StdoutMarker { marker, found } => {
                if *found {
                    format!("в выводе найден признак «{marker}»")
                } else {
                    format!("признак «{marker}» в выводе не найден")
                }
            }
            Evidence::Failed { reason } => format!("не выполнено: {reason}"),
        }
    }
}

/// Итог одного шага. Хвосты вывода ограничены: в UI не нужны мегабайты,
/// а в журнале — тем более.
#[derive(Debug, Clone, Serialize)]
pub struct StepResult {
    /// Ключ реестра `domain|verb|object`.
    pub registry: String,
    pub ok: bool,
    pub evidence: Evidence,
    pub reason: String,
    pub stdout_tail: String,
    pub stderr_tail: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
    pub cancelled: bool,
    pub duration_ms: u64,
}

impl StepResult {
    pub fn failed(registry: &str, reason: impl Into<String>) -> Self {
        let reason = reason.into();
        Self {
            registry: registry.to_string(),
            ok: false,
            evidence: Evidence::Failed {
                reason: reason.clone(),
            },
            reason,
            stdout_tail: String::new(),
            stderr_tail: String::new(),
            exit_code: None,
            timed_out: false,
            cancelled: false,
            duration_ms: 0,
        }
    }
}

/// Оставить последние `limit` символов строки (по границе символа, не байта).
pub fn tail(text: &str, limit: usize) -> String {
    if text.chars().count() <= limit {
        return text.to_string();
    }
    let skip = text.chars().count() - limit;
    text.chars().skip(skip).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tail_keeps_the_end_and_counts_characters() {
        assert_eq!(tail("abcdef", 3), "def");
        assert_eq!(tail("abc", 10), "abc");
        // Русские буквы — не байты: 5 символов по 2 байта не должны резаться.
        assert_eq!(tail("привет", 3), "вет");
    }

    #[test]
    fn failed_result_has_no_evidence_of_success() {
        let result = StepResult::failed("files|создать|папку", "нет прав");
        assert!(!result.ok);
        assert!(matches!(result.evidence, Evidence::Failed { .. }));
        assert_eq!(result.evidence.kind(), "failed");
    }

    #[test]
    fn evidence_is_serialised_with_a_kind_tag() {
        let json = serde_json::to_value(Evidence::PathExists {
            path: "C:\\tmp".into(),
            exists: true,
        })
        .unwrap();
        assert_eq!(json["kind"], "path_exists");
        assert_eq!(json["exists"], true);
    }
}
