//! Что сейчас перед человеком: активное окно и программа, которой оно принадлежит.
//!
//! Зачем это нужно до всякой модели: человек говорит «сделай это» и «включи субтитры в этом
//! видео», стоя перед чужим окном. Без ответа на вопрос «где он сейчас» такие фразы
//! бессмысленны, а приложение делает вид, что понимает.
//!
//! Здесь только чтение. Ни клика, ни ввода, ни переключения окон — это следующий шаг
//! (UI Automation), и он требует отдельного разговора о подтверждениях.
//!
//! Чего модуль не делает: не ищет окно по тексту, не угадывает «главное» окно программы и
//! не пытается быть умнее системы. Заголовок может быть пустым, процесс — системным,
//! а передний план — рабочим столом. Всё это честные ответы, и они возвращаются как есть.

use serde::Serialize;

/// Окно, которое сейчас впереди.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Foreground {
    /// Заголовок окна. Бывает пустым — и это нормально.
    pub title: String,
    /// Имя программы без пути: `chrome.exe`.
    pub process: String,
    /// Идентификатор процесса — по нему видно, одно и то же окно или нет.
    pub pid: u32,
}

/// Заголовок без хвостов: Windows любит добавлять нули и пробелы.
pub fn clean_title(raw: &str) -> String {
    raw.trim_matches(|symbol: char| symbol == '\0' || symbol.is_whitespace())
        .to_string()
}

/// Имя программы из полного пути: `C:\...\chrome.exe` → `chrome.exe`.
pub fn process_name(path: &str) -> String {
    let cut = path.rsplit(['\\', '/']).next().unwrap_or(path);
    cut.trim().to_string()
}

/// Умеет ли система сказать, что впереди.
pub fn available() -> bool {
    cfg!(windows)
}

/// Что сказать человеку, если спросить нечего.
pub fn note() -> String {
    if available() {
        "активное окно читается: заголовок и программа — только чтение, без кликов".to_string()
    } else {
        "активное окно — это Windows: здесь его не видно".to_string()
    }
}

#[cfg(windows)]
mod imp {
    use super::{clean_title, process_name, Foreground};
    use windows_sys::Win32::Foundation::{CloseHandle, MAX_PATH};
    use windows_sys::Win32::System::Threading::{
        GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    /// Что сейчас впереди. `Err` — когда спросить действительно нечего (нет окна вовсе).
    pub fn foreground() -> Result<Foreground, String> {
        unsafe {
            let window = GetForegroundWindow();
            if window.is_null() {
                return Err(
                    "переднего окна нет: рабочий стол или заблокированный экран".to_string()
                );
            }

            let mut buffer = [0u16; 512];
            let length = GetWindowTextW(window, buffer.as_mut_ptr(), buffer.len() as i32);
            let title = if length > 0 {
                clean_title(&String::from_utf16_lossy(&buffer[..length as usize]))
            } else {
                String::new()
            };

            let mut pid = 0u32;
            GetWindowThreadProcessId(window, &mut pid);
            if pid == 0 {
                return Err("у окна нет процесса".to_string());
            }

            // Свой собственный процесс в ответе бесполезен: человек спрашивает про то,
            // что перед ним, а не про помощника.
            if pid == GetCurrentProcessId() {
                return Ok(Foreground {
                    title,
                    process: "zshelper.exe".to_string(),
                    pid,
                });
            }

            let process = match exe_path(pid) {
                Some(path) => process_name(&path),
                // Права на чтение пути есть не всегда — это не ошибка: заголовок и PID
                // всё равно отвечают на вопрос «где он».
                None => String::from("неизвестная программа"),
            };

            Ok(Foreground {
                title,
                process,
                pid,
            })
        }
    }

    unsafe fn exe_path(pid: u32) -> Option<String> {
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() {
            return None;
        }

        let mut buffer = [0u16; MAX_PATH as usize];
        let mut size = buffer.len() as u32;
        let ok =
            QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, buffer.as_mut_ptr(), &mut size);
        CloseHandle(process);

        if ok == 0 {
            return None;
        }

        Some(String::from_utf16_lossy(&buffer[..size as usize]))
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Foreground;

    pub fn foreground() -> Result<Foreground, String> {
        Err("активное окно есть только на Windows".to_string())
    }
}

pub use imp::foreground;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_title_loses_its_invisible_tails() {
        assert_eq!(
            clean_title("\0 Документ — Блокнот \r\n\0"),
            "Документ — Блокнот"
        );
        assert_eq!(clean_title(""), "");
        assert_eq!(clean_title("\0\0"), "");
    }

    #[test]
    fn a_program_name_is_the_last_part_of_the_path() {
        assert_eq!(
            process_name("C:\\Program Files\\Google\\Chrome\\chrome.exe"),
            "chrome.exe"
        );
        assert_eq!(process_name("chrome.exe"), "chrome.exe");
        assert_eq!(process_name(""), "");
    }

    #[test]
    fn the_note_says_what_is_true_on_this_system() {
        let note = note();
        if available() {
            assert!(note.contains("только чтение"), "{note}");
        } else {
            assert!(note.contains("не видно"), "{note}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn the_foreground_is_either_named_or_explicitly_absent() {
        // В сессии без рабочего стола окна может не быть — это не поломка, а честный
        // ответ. Проверяем не «есть окно», а то, что ответ не бывает пустым наугад.
        match foreground() {
            Ok(window) => {
                assert!(window.pid > 0, "{window:?}");
                assert!(!window.process.is_empty(), "{window:?}");
            }
            Err(reason) => assert!(
                reason.contains("окно") || reason.contains("процесса"),
                "причина должна быть внятной: {reason}"
            ),
        }
    }
}
