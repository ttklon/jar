//! Запуск внешних процессов — основной канал исполнения (~60 % реестра).
//!
//! Требования, из которых нельзя выбросить ни одного пункта:
//! * **никакого shell**: только `program` + `argv`. Пользовательские значения
//!   передаются через переменные окружения, а не склейкой строки — иначе кавычка
//!   в имени папки превращается в чужую команду;
//! * **таймаут и отмена**: зависший `Get-ChildItem` на сетевом диске не должен
//!   вешать приложение навсегда;
//! * **смерть дерева процессов**: на Windows дочерние процессы остаются жить
//!   после убийства родителя, поэтому используется `taskkill /T`;
//! * **обе кодировки**: PowerShell на разных машинах отдаёт UTF-8 или OEM (cp866).
//!   Мы просим UTF-8 у самого PowerShell, а на выходе разбираем аккуратно.

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const POLL: Duration = Duration::from_millis(30);

#[derive(Debug, Clone)]
pub struct ExecRequest {
    pub program: String,
    pub argv: Vec<String>,
    pub env: Vec<(String, String)>,
    pub timeout: Duration,
    /// Потолки памяти, процессорного времени и числа процессов. `None` — запуск без них:
    /// так идут обычные руки, которым нечего бояться (и которым нельзя ставить потолок:
    /// открытая программа обязана пережить приложение).
    pub limits: Option<crate::isolation::Limits>,
}

impl ExecRequest {
    pub fn new(program: impl Into<String>, argv: Vec<String>) -> Self {
        Self {
            program: program.into(),
            argv,
            env: Vec::new(),
            timeout: Duration::from_secs(60),
            limits: None,
        }
    }

    /// Запуск под потолками: для пробного прогона и вообще для всего, чему не доверяем.
    pub fn with_limits(mut self, limits: crate::isolation::Limits) -> Self {
        self.timeout = limits.timeout();
        self.limits = Some(limits);
        self
    }

    pub fn with_env(mut self, name: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.push((name.into(), value.into()));
        self
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }
}

#[derive(Debug, Clone, Default)]
pub struct ExecOutput {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub timed_out: bool,
    pub cancelled: bool,
    pub duration_ms: u64,
    /// Что стало с потолками: применены они или почему нет. Пусто, если их не просили.
    pub limits_note: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ExecError {
    #[error("программа не запустилась: {0}")]
    Spawn(String),
    #[error("вывод процесса не прочитан: {0}")]
    Io(String),
}

/// Запускает процесс и ждёт его с таймаутом. `cancel` выставляется из UI.
pub fn run(request: &ExecRequest, cancel: &AtomicBool) -> Result<ExecOutput, ExecError> {
    let started = Instant::now();

    let mut command = Command::new(&request.program);
    command
        .args(&request.argv)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    for (name, value) in &request.env {
        command.env(name, value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| ExecError::Spawn(format!("{}: {error}", request.program)))?;

    // Потолки ставятся сразу после появления процесса: окно между `spawn` и `attach`
    // измеряется микросекундами, но оно есть, и об этом честнее сказать в комментарии,
    // чем делать вид, что его нет.
    let mut limits_note = String::new();
    let guard = match &request.limits {
        Some(limits) => match crate::isolation::attach(child.id(), limits) {
            Ok(guard) => {
                limits_note = format!("под потолком: {}", limits.describe());
                Some(guard)
            }
            Err(reason) => {
                limits_note = format!("потолки не применены: {reason}");
                None
            }
        },
        None => None,
    };

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ExecError::Io("stdout недоступен".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| ExecError::Io("stderr недоступен".into()))?;

    // Читаем оба потока параллельно: иначе полный буфер одного из них
    // останавливает процесс, и он висит до таймаута.
    let out_reader = std::thread::spawn(move || read_all(stdout));
    let err_reader = std::thread::spawn(move || read_all(stderr));

    let mut timed_out = false;
    let mut cancelled = false;

    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if cancel.load(Ordering::Relaxed) {
                    cancelled = true;
                    kill_tree(child.id());
                    break;
                }
                if started.elapsed() > request.timeout {
                    timed_out = true;
                    kill_tree(child.id());
                    break;
                }
                std::thread::sleep(POLL);
            }
            Err(_) => break,
        }
    }

    let status = child.wait().ok();
    let stdout = out_reader.join().unwrap_or_default();
    let stderr = err_reader.join().unwrap_or_default();

    let duration_ms = started.elapsed().as_millis() as u64;
    // `guard` закрывается здесь же: всё, что осталось в job object, умирает вместе с ним.
    drop(guard);

    Ok(ExecOutput {
        exit_code: status.and_then(|status| status.code()),
        stdout: String::from_utf8_lossy(&stdout).to_string(),
        stderr: String::from_utf8_lossy(&stderr).to_string(),
        timed_out,
        cancelled,
        duration_ms,
        limits_note,
    })
}

fn read_all(mut stream: impl Read) -> Vec<u8> {
    let mut buffer = Vec::new();
    let _ = stream.read_to_end(&mut buffer);
    buffer
}

/// Убивает процесс вместе с потомками. На Windows `Child::kill` не трогает дерево.
pub fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

/// Готовый запуск PowerShell со скриптом.
///
/// `-NoProfile` — чужие профили не должны менять поведение; `-NonInteractive` —
/// никаких запросов ввода, которые никто не увидит; `OutputEncoding в UTF-8` —
/// чтобы русские пути не превращались в мусор.
pub fn powershell(script: &str) -> Vec<String> {
    vec![
        "-NoProfile".to_string(),
        "-NonInteractive".to_string(),
        "-ExecutionPolicy".to_string(),
        "Bypass".to_string(),
        "-Command".to_string(),
        format!(
            "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';\
             [Console]::OutputEncoding=[System.Text.Encoding]::UTF8;{script}"
        ),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cancel_flag() -> AtomicBool {
        AtomicBool::new(false)
    }

    #[cfg(unix)]
    #[test]
    fn captures_stdout_and_exit_code() {
        let request = ExecRequest::new("/bin/sh", vec!["-c".into(), "echo привет".into()]);
        let output = run(&request, &cancel_flag()).expect("запуск");
        assert_eq!(output.exit_code, Some(0));
        assert!(output.stdout.contains("привет"));
        assert!(!output.timed_out);
    }

    #[cfg(unix)]
    #[test]
    fn reports_non_zero_exit() {
        let request = ExecRequest::new("/bin/sh", vec!["-c".into(), "exit 3".into()]);
        let output = run(&request, &cancel_flag()).expect("запуск");
        assert_eq!(output.exit_code, Some(3));
    }

    #[cfg(unix)]
    #[test]
    fn timeout_kills_the_process() {
        let request = ExecRequest::new("/bin/sh", vec!["-c".into(), "sleep 5".into()])
            .with_timeout(Duration::from_millis(150));
        let started = Instant::now();
        let output = run(&request, &cancel_flag()).expect("запуск");
        assert!(output.timed_out, "должен быть таймаут");
        assert!(
            started.elapsed() < Duration::from_secs(3),
            "не ждём все 5 секунд"
        );
    }

    #[cfg(unix)]
    #[test]
    fn cancel_stops_the_process() {
        let request = ExecRequest::new("/bin/sh", vec!["-c".into(), "sleep 5".into()]);
        let cancel = AtomicBool::new(false);
        let flag = &cancel;
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(120));
            flag.store(true, Ordering::Relaxed);
        });
        let output = run(&request, &cancel).expect("запуск");
        assert!(output.cancelled, "должна быть отмена");
    }

    #[test]
    fn missing_program_is_an_error_not_a_panic() {
        let request = ExecRequest::new("zshelper-такой-программы-нет", Vec::new());
        let error = run(&request, &cancel_flag()).expect_err("должна быть ошибка");
        assert!(matches!(error, ExecError::Spawn(_)));
    }

    #[test]
    fn powershell_script_is_wrapped_without_shell_interpolation() {
        let argv = powershell("Write-Output 1");
        assert_eq!(argv[0], "-NoProfile");
        assert!(argv.iter().any(|arg| arg == "-NonInteractive"));
        let script = argv.last().expect("скрипт");
        assert!(script.contains("OutputEncoding"));
        assert!(script.contains("Write-Output 1"));
    }
}
