//! Потолки для запуска: память, процессорное время, число процессов.
//!
//! Проверка текста (`sandbox`) отвечает на вопрос «что эта команда собирается делать».
//! Она не отвечает на другой: «а что будет, если она ошибётся». Ошибиться команда может
//! по-разному — утечь памятью, зациклиться, расплодить процессы, — и вот на этот случай
//! есть потолок.
//!
//! На Windows потолок — это job object: процесс (и всё, что он породит) попадает внутрь,
//! и дальше действуют три правила:
//! * больше `memory_bytes` памяти он не получит;
//! * дольше `process_ms` процессорного времени не проживёт;
//! * больше `processes` процессов в дереве не будет;
//! * а когда приложение закрывает объект, всё дерево умирает — забыть о запущенном
//!   процессе и оставить его жить на машине человека нельзя.
//!
//! Чего здесь **нет** и что нельзя выдавать за сделанное: потолок не изолирует файлы и
//! сеть. Процесс внутри job object по-прежнему видит диск и интернет с правами человека.
//! Это следующий шаг, и он называется по-другому: ограниченный токен.

use serde::Serialize;
use std::time::Duration;

/// Что именно ограничиваем.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Limits {
    /// Потолок памяти на процесс.
    pub memory_bytes: usize,
    /// Потолок процессорного времени на процесс.
    pub process_ms: u64,
    /// Сколько процессов может быть в дереве одновременно.
    pub processes: u32,
    /// Сколько ждать вывода, прежде чем остановить.
    pub timeout_ms: u64,
}

impl Limits {
    /// Потолки для пробного запуска: заведомо достаточные для короткой команды и заведомо
    /// недостаточные для того, чтобы незаметно занять машину.
    pub fn trial() -> Self {
        Self {
            memory_bytes: 256 * 1024 * 1024,
            process_ms: 5_000,
            processes: 8,
            timeout_ms: 10_000,
        }
    }

    /// Человеческая формулировка — для журнала и для «Под капотом».
    pub fn describe(&self) -> String {
        format!(
            "не больше {} МБ памяти, {} процессорного времени, {} процессов",
            self.memory_bytes / (1024 * 1024),
            duration_text(self.process_ms),
            self.processes
        )
    }

    /// Почему такие потолки бессмысленны. Потолок, который не даёт запуститься, — это не
    /// безопасность, а поломка, и сказать об этом надо до запуска.
    pub fn problem(&self) -> Option<String> {
        if self.memory_bytes < 32 * 1024 * 1024 {
            return Some(format!(
                "{} МБ памяти не хватит даже на запуск PowerShell",
                self.memory_bytes / (1024 * 1024)
            ));
        }

        if self.process_ms == 0 {
            return Some(
                "нулевое процессорное время — это не потолок, а запрет запуска".to_string(),
            );
        }

        if self.processes == 0 {
            return Some("ноль процессов — это не потолок, а запрет запуска".to_string());
        }

        None
    }

    /// Пауза ожидания вывода.
    pub fn timeout(&self) -> Duration {
        Duration::from_millis(self.timeout_ms)
    }
}

/// «5000» человеку читать незачем.
fn duration_text(ms: u64) -> String {
    if ms.is_multiple_of(1000) {
        format!("{} с", ms / 1000)
    } else {
        format!("{:.1} с", ms as f64 / 1000.0)
    }
}

/// Умеет ли эта система держать потолки.
pub fn available() -> bool {
    cfg!(windows)
}

/// Что сказать человеку про потолки на этой системе — без обещаний, которых нет.
pub fn note() -> String {
    if available() {
        "каждый пробный запуск идёт внутри job object: потолок памяти, процессорного времени \
         и числа процессов; закрытие приложения убивает всё дерево"
            .to_string()
    } else {
        "потолки живут в job object, а он есть только на Windows: здесь запуск идёт без них"
            .to_string()
    }
}

#[cfg(windows)]
mod imp {
    use super::Limits;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_ACTIVE_PROCESS, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOB_OBJECT_LIMIT_PROCESS_MEMORY, JOB_OBJECT_LIMIT_PROCESS_TIME,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
    };

    /// Держит job object открытым. Пока он открыт — потолки действуют; при закрытии всё,
    /// что внутри, умирает. Поэтому `Guard` не клонируется и живёт ровно столько, сколько
    /// длится запуск.
    #[derive(Debug)]
    pub struct Guard {
        job: HANDLE,
    }

    // Ручка job object не привязана к потоку — её можно передавать.
    unsafe impl Send for Guard {}

    impl Drop for Guard {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.job);
            }
        }
    }

    /// Заводит job object с потолками и помещает в него процесс.
    pub fn attach(pid: u32, limits: &Limits) -> Result<Guard, String> {
        if let Some(problem) = limits.problem() {
            return Err(problem);
        }

        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(format!("job object не создан: {}", last_error()));
            }

            let guard = Guard { job };

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_PROCESS_MEMORY
                | JOB_OBJECT_LIMIT_PROCESS_TIME
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            // LARGE_INTEGER в единицах по 100 нс.
            info.BasicLimitInformation.PerProcessUserTimeLimit =
                (limits.process_ms as i64) * 10_000;
            info.BasicLimitInformation.ActiveProcessLimit = limits.processes;
            info.ProcessMemoryLimit = limits.memory_bytes;

            let sized = std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
            let ok = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                sized,
            );
            if ok == 0 {
                return Err(format!("потолки не установлены: {}", last_error()));
            }

            let process = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
            if process.is_null() {
                return Err(format!("процесс не открыт: {}", last_error()));
            }

            let assigned = AssignProcessToJobObject(job, process);
            let error = last_error();
            CloseHandle(process);

            if assigned == 0 {
                return Err(format!("процесс не помещён под потолок: {error}"));
            }

            Ok(guard)
        }
    }

    fn last_error() -> i32 {
        std::io::Error::last_os_error().raw_os_error().unwrap_or(0)
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Limits;

    /// На других системах потолков нет. Пустышка, а не притворство: `attach` честно
    /// возвращает отказ, и вызывающий обязан сказать об этом, а не делать вид.
    #[derive(Debug)]
    pub struct Guard;

    pub fn attach(_pid: u32, limits: &Limits) -> Result<Guard, String> {
        if let Some(problem) = limits.problem() {
            return Err(problem);
        }

        Err("job object есть только на Windows".to_string())
    }
}

pub use imp::{attach, Guard};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_trial_ceiling_is_readable_by_a_person() {
        let limits = Limits::trial();
        assert_eq!(
            limits.describe(),
            "не больше 256 МБ памяти, 5 с процессорного времени, 8 процессов"
        );
    }

    #[test]
    fn a_ceiling_that_forbids_starting_is_named_as_a_mistake() {
        let mut limits = Limits::trial();
        limits.memory_bytes = 8 * 1024 * 1024;
        assert!(limits.problem().unwrap().contains("не хватит"));

        let mut limits = Limits::trial();
        limits.processes = 0;
        assert!(limits.problem().unwrap().contains("запрет запуска"));

        let mut limits = Limits::trial();
        limits.process_ms = 0;
        assert!(limits.problem().unwrap().contains("запрет запуска"));

        assert_eq!(Limits::trial().problem(), None);
    }

    #[test]
    fn nonsense_never_reaches_the_operating_system() {
        let mut limits = Limits::trial();
        limits.processes = 0;
        let error = attach(std::process::id(), &limits).expect_err("потолок нелеп");
        assert!(error.contains("запрет запуска"), "{error}");
    }

    #[cfg(windows)]
    #[test]
    fn a_runaway_loop_is_stopped_by_the_ceiling_not_by_the_timeout() {
        use std::sync::atomic::AtomicBool;
        use std::time::Instant;

        let request = crate::executor::ExecRequest::new(
            "powershell.exe",
            vec![
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-Command".to_string(),
                "while ($true) { }".to_string(),
            ],
        )
        .with_limits(Limits {
            process_ms: 500,
            timeout_ms: 30_000,
            ..Limits::trial()
        });

        let started = Instant::now();
        let cancel = AtomicBool::new(false);
        let output = crate::executor::run(&request, &cancel).expect("запуск");

        assert!(
            output.limits_note.contains("под потолком"),
            "{}",
            output.limits_note
        );
        assert!(
            !output.timed_out,
            "остановить должен потолок процессорного времени, а не наш таймаут"
        );
        assert_ne!(output.exit_code, Some(0), "убитый процесс не может быть успешным");
        assert!(
            started.elapsed().as_secs() < 20,
            "потолок не сработал: {:?}",
            started.elapsed()
        );
    }

    #[cfg(windows)]
    #[test]
    fn a_greedy_process_hits_the_memory_ceiling() {
        use std::sync::atomic::AtomicBool;

        let script = "$x = New-Object System.Collections.ArrayList; \
                      while ($true) { [void]$x.Add((New-Object byte[] 10485760)) }";
        let request = crate::executor::ExecRequest::new(
            "powershell.exe",
            vec![
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-Command".to_string(),
                script.to_string(),
            ],
        )
        .with_limits(Limits {
            memory_bytes: 160 * 1024 * 1024,
            timeout_ms: 40_000,
            ..Limits::trial()
        });

        let cancel = AtomicBool::new(false);
        let output = crate::executor::run(&request, &cancel).expect("запуск");

        assert!(
            output.limits_note.contains("под потолком"),
            "{}",
            output.limits_note
        );
        assert_ne!(output.exit_code, Some(0), "память кончилась — это не успех");
        assert!(!output.timed_out, "остановить должен потолок памяти");
    }

    #[test]
    fn the_note_says_what_is_true_on_this_system() {
        let note = note();
        if available() {
            assert!(note.contains("job object"));
        } else {
            assert!(note.contains("без них"), "{note}");
        }
    }
}
