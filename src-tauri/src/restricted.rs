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
//! **Запирание файлов** делается вторым списком токена — *ограничивающими* SID (restricted
//! SIDs). Windows проверяет доступ дважды: обычным списком и ограничивающим, и доступ
//! выдаётся только если **оба** разрешили. В ограничивающий список кладётся `Everyone`, а
//! папка пробного запуска получает единственную запись в ACL — полный доступ для
//! `Everyone`. Итог: в этой папке можно всё, за её пределами — только то, что открыто
//! всему миру (системные файлы для чтения), а личные папки человека закрыты.
//!
//! Чего это **не** делает: не отключает сеть. Сеть закрывается другим механизмом
//! (AppContainer без возможности `internetClient`), и пока его нет, это написано и на
//! экране, и здесь: команда не может тронуть ваши файлы, но может выйти в интернет.
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
        "недоверенная команда идёт с ограниченным токеном: без привилегий, без прав \
         администратора и за забором — писать можно только в её собственную папку. Сеть \
         при этом остаётся доступной"
            .to_string()
    } else {
        "ограниченный токен — это механизм Windows: здесь команда пойдёт без него".to_string()
    }
}

/// Запирает папку: единственная запись в ACL — полный доступ для `Everyone`, всё
/// унаследованное снято. Так папка остаётся доступной ограниченному токену (в его
/// ограничивающем списке тоже `Everyone`) и недостижимой для всего, что вне её.
pub fn jail(dir: &std::path::Path) -> Result<(), String> {
    if !available() {
        return Err("запирание папки — механизм Windows".to_string());
    }

    std::fs::create_dir_all(dir)
        .map_err(|error| format!("папка пробного запуска не создаётся: {error}"))?;

    // `/inheritance:r` убирает унаследованные записи, `/grant:r` заменяет свои.
    // `*S-1-5-1` — это Everyone, записанный SID'ом: имя группы зависит от языка системы,
    // а SID — нет.
    let output = std::process::Command::new("icacls")
        .arg(dir)
        .args(["/inheritance:r", "/grant:r", "*S-1-5-1:(OI)(CI)F"])
        .output()
        .map_err(|error| format!("icacls не запустился: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "папка не заперта: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    Ok(())
}

/// Переменные окружения для процесса в папке: всё наследуется, но `TEMP` и `TMP`
/// указывают внутрь папки. Иначе первая же программа, которой нужен временный файл,
/// упрётся в забор и это будет выглядеть как поломка, а не как защита.
pub fn environment_block(
    dir: Option<&std::path::Path>,
    inherited: &[(String, String)],
) -> Vec<u16> {
    let mut vars: Vec<(String, String)> = inherited.to_vec();

    if let Some(dir) = dir {
        let path = dir.display().to_string();
        for name in ["TEMP", "TMP"] {
            match vars.iter_mut().find(|(key, _)| key.eq_ignore_ascii_case(name)) {
                Some(entry) => entry.1 = path.clone(),
                None => vars.push((name.to_string(), path.clone())),
            }
        }
    }

    // Windows ждёт «имя=значение» через ноль, отсортированное по имени без учёта регистра,
    // и два нуля в конце.
    vars.sort_by_key(|(name, _)| name.to_uppercase());

    let mut block: Vec<u16> = Vec::new();
    for (name, value) in vars {
        let line = format!("{name}={value}");
        block.extend(line.encode_utf16());
        block.push(0);
    }
    block.push(0);
    block
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
        CreateRestrictedToken, CreateWellKnownSid, WinBuiltinAdministratorsSid, WinWorldSid,
        DISABLE_MAX_PRIVILEGE, SID_AND_ATTRIBUTES, TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE,
        TOKEN_QUERY,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessAsUserW, GetCurrentProcess, GetExitCodeProcess, OpenProcessToken,
        ResumeThread, TerminateProcess, WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED,
        CREATE_UNICODE_ENVIRONMENT, PROCESS_INFORMATION, STARTF_USESTDHANDLES, STARTUPINFOW,
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
        jail: Option<&std::path::Path>,
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

        let spawned = unsafe { spawn(request, stdout_handle, stderr_handle, stdin_handle, jail) };

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
        jail: Option<&std::path::Path>,
    ) -> Result<(HANDLE, HANDLE, u32), String> {
        let token = restricted_token(jail.is_some())?;

        // Программу не подставляем отдельным аргументом: с `lpApplicationName` Windows не
        // ищет файл в PATH, и `powershell.exe` превращается в «файл не найден». Первый
        // элемент командной строки делает то же самое, но с поиском.
        let mut line_wide = wide(&command_line(&request.program, &request.argv));
        let mut environment = super::environment_block(jail, &std::env::vars().collect::<Vec<_>>());
        let directory = jail.map(|dir| wide(&dir.display().to_string()));

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
            CREATE_NO_WINDOW | CREATE_SUSPENDED | CREATE_UNICODE_ENVIRONMENT,
            environment.as_mut_ptr() as *const core::ffi::c_void,
            directory
                .as_ref()
                .map(|wide| wide.as_ptr())
                .unwrap_or(std::ptr::null()),
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

    /// Ограниченный токен: без привилегий, администраторы — только для отказа, и, если
    /// нужен забор для файлов, ограничивающий SID `Everyone`.
    unsafe fn restricted_token(jailed: bool) -> Result<HANDLE, String> {
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

        // Ограничивающий SID: доступ выдаётся, только если разрешил и он. `Everyone` есть
        // ровно в одном месте — в ACL папки пробного запуска.
        let mut everyone_buffer = [0u8; 68];
        let mut everyone_size = everyone_buffer.len() as u32;
        let mut restrict_count = 0u32;
        let mut everyone = SID_AND_ATTRIBUTES {
            Sid: std::ptr::null_mut(),
            Attributes: 0,
        };

        if jailed {
            let made = CreateWellKnownSid(
                WinWorldSid,
                std::ptr::null_mut(),
                everyone_buffer.as_mut_ptr() as *mut core::ffi::c_void,
                &mut everyone_size,
            );
            if made == 0 {
                CloseHandle(own);
                return Err(format!(
                    "SID Everyone не получен: {}",
                    std::io::Error::last_os_error()
                ));
            }

            everyone.Sid = everyone_buffer.as_mut_ptr() as *mut core::ffi::c_void;
            restrict_count = 1;
        }

        let mut restricted: HANDLE = std::ptr::null_mut();
        let created = CreateRestrictedToken(
            own,
            DISABLE_MAX_PRIVILEGE,
            1,
            &admins,
            0,
            std::ptr::null(),
            restrict_count,
            if jailed { &everyone } else { std::ptr::null() },
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
        _jail: Option<&std::path::Path>,
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
        let restricted = run(&request(script), None, &cancel, None)
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
        let restricted_admin =
            run(&request(admin), None, &cancel, None).expect("ограниченный запуск");

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

    #[test]
    fn the_environment_points_temp_inside_the_folder() {
        let dir = std::path::Path::new("C:\\jail");
        let inherited = vec![
            ("Path".to_string(), "C:\\Windows".to_string()),
            ("TEMP".to_string(), "C:\\Users\\x\\Temp".to_string()),
        ];

        let block = environment_block(Some(dir), &inherited);
        let text: String = String::from_utf16_lossy(&block);

        assert!(text.contains("TEMP=C:\\jail"), "{text:?}");
        assert!(text.contains("Path=C:\\Windows"), "наследованное не теряется: {text:?}");
        assert!(text.ends_with('\u{0}'), "блок заканчивается нулём");
    }

    #[test]
    fn without_a_folder_the_environment_is_left_alone() {
        let inherited = vec![("TEMP".to_string(), "C:\\Users\\x\\Temp".to_string())];
        let text = String::from_utf16_lossy(&environment_block(None, &inherited));
        assert!(text.contains("TEMP=C:\\Users\\x\\Temp"), "{text:?}");
    }

    #[cfg(windows)]
    #[test]
    fn the_jail_lets_writing_inside_and_stops_it_outside() {
        let dir = std::env::temp_dir().join("zshelper-zabor");
        let _ = std::fs::remove_dir_all(&dir);
        jail(&dir).expect("папка заперта");

        let make = |script: String| {
            ExecRequest::new(
                "powershell.exe",
                vec![
                    "-NoProfile".to_string(),
                    "-NonInteractive".to_string(),
                    "-Command".to_string(),
                    script,
                ],
            )
        };

        let cancel = AtomicBool::new(false);

        // Внутри папки — можно: иначе забор был бы поломкой, а не защитой.
        let inside = format!(
            "try {{ Set-Content -LiteralPath '{}\\inside.txt' -Value 'ok' -ErrorAction Stop; 'written' }} \
             catch {{ 'denied' }}",
            dir.display()
        );
        let output = run(&make(inside), None, &cancel, Some(&dir)).expect("запуск в папке");
        assert!(
            output.stdout.contains("written"),
            "внутри забора писать можно: {:?} {:?}",
            output.stdout,
            output.stderr
        );

        // Снаружи — нельзя: это и есть забор.
        let outside_path = std::env::temp_dir().join("zshelper-outside.txt");
        let _ = std::fs::remove_file(&outside_path);
        let outside = format!(
            "try {{ Set-Content -LiteralPath '{}' -Value 'ok' -ErrorAction Stop; 'written' }} \
             catch {{ 'denied' }}",
            outside_path.display()
        );
        let output = run(&make(outside), None, &cancel, Some(&dir)).expect("запуск в папке");
        assert!(
            output.stdout.contains("denied"),
            "за забором писать нельзя: {:?} {:?}",
            output.stdout,
            output.stderr
        );

        // Читать системное — можно: забор не должен превращать команду в кирпич.
        let read = r"if (Test-Path -LiteralPath 'C:\Windows\win.ini') { 'read' } else { 'no' }";
        let output = run(&make(read.to_string()), None, &cancel, Some(&dir)).expect("запуск");
        assert!(output.stdout.contains("read"), "{:?}", output.stdout);

        let _ = std::fs::remove_dir_all(&dir);
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
        let output = run(&request, Some(limits), &cancel, None)
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
