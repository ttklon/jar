//! Проверка результата шага.
//!
//! Успешный код возврата — не доказательство: `New-Item` вернёт 0 и тогда, когда
//! папка уже была, а `Get-ChildItem` — когда папки нет, но ошибка подавлена
//! `-ErrorAction SilentlyContinue`. Поэтому каждая «рука» объявляет, что именно
//! считается результатом, и проверка идёт по независимому признаку.

use std::path::Path;

use crate::executor::ExecOutput;
use crate::step::{tail, Evidence, StepResult};

pub const OUTPUT_TAIL: usize = 4000;

/// Что должно быть правдой после выполнения.
#[derive(Debug, Clone, PartialEq)]
pub enum Expectation {
    /// Код возврата 0 и процесс не был прерван.
    ExitZero,
    /// Код 0 и в выводе есть признак (например, `ZSHELPER-OK`).
    StdoutMarker(&'static str),
    /// Путь существует (папка или файл).
    PathExists(String),
    /// Пути больше нет (удаление).
    PathAbsent(String),
}

impl Expectation {
    pub fn describe(&self) -> String {
        match self {
            Expectation::ExitZero => "команда завершилась без ошибок".into(),
            Expectation::StdoutMarker(marker) => format!("в выводе есть признак «{marker}»"),
            Expectation::PathExists(path) => format!("путь существует: {path}"),
            Expectation::PathAbsent(path) => format!("путь удалён: {path}"),
        }
    }
}

/// Проверяет ожидание и собирает `StepResult` с доказательством.
pub fn check(registry: &str, expectation: &Expectation, output: &ExecOutput) -> StepResult {
    let (ok, evidence) = match expectation {
        Expectation::ExitZero => {
            let code = output.exit_code.unwrap_or(-1);
            let finished_clean = code == 0 && !output.timed_out && !output.cancelled;
            (
                finished_clean,
                Evidence::ExitCode {
                    code: if output.timed_out { -2 } else { code },
                },
            )
        }
        Expectation::StdoutMarker(marker) => {
            let found = output.stdout.contains(marker);
            let code = output.exit_code.unwrap_or(-1);
            (
                found && code == 0 && !output.timed_out && !output.cancelled,
                Evidence::StdoutMarker {
                    marker: (*marker).to_string(),
                    found,
                },
            )
        }
        Expectation::PathExists(path) => {
            let exists = Path::new(path).exists();
            (
                exists,
                Evidence::PathExists {
                    path: path.clone(),
                    exists,
                },
            )
        }
        Expectation::PathAbsent(path) => {
            let exists = Path::new(path).exists();
            (
                !exists,
                Evidence::PathExists {
                    path: path.clone(),
                    exists,
                },
            )
        }
    };

    StepResult {
        registry: registry.to_string(),
        ok,
        evidence,
        reason: describe_failure(expectation, output, ok),
        stdout_tail: tail(&output.stdout, OUTPUT_TAIL),
        stderr_tail: tail(&output.stderr, OUTPUT_TAIL),
        exit_code: output.exit_code,
        timed_out: output.timed_out,
        cancelled: output.cancelled,
        duration_ms: output.duration_ms,
    }
}

fn describe_failure(expectation: &Expectation, output: &ExecOutput, ok: bool) -> String {
    if ok {
        return "готово".to_string();
    }
    if output.cancelled {
        return "отменено пользователем".to_string();
    }
    if output.timed_out {
        return format!("истекло время ожидания; ожидалось: {}", expectation.describe());
    }
    let stderr = output.stderr.trim();
    if !stderr.is_empty() {
        return format!("не подтверждено ({}): {}", expectation.describe(), tail(stderr, 400));
    }
    format!(
        "не подтверждено: {}; код возврата {:?}",
        expectation.describe(),
        output.exit_code
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn output(code: Option<i32>, stdout: &str, stderr: &str) -> ExecOutput {
        ExecOutput {
            exit_code: code,
            stdout: stdout.to_string(),
            stderr: stderr.to_string(),
            timed_out: false,
            cancelled: false,
            duration_ms: 7,
        }
    }

    #[test]
    fn exit_zero_passes() {
        let result = check("k", &Expectation::ExitZero, &output(Some(0), "", ""));
        assert!(result.ok);
        assert_eq!(result.evidence.kind(), "exit_code");
    }

    #[test]
    fn non_zero_fails_even_with_output() {
        let result = check("k", &Expectation::ExitZero, &output(Some(1), "ok", ""));
        assert!(!result.ok);
        assert!(result.reason.contains("не подтверждено"));
    }

    #[test]
    fn timeout_and_cancel_never_pass() {
        let mut timed_out = output(Some(0), "ok", "");
        timed_out.timed_out = true;
        assert!(!check("k", &Expectation::ExitZero, &timed_out).ok);

        let mut cancelled = output(Some(0), "ok", "");
        cancelled.cancelled = true;
        let result = check("k", &Expectation::ExitZero, &cancelled);
        assert!(!result.ok);
        assert_eq!(result.reason, "отменено пользователем");
    }

    #[test]
    fn marker_must_be_present() {
        let marker = Expectation::StdoutMarker("ZSHELPER-OK");
        assert!(check("k", &marker, &output(Some(0), "ZSHELPER-OK files=3", "")).ok);
        assert!(!check("k", &marker, &output(Some(0), "files=3", "")).ok);
    }

    #[test]
    fn path_expectations_read_the_filesystem() {
        let dir = std::env::temp_dir().join(format!("zshelper-verify-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.to_string_lossy().to_string();

        let exists = check("k", &Expectation::PathExists(path.clone()), &output(Some(0), "", ""));
        assert!(exists.ok);
        assert_eq!(exists.evidence.kind(), "path_exists");

        let absent = check("k", &Expectation::PathAbsent(path.clone()), &output(Some(0), "", ""));
        assert!(!absent.ok, "папка ещё существует — успех невозможен");

        std::fs::remove_dir_all(&dir).unwrap();
        let gone = check("k", &Expectation::PathAbsent(path), &output(Some(0), "", ""));
        assert!(gone.ok);
    }

    #[test]
    fn stderr_becomes_the_reason() {
        let result = check("k", &Expectation::ExitZero, &output(Some(2), "", "нет доступа"));
        assert!(result.reason.contains("нет доступа"));
    }

    #[test]
    fn long_output_is_truncated_but_keeps_the_end() {
        let long = "x".repeat(10_000) + "ХВОСТ";
        let result = check("k", &Expectation::ExitZero, &output(Some(0), &long, ""));
        assert!(result.stdout_tail.ends_with("ХВОСТ"));
        assert!(result.stdout_tail.chars().count() <= OUTPUT_TAIL);
    }
}
