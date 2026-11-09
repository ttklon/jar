//! Запуск без прав: процесс, у которого отобрали привилегии и права администратора.
//!
//! Потолки (`isolation`) отвечают на «сколько он может съесть». Здесь другой вопрос:
//! «что ему вообще позволено». Ответ строится на ограниченном токене: у процесса не
//! остаётся ни одной привилегии, а группа администраторов помечена как «только для
//! отказа» — даже если приложение запущено от администратора, внутри команда им не станет.
//!
//! Как это делается по документации Windows, а не по интуиции:
//! * `OpenProcessToken` — свой токен;
//! * `CreateRestrictedToken(DISABLE_MAX_PRIVILEGE, SidsToDisable = админы)` — из него
//!   ограниченный;
//! * `CreateProcessAsUserW` — запуск с этим токеном. Привилегии `SeAssignPrimaryToken`
//!   здесь не нужны: токен — ограниченная версия собственного токена вызывающего, и
//!   Windows это прямо разрешает. Поэтому работает и без прав администратора;
//! * `CREATE_SUSPENDED` — процесс создаётся остановленным, и потолки (`isolation`)
//!   ставятся **до** первого шага команды. Окна, о котором предупреждал `executor`, тут
//!   просто нет.
//!
//! Чего это **не** делает: не запирает файлы и не отключает сеть. Ограниченный токен — это
//! про права, а не про песочницу файловой системы: пользователь по-прежнему может писать
//! в свои папки, и это осознанно (иначе половина честных рук перестанет работать).
//! Запирание файлов — отдельная работа через ACL и AppContainer.
//!
//! Вывод забирается через файлы, а не через каналы: у `CreateProcessAsUserW` наследование
//! дескрипторов работает, но каналы пришлось бы читать параллельно из потоков, а пробный
//! запуск короткий и потоковая передача ему не нужна. Файл — это скучно и надёжно.

/// Умеет ли система запускать без прав.
pub fn available() -> bool {
    cfg!(windows)
}

/// Что сказать человеку — без обещаний, которых нет.
pub fn note() -> String {
    if available() {
        "недоверенная команда запускается с ограниченным токеном: без привилегий и без прав \
         администратора; файлы и сеть при этом остаются доступны"
            .to_string()
    } else {
        "ограниченный токен — это механизм Windows: здесь команда пойдёт без него".to_string()
    }
}

/// Собирает командную строку по правилам Windows: аргумент с пробелом или кавычкой
/// заключается в кавычки, а обратные слэши перед кавычкой удваиваются. Ошибка здесь — это
/// не косметика: неверно собранная строка превращает путь в чужую команду.
pub fn command_line(program: &str, args: &[String]) -> String {
    let mut parts = vec![quote(program)];
    parts.extend(args.iter().map(|arg| quote(arg)));
    parts.join(" ")
}

fn quote(arg: &str) -> String {
    let needs = arg.is_empty() || arg.contains([' ', '\t', '"']);
    if !needs {
        return arg.to_string();
    }

    let mut out = String::from("\"");
    let mut backslashes = 0;

    for ch in arg.chars() {
        if ch == '\\' {
            backslashes += 1;
            continue;
        }

        if ch == '"' {
            out.push_str(&"\\".repeat(backslashes * 2 + 1));
            out.push('"');
        } else {
            out.push_str(&"\\".repeat(backslashes));
            out.push(ch);
        }

        backslashes = 0;
    }

    out.push_str(&"\\".repeat(backslashes * 2));
    out.push('"');
    out
}

#[cfg(windows)]
mod imp {
    use super::command_line;
    use crate::executor::{ExecOutput, ExecRequest};
    use crate::isolation::Limits;
    use std::fs::File;
    use std::os::windows::io::AsRawHandle;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Instant;
    use windows_sys::Win32::Foundation::{
        CloseHandle, SetHandleInformation, HANDLE, HANDLE_FLAG_INHERIT, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::Security::{
        CreateRestrictedToken, CreateWellKnownSid, WinBuiltinAdministratorsSid,
        DISABLE_MAX_PRIVILEGE, SID_AND_ATTRIBUTES, TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE,
        TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessAsUserW, GetCurrentProcess, GetExitCodeProcess, OpenProcessToken,
        ResumeThread, TerminateProcess, WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED,
        PROCESS_INFORMATION, STARTF_USESTDHANDLES, STARTUPINFOW,
    };

    const POLL_MS: u32 = 30;

    /// Счётчик запусков: тесты в одном процессе идут параллельно, и общая папка вывода
    /// означала бы, что один запуск затирает отчёт другого.
    static RUNS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    /// Запускает команду с ограниченным токеном. Потолки ставятся до первого шага.
    pub fn run(
        request: &ExecRequest,
        limits: Option<Limits>,
        cancel: &AtomicBool,
    ) -> Result<ExecOutput, String> {
        let started = Instant::now();
        let number = RUNS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("zshelper-bez-prav-{}-{number}", std::process::id()));
        std::fs::create_dir_all(&dir).map_err(|error| format!("папка вывода: {error}"))?;

        let out_file = dir.join("stdout.txt");
        let err_file = dir.join("stderr.txt");

        // Файлы держим живыми до запуска: дескриптор, закрытый раньше времени, — это
        // команда без вывода.
        let (stdout_handle, stdout_file) = open_inheritable(&out_file)?;
        let (stderr_handle, stderr_file) = open_inheritable(&err_file)?;
        let (stdin_handle, stdin_file) = open_inheritable(std::path::Path::new("NUL"))?;

        let mut limits_note = String::from("права сняты: ограниченный токен");
        let mut guard = None;

        let spawned = unsafe { spawn(request, stdout_handle, stderr_handle, stdin_handle) };

        let (process, thread, pid) = match spawned {
            Ok(triple) => triple,
            Err(reason) => {
                drop((stdout_file, stderr_file, stdin_file));
                let _ = std::fs::remove_dir_all(&dir);
                return Err(reason);
            }
        };

        if let Some(limits) = limits {
            match crate::isolation::attach(pid, &limits) {
                Ok(handle) => {
                    limits_note = format!("{limits_note}; под потолком: {}", limits.describe());
                    guard = Some(handle);
                }
                Err(reason) => {
                    limits_note = format!("{limits_note}; потолки не применены: {reason}");
                }
            }
        }

        // Процесс создан остановленным — первая его инструкция выполнится только здесь.
        unsafe {
            if ResumeThread(thread) == u32::MAX {
                TerminateProcess(process, 1);
                CloseHandle(thread);
                CloseHandle(process);
                return Err("процесс не возобновлён".to_string());
            }
        }

        let mut timed_out = false;
        let mut cancelled = false;

        loop {
            let waited = unsafe { WaitForSingleObject(process, POLL_MS) };
            if waited == WAIT_OBJECT_0 {
                break;
            }

            if waited != WAIT_TIMEOUT {
                break;
            }

            if cancel.load(Ordering::Relaxed) {
                cancelled = true;
                unsafe { TerminateProcess(process, 1) };
                break;
            }

            if started.elapsed() > request.timeout {
                timed_out = true;
                unsafe { TerminateProcess(process, 1) };
                break;
            }
        }

        let mut code: u32 = 0;
        unsafe {
            GetExitCodeProcess(process, &mut code);
            CloseHandle(thread);
            // Потолки закрываются вместе с процессом: остатки дерева умирают здесь.
            drop(guard);
            CloseHandle(process);
        }

        // Дескрипторы закрываем до чтения: иначе на Windows файл ещё занят.
        drop((stdout_file, stderr_file, stdin_file));

        let stdout = std::fs::read(&out_file).unwrap_or_default();
        let stderr = std::fs::read(&err_file).unwrap_or_default();
        let _ = std::fs::remove_dir_all(&dir);

        if cancelled || timed_out {
            crate::executor::kill_tree(pid);
        }

        Ok(ExecOutput {
            exit_code: if cancelled || timed_out {
                None
            } else {
                Some(code as i32)
            },
            stdout: String::from_utf8_lossy(&stdout).to_string(),
            stderr: String::from_utf8_lossy(&stderr).to_string(),
            timed_out,
            cancelled,
            duration_ms: started.elapsed().as_millis() as u64,
            limits_note,
        })
    }

    fn open_inheritable(path: &std::path::Path) -> Result<(HANDLE, File), String> {
        let file = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)
            .map_err(|error| format!("файл вывода не открыт: {error}"))?;

        let handle = file.as_raw_handle() as HANDLE;
        let ok = unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) };
        if ok == 0 {
            return Err("дескриптор вывода не сделан наследуемым".to_string());
        }

        Ok((handle, file))
    }

    unsafe fn spawn(
        request: &ExecRequest,
        stdout_handle: HANDLE,
        stderr_handle: HANDLE,
        stdin_handle: HANDLE,
    ) -> Result<(HANDLE, HANDLE, u32), String> {
        let token = restricted_token()?;

        // Программу не подставляем отдельным аргументом: с `lpApplicationName` Windows не
        // ищет файл в PATH, и `powershell.exe` превращается в «файл не найден». Первый
        // элемент командной строки делает то же самое, но с поиском.
        let mut line_wide = wide(&command_line(&request.program, &request.argv));

        let mut si: STARTUPINFOW = std::mem::zeroed();
        si.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
        si.dwFlags = STARTF_USESTDHANDLES;
        si.hStdOutput = stdout_handle;
        si.hStdError = stderr_handle;
        si.hStdInput = stdin_handle;

        let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
        let created = CreateProcessAsUserW(
            token,
            std::ptr::null(),
            line_wide.as_mut_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            1,
            CREATE_NO_WINDOW | CREATE_SUSPENDED,
            std::ptr::null(),
            std::ptr::null(),
            &si,
            &mut pi,
        );

        CloseHandle(token);

        if created == 0 {
            return Err(format!(
                "команда не запущена с ограниченным токеном: {}",
                std::io::Error::last_os_error()
            ));
        }

        Ok((pi.hProcess, pi.hThread, pi.dwProcessId))
    }

    /// Ограниченный токен: без привилегий, администраторы — только для отказа.
    unsafe fn restricted_token() -> Result<HANDLE, String> {
        let mut own: HANDLE = std::ptr::null_mut();
        let opened = OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY,
            &mut own,
        );
        if opened == 0 {
            return Err(format!(
                "свой токен не открыт: {}",
                std::io::Error::last_os_error()
            ));
        }

        // SID администраторов: 68 байт хватает любому well-known SID.
        let mut sid_buffer = [0u8; 68];
        let mut size = sid_buffer.len() as u32;
        let made = CreateWellKnownSid(
            WinBuiltinAdministratorsSid,
            std::ptr::null_mut(),
            sid_buffer.as_mut_ptr() as *mut core::ffi::c_void,
            &mut size,
        );
        if made == 0 {
            CloseHandle(own);
            return Err(format!(
                "SID администраторов не получен: {}",
                std::io::Error::last_os_error()
            ));
        }

        let admins = SID_AND_ATTRIBUTES {
            Sid: sid_buffer.as_mut_ptr() as *mut core::ffi::c_void,
            Attributes: 0,
        };

        let mut restricted: HANDLE = std::ptr::null_mut();
        let created = CreateRestrictedToken(
            own,
            DISABLE_MAX_PRIVILEGE,
            1,
            &admins,
            0,
            std::ptr::null(),
            0,
            std::ptr::null(),
            &mut restricted,
        );

        CloseHandle(own);

        if created == 0 {
            return Err(format!(
                "ограниченный токен не создан: {}",
                std::io::Error::last_os_error()
            ));
        }

        Ok(restricted)
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(not(windows))]
mod imp {
    use crate::executor::{ExecOutput, ExecRequest};
    use crate::isolation::Limits;
    use std::sync::atomic::AtomicBool;

    pub fn run(
        _request: &ExecRequest,
        _limits: Option<Limits>,
        _cancel: &AtomicBool,
    ) -> Result<ExecOutput, String> {
        Err("ограниченный токен есть только на Windows".to_string())
    }
}

pub use imp::run;

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    use crate::executor::ExecRequest;
    #[cfg(windows)]
    use crate::isolation::Limits;
    #[cfg(windows)]
    use std::sync::atomic::AtomicBool;

    #[test]
    fn an_argument_with_a_space_is_quoted_as_one_argument() {
        let line = command_line(
            "powershell.exe",
            &["-Command".into(), "Write-Output 1".into()],
        );
        assert_eq!(line, "powershell.exe -Command \"Write-Output 1\"");
    }

    #[test]
    fn a_quote_cannot_start_a_second_command() {
        // Аргумент с кавычкой закрывается по правилам Windows, а не по «как получится».
        let line = command_line("cmd.exe", &["/c".into(), "echo \"hi\" & whoami".into()]);
        assert!(line.starts_with("cmd.exe /c \""));
        assert!(
            line.contains("\\\"hi\\\" & whoami"),
            "кавычки внутри аргумента должны быть экранированы: {line}"
        );
    }

    #[test]
    fn a_plain_argument_stays_plain() {
        assert_eq!(
            command_line("cmd.exe", &["/c".into(), "exit".into()]),
            "cmd.exe /c exit"
        );
    }

    #[test]
    fn the_note_says_what_is_true_on_this_system() {
        let note = note();
        if available() {
            assert!(note.contains("ограниченным токеном"), "{note}");
        } else {
            assert!(note.contains("без него"), "{note}");
        }
    }

    #[cfg(windows)]
    #[test]
    fn a_restricted_process_has_no_privileges_left() {
        // `DISABLE_MAX_PRIVILEGE` оставляет ровно одну привилегию — SeChangeNotifyPrivilege,
        // без которой не работает обход каталогов. Всё остальное обязано исчезнуть.
        //
        // Одна строка: в сырой строке обратный слэш и перевод строки — это символы, а не
        // продолжение строки, и PowerShell такое не разберёт.
        let script = r"@(whoami /priv | Select-String -Pattern 'Se\w+Privilege' -AllMatches | ForEach-Object { $_.Matches.Value } | Where-Object { $_ -ne 'SeChangeNotifyPrivilege' }).Count";

        let cancel = AtomicBool::new(false);
        let restricted = run(&request(script), None, &cancel)
            .unwrap_or_else(|error| panic!("ограниченный запуск провалился: {error}"));

        assert!(
            restricted.limits_note.contains("права сняты"),
            "{}",
            restricted.limits_note
        );
        assert_eq!(
            restricted.stdout.trim(),
            "0",
            "у ограниченного процесса не должно остаться привилегий: stdout={:?} stderr={:?}",
            restricted.stdout,
            restricted.stderr
        );

        // Вторая половина проверки — про права администратора. Она честно различает два
        // случая: на машине, где приложение запущено от администратора, обычный процесс
        // администратором является, а ограниченный — нет. На сборочной машине с урезанным
        // токеном различать нечего, и тест об этом говорит, а не притворяется.
        let admin = r"([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)";
        let plain_admin = crate::executor::run(&request(admin), &cancel).expect("обычный запуск");
        let restricted_admin = run(&request(admin), None, &cancel).expect("ограниченный запуск");

        assert_eq!(
            restricted_admin.stdout.trim(),
            "False",
            "ограниченный процесс не должен быть администратором: stdout={:?} stderr={:?}",
            restricted_admin.stdout,
            restricted_admin.stderr
        );

        eprintln!(
            "обычный процесс администратор: {} — если False, машина сама прав не даёт",
            plain_admin.stdout.trim()
        );
    }

    fn request(script: &str) -> ExecRequest {
        ExecRequest::new(
            "powershell.exe",
            vec![
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-Command".to_string(),
                script.to_string(),
            ],
        )
    }

    #[cfg(windows)]
    #[test]
    fn a_restricted_process_runs_under_the_ceiling_too() {
        let request = request("while ($true) { }");

        let limits = Limits {
            process_ms: 500,
            timeout_ms: 30_000,
            ..Limits::trial()
        };

        let started = std::time::Instant::now();
        let cancel = AtomicBool::new(false);
        let output = run(&request, Some(limits), &cancel)
            .unwrap_or_else(|error| panic!("ограниченный запуск провалился: {error}"));

        assert!(
            output.limits_note.contains("под потолком"),
            "{}",
            output.limits_note
        );
        assert!(!output.timed_out, "остановить должен потолок");
        assert_ne!(output.exit_code, Some(0));
        assert!(started.elapsed().as_secs() < 20, "потолок не сработал");
    }
}
