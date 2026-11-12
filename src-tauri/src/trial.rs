//! Проба черновика в клетке: запустить и **честно рассказать**, что получилось.
//!
//! Между «модель написала текст» и «человек решил, что это годится» нужен один шаг, где
//! текст что-то делает — и делает в клетке: без сети, без чужих файлов, с потолками и
//! коротким сроком.
//!
//! Главное правило этого модуля: **проба никогда не превращается в умение**. Отчёт — это
//! отчёт. Руку по-прежнему делает только правка кода человеком.
//!
//! Второе правило: **если клетка не открылась, проба не притворяется защищённой**. Тогда
//! отчёт прямо говорит «клетка не открылась: <причина>» и остаётся отчётом без исполнения:
//! запускать чужой текст без забора — это то, от чего клетка и задумана.
//!
//! Третье: вывод обрезается. Полотно в интерфейсе не читают, а по обрезанному видно, что
//! человек не получил весь текст.

use std::path::Path;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::container;
use crate::executor::{self, ExecRequest};
use crate::isolation::Limits;
use crate::memory::Memory;

/// Сколько символов вывода показываем. Дольше — это лог, а не результат.
pub const MAX_OUTPUT: usize = 2000;

/// Сколько живёт проба. Черновик, который думает дольше, — не рука на один шаг.
pub const TIMEOUT: Duration = Duration::from_secs(20);

/// Отчёт о пробе. `ran` отдельно от `ok`: «не запускалось» и «упало» — разные вещи.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Report {
    /// Ключ реестра, для которого пробовали черновик.
    pub key: String,
    /// Запускалось ли вообще.
    pub ran: bool,
    /// Кончилось ли хорошо (код 0, без таймаута). Осмысленно только при `ran`.
    pub ok: bool,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    /// Где это было: клетка или её отсутствие с причиной.
    pub cell: String,
    pub duration_ms: u64,
    /// Что сказать человеку одной фразой.
    pub note: String,
    pub created_ms: u64,
}

/// Ключ факта для отчёта.
pub fn fact_key(key: &str) -> String {
    format!("trial:{key}")
}

/// Запомнить отчёт: следующий разговор начнётся с того, что уже проверено.
pub fn save(memory: &Memory, report: &Report) -> Result<(), String> {
    let json = serde_json::to_string(report).map_err(|error| format!("отчёт не пишется: {error}"))?;
    memory
        .remember(&fact_key(&report.key), &json)
        .map_err(|error| format!("отчёт не сохранился: {error}"))
}

/// Последний отчёт по ключу. Битый — «не пробовали».
pub fn get(memory: &Memory, key: &str) -> Option<Report> {
    memory
        .fact(&fact_key(key))
        .and_then(|json| serde_json::from_str(&json).ok())
}

/// Обрезать вывод с честной пометкой, что он не весь.
pub fn clip(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= MAX_OUTPUT {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(MAX_OUTPUT).collect();
    format!("{cut}…\n(вывод обрезан)")
}

/// Итог по коду возврата: `(ok, что сказать)`.
///
/// Ноль без таймаута — хорошо. Таймаут — не хорошо, даже если код нулевой: команду сняли
/// силой, и говорить «получилось» было бы враньём.
pub fn verdict(exit_code: Option<i32>, timed_out: bool) -> (bool, String) {
    if timed_out {
        return (
            false,
            format!("проба не уложилась в {} с и была снята", TIMEOUT.as_secs()),
        );
    }

    match exit_code {
        Some(0) => (true, "проба прошла: код 0".to_string()),
        Some(code) => (false, format!("проба упала: код {code}")),
        None => (false, "проба закончилась без кода возврата".to_string()),
    }
}

/// Что сказать про клетку, если она не открылась.
pub fn no_cell(reason: &str) -> String {
    format!(
        "клетка не открылась: {reason}; чужой текст без забора не запускается — \
         проба не выполнялась"
    )
}

/// Проба не выполнялась: клетки нет. Отчёт честный, а не пустой.
pub fn skipped(key: &str, reason: &str, now_ms: u64) -> Report {
    Report {
        key: key.to_string(),
        ran: false,
        ok: false,
        exit_code: None,
        stdout: String::new(),
        stderr: String::new(),
        timed_out: false,
        cell: no_cell(reason),
        duration_ms: 0,
        note: "проба не выполнялась: нужна клетка".to_string(),
        created_ms: now_ms,
    }
}

/// Собрать отчёт из того, что вернул запуск.
pub fn report(key: &str, output: &executor::ExecOutput, cell: &str, now_ms: u64) -> Report {
    let (ok, note) = verdict(output.exit_code, output.timed_out);
    Report {
        key: key.to_string(),
        ran: true,
        ok,
        exit_code: output.exit_code,
        stdout: clip(&output.stdout),
        stderr: clip(&output.stderr),
        timed_out: output.timed_out,
        cell: cell.to_string(),
        duration_ms: output.duration_ms,
        note,
        created_ms: now_ms,
    }
}

/// Запустить черновик в клетке `dir`. Ничего не делает, если клетка не открылась.
pub fn run(key: &str, code: &str, dir: &Path, now_ms: u64) -> Report {
    let sandbox = match container::open(dir) {
        Ok(sandbox) => sandbox,
        Err(reason) => return skipped(key, &reason, now_ms),
    };

    let request = ExecRequest::new("powershell.exe", executor::powershell(code))
        .with_timeout(TIMEOUT)
        .with_limits(Limits::trial());

    let cancel = AtomicBool::new(false);
    match sandbox.run(&request, Some(Limits::trial()), &cancel) {
        Ok(output) => {
            // Где это было: подпись клетки берём у самого модуля клетки, а не сочиняем.
            let cell = container::note();
            report(key, &output, &cell, now_ms)
        }
        Err(reason) => skipped(key, &reason, now_ms),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn memory(name: &str) -> (Memory, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "zshelper-trial-{name}-{}-{}",
            std::process::id(),
            now()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("memory.db");
        (Memory::open(path).expect("память открывается"), dir)
    }

    fn now() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or(0)
    }

    fn output(code: Option<i32>, timed_out: bool) -> executor::ExecOutput {
        executor::ExecOutput {
            exit_code: code,
            stdout: "строка\n".to_string(),
            stderr: String::new(),
            timed_out,
            cancelled: false,
            duration_ms: 12,
            limits_note: "потолки".to_string(),
        }
    }

    #[test]
    fn zero_is_good_and_anything_else_says_what_happened() {
        assert!(verdict(Some(0), false).0);
        assert_eq!(verdict(Some(0), false).1, "проба прошла: код 0");

        let (ok, note) = verdict(Some(1), false);
        assert!(!ok);
        assert!(note.contains("код 1"), "{note}");

        // Таймаут не «получилось», даже если код нулевой: команду сняли силой.
        let (ok, note) = verdict(Some(0), true);
        assert!(!ok);
        assert!(note.contains("снята"), "{note}");

        assert!(!verdict(None, false).0, "без кода возврата — не успех");
    }

    #[test]
    fn a_long_output_is_cut_and_says_so() {
        let small = clip("  готово \n");
        assert_eq!(small, "готово");

        let long = "я".repeat(MAX_OUTPUT + 50);
        let clipped = clip(&long);
        assert!(clipped.ends_with("(вывод обрезан)"), "{clipped}");
        assert!(clipped.chars().count() < long.chars().count() + 30);
    }

    #[test]
    fn a_report_without_a_cell_is_honest_about_it() {
        let report = skipped("k", "AppContainer есть только на Windows", 1000);

        assert!(!report.ran, "запуска не было");
        assert!(!report.ok);
        assert!(report.cell.contains("клетка не открылась"), "{}", report.cell);
        assert!(report.cell.contains("без забора не запускается"), "{}", report.cell);
        assert_eq!(report.note, "проба не выполнялась: нужна клетка");
    }

    #[test]
    fn a_report_with_a_cell_keeps_the_code_the_output_and_the_note() {
        let report = report("k", &output(Some(0), false), "клетка: AppContainer, без сети", 1000);

        assert!(report.ran && report.ok);
        assert_eq!(report.exit_code, Some(0));
        assert_eq!(report.stdout, "строка");
        assert_eq!(report.cell, "клетка: AppContainer, без сети");
        assert_eq!(report.duration_ms, 12);
    }

    #[test]
    fn reports_are_remembered_and_broken_ones_are_not_guessed() {
        let (memory, dir) = memory("store");
        let report = report("k", &output(Some(2), false), "клетка", 1000);

        save(&memory, &report).expect("сохранён");
        assert_eq!(get(&memory, "k"), Some(report));

        memory.remember(&fact_key("k"), "{ это не json").expect("испорченный факт");
        assert_eq!(get(&memory, "k"), None, "битый отчёт — это «не пробовали»");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
