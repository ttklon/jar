//! Настоящая клетка: AppContainer — свой SID, свой реестр, своя папка.
//!
//! Предыдущая попытка запереть файлы ограничивающими SID провалилась честно: процесс не
//! запускался (`0xC0000142`, инициализация библиотек). Причина — у такого токена нет
//! ни реестра пользователя, ни места, куда писать. AppContainer решает именно это:
//! Windows сама даёт контейнеру собственный вид реестра и собственную папку, а всё
//! остальное закрывает.
//!
//! Что получает команда внутри:
//! * **писать** можно только туда, куда её пустили (наша папка пробного запуска) и в свою
//!   папку контейнера;
//! * **читать** можно системное: `C:\Windows` открыт всем пакетам, иначе не запустится
//!   ни одна программа;
//! * **сети нет**: в списке возможностей контейнера нет `internetClient`, а без него
//!   сокет наружу не открывается;
//! * личные папки человека и его реестр — недоступны.
//!
//! Токен при этом остаётся ограниченным (`restricted`): AppContainer убирает доступ к
//! чужим файлам, ограниченный токен — привилегии и права администратора. Одно без
//! другого неполно, поэтому здесь оба.

use std::path::{Path, PathBuf};

/// Умеет ли система запускать в контейнере.
pub fn available() -> bool {
    cfg!(windows)
}

/// Что сказать человеку — без обещаний, которых нет.
pub fn note() -> String {
    if available() {
        "пробный запуск идёт в AppContainer: чужие файлы недоступны, сети нет, писать можно \
         только в папку пробного запуска"
            .to_string()
    } else {
        "AppContainer — механизм Windows: здесь пробный запуск идёт без клетки".to_string()
    }
}

/// Имя профиля контейнера. Одно на приложение: профиль переживает запуск, и это нормально.
const PROFILE: &str = "ZSHelper.Sandbox";

#[cfg(windows)]
mod imp {
    use super::{Path, PathBuf, PROFILE};
    use crate::executor::{ExecOutput, ExecRequest};
    use crate::isolation::Limits;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Instant;
    use windows_sys::Win32::Foundation::{
        CloseHandle, LocalFree, HANDLE, HLOCAL, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::Security::Isolation::{
        CreateAppContainerProfile, DeriveAppContainerSidFromAppContainerName,
    };
    use windows_sys::Win32::Security::{
        Authorization::ConvertSidToStringSidW, FreeSid, SECURITY_CAPABILITIES, PSID,
    };
    use windows_sys::Win32::System::Threading::{
        CreateProcessAsUserW, DeleteProcThreadAttributeList, GetExitCodeProcess,
        InitializeProcThreadAttributeList, ResumeThread, TerminateProcess,
        UpdateProcThreadAttribute, WaitForSingleObject, CREATE_NO_WINDOW, CREATE_SUSPENDED,
        CREATE_UNICODE_ENVIRONMENT, EXTENDED_STARTUPINFO_PRESENT, LPPROC_THREAD_ATTRIBUTE_LIST,
        PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES, STARTF_USESTDHANDLES,
        STARTUPINFOEXW,
    };

    const POLL_MS: u32 = 30;
    /// `HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS)`: профиль уже создан раньше.
    const ALREADY_EXISTS: i32 = -2147023673;

    static RUNS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

    /// Открытая клетка: профиль контейнера и папка, куда ему можно писать.
    pub struct Sandbox {
        sid: PSID,
        dir: PathBuf,
    }

    // SID контейнера не привязан к потоку.
    unsafe impl Send for Sandbox {}

    impl Drop for Sandbox {
        fn drop(&mut self) {
            unsafe {
                FreeSid(self.sid);
            }
        }
    }

    /// Готовит клетку: профиль контейнера, SID и разрешение писать в папку.
    pub fn open(dir: &Path) -> Result<Sandbox, String> {
        std::fs::create_dir_all(dir)
            .map_err(|error| format!("папка пробного запуска не создаётся: {error}"))?;

        let name = wide(PROFILE);
        let mut sid: PSID = std::ptr::null_mut();

        let created = unsafe {
            CreateAppContainerProfile(
                name.as_ptr(),
                name.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                &mut sid,
            )
        };

        if created < 0 {
            if created != ALREADY_EXISTS {
                return Err(format!("профиль контейнера не создан: 0x{created:08X}"));
            }

            // Профиль уже был: берём его SID по имени.
            let derived = unsafe {
                DeriveAppContainerSidFromAppContainerName(name.as_ptr(), &mut sid)
            };
            if derived < 0 {
                return Err(format!("SID контейнера не получен: 0x{derived:08X}"));
            }
        }

        let sandbox = Sandbox {
            sid,
            dir: dir.to_path_buf(),
        };

        sandbox.allow(dir)?;
        Ok(sandbox)
    }

    impl Sandbox {
        /// Разрешает контейнеру писать в папку. `icacls` берёт SID строкой, а не именем:
        /// имя контейнера зависит от системы, SID — нет.
        pub fn allow(&self, dir: &Path) -> Result<(), String> {
            let text = self.sid_string()?;
            let rule = format!("*{text}:(OI)(CI)F");

            let output = std::process::Command::new("icacls")
                .arg(dir)
                .arg("/grant")
                .arg(&rule)
                .output()
                .map_err(|error| format!("icacls не запустился: {error}"))?;

            if !output.status.success() {
                return Err(format!(
                    "папка не открыта контейнеру: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }

            Ok(())
        }

        /// Папка, в которую контейнеру можно писать.
        pub fn dir(&self) -> &Path {
            &self.dir
        }

        fn sid_string(&self) -> Result<String, String> {
            let mut raw: *mut u16 = std::ptr::null_mut();
            let ok = unsafe { ConvertSidToStringSidW(self.sid, &mut raw) };
            if ok == 0 || raw.is_null() {
                return Err("SID контейнера не превращён в строку".to_string());
            }

            let mut length = 0usize;
            unsafe {
                while *raw.add(length) != 0 {
                    length += 1;
                }
            }

            let slice = unsafe { std::slice::from_raw_parts(raw, length) };
            let text = String::from_utf16_lossy(slice);
            unsafe {
                LocalFree(raw as HLOCAL);
            }
            Ok(text)
        }

        /// Запускает команду внутри клетки.
        pub fn run(
            &self,
            request: &ExecRequest,
            limits: Option<Limits>,
            cancel: &AtomicBool,
        ) -> Result<ExecOutput, String> {
            let started = Instant::now();
            let number = RUNS.fetch_add(1, Ordering::Relaxed);
            let outdir = std::env::temp_dir().join(format!(
                "zshelper-kletka-{}-{number}",
                std::process::id()
            ));
            std::fs::create_dir_all(&outdir)
                .map_err(|error| format!("папка вывода: {error}"))?;

            let out_file = outdir.join("stdout.txt");
            let err_file = outdir.join("stderr.txt");

            let (stdout_handle, stdout_file) = open_inheritable(&out_file)?;
            let (stderr_handle, stderr_file) = open_inheritable(&err_file)?;
            let (stdin_handle, stdin_file) =
                open_inheritable(std::path::Path::new("NUL"))?;

            let mut limits_note = "клетка: AppContainer, без сети".to_string();
            let spawned = unsafe {
                self.spawn(request, stdout_handle, stderr_handle, stdin_handle)
            };

            let (process, thread, pid) = match spawned {
                Ok(triple) => triple,
                Err(reason) => {
                    drop((stdout_file, stderr_file, stdin_file));
                    let _ = std::fs::remove_dir_all(&outdir);
                    return Err(reason);
                }
            };

            let mut guard = None;
            if let Some(limits) = limits {
                match crate::isolation::attach(pid, &limits) {
                    Ok(handle) => {
                        limits_note.push_str(&format!("; под потолком: {}", limits.describe()));
                        guard = Some(handle);
                    }
                    Err(reason) => {
                        limits_note.push_str(&format!("; потолки не применены: {reason}"));
                    }
                }
            }

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
                drop(guard);
                CloseHandle(process);
            }

            drop((stdout_file, stderr_file, stdin_file));

            let stdout = std::fs::read(&out_file).unwrap_or_default();
            let stderr = std::fs::read(&err_file).unwrap_or_default();
            let _ = std::fs::remove_dir_all(&outdir);

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

        unsafe fn spawn(
            &self,
            request: &ExecRequest,
            stdout_handle: HANDLE,
            stderr_handle: HANDLE,
            stdin_handle: HANDLE,
        ) -> Result<(HANDLE, HANDLE, u32), String> {
            let token = crate::restricted::token()?;

            let capabilities = SECURITY_CAPABILITIES {
                AppContainerSid: self.sid,
                // Никаких возможностей: без `internetClient` сеть закрыта.
                Capabilities: std::ptr::null_mut(),
                CapabilityCount: 0,
                Reserved: 0,
            };

            let mut size = 0usize;
            InitializeProcThreadAttributeList(std::ptr::null_mut(), 1, 0, &mut size);
            let mut buffer = vec![0u8; size];
            let list = buffer.as_mut_ptr() as LPPROC_THREAD_ATTRIBUTE_LIST;

            if InitializeProcThreadAttributeList(list, 1, 0, &mut size) == 0 {
                CloseHandle(token);
                return Err(format!(
                    "список атрибутов не создан: {}",
                    std::io::Error::last_os_error()
                ));
            }

            let updated = UpdateProcThreadAttribute(
                list,
                0,
                PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES as usize,
                &capabilities as *const _ as *const core::ffi::c_void,
                std::mem::size_of::<SECURITY_CAPABILITIES>(),
                std::ptr::null_mut(),
                std::ptr::null(),
            );

            if updated == 0 {
                DeleteProcThreadAttributeList(list);
                CloseHandle(token);
                return Err(format!(
                    "возможности контейнера не привязаны: {}",
                    std::io::Error::last_os_error()
                ));
            }

            let mut line_wide = wide(&crate::restricted::command_line(
                &request.program,
                &request.argv,
            ));
            let mut environment = crate::restricted::environment_block(
                Some(self.dir()),
                &std::env::vars().collect::<Vec<_>>(),
            );
            let directory = wide(&self.dir().display().to_string());

            let mut si: STARTUPINFOEXW = std::mem::zeroed();
            si.StartupInfo.cb = std::mem::size_of::<STARTUPINFOEXW>() as u32;
            si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
            si.StartupInfo.hStdOutput = stdout_handle;
            si.StartupInfo.hStdError = stderr_handle;
            si.StartupInfo.hStdInput = stdin_handle;
            si.lpAttributeList = list;

            let mut pi: PROCESS_INFORMATION = std::mem::zeroed();
            let created = CreateProcessAsUserW(
                token,
                std::ptr::null(),
                line_wide.as_mut_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
                CREATE_NO_WINDOW
                    | CREATE_SUSPENDED
                    | EXTENDED_STARTUPINFO_PRESENT
                    | CREATE_UNICODE_ENVIRONMENT,
                environment.as_mut_ptr() as *const core::ffi::c_void,
                directory.as_ptr(),
                &si.StartupInfo as *const _ as *const _,
                &mut pi,
            );

            DeleteProcThreadAttributeList(list);
            CloseHandle(token);

            if created == 0 {
                return Err(format!(
                    "команда не запущена в контейнере: {}",
                    std::io::Error::last_os_error()
                ));
            }

            Ok((pi.hProcess, pi.hThread, pi.dwProcessId))
        }
    }

    fn open_inheritable(path: &Path) -> Result<(HANDLE, std::fs::File), String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::{SetHandleInformation, HANDLE_FLAG_INHERIT};

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

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Path;
    use crate::executor::{ExecOutput, ExecRequest};
    use crate::isolation::Limits;
    use std::sync::atomic::AtomicBool;

    pub struct Sandbox;

    pub fn open(_dir: &Path) -> Result<Sandbox, String> {
        Err("AppContainer есть только на Windows".to_string())
    }

    impl Sandbox {
        pub fn dir(&self) -> &Path {
            Path::new(".")
        }

        pub fn run(
            &self,
            _request: &ExecRequest,
            _limits: Option<Limits>,
            _cancel: &AtomicBool,
        ) -> Result<ExecOutput, String> {
            Err("AppContainer есть только на Windows".to_string())
        }
    }
}

pub use imp::{open, Sandbox};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_note_says_what_is_true_on_this_system() {
        let note = note();
        if available() {
            assert!(note.contains("AppContainer"), "{note}");
        } else {
            assert!(note.contains("без клетки"), "{note}");
        }
    }

    #[cfg(windows)]
    mod windows_only {
        use super::super::*;
        use crate::executor::ExecRequest;
        use std::sync::atomic::AtomicBool;

        fn request(program: &str, args: &[&str]) -> ExecRequest {
            ExecRequest::new(program, args.iter().map(|arg| arg.to_string()).collect())
        }

        fn dir(name: &str) -> PathBuf {
            let path = std::env::temp_dir().join(name);
            let _ = std::fs::remove_dir_all(&path);
            path
        }

        #[test]
        fn a_container_starts_a_simple_program() {
            let sandbox = open(&dir("zshelper-kletka-start"))
                .unwrap_or_else(|error| panic!("ошибка: клетка не открылась: {error}"));
            let cancel = AtomicBool::new(false);

            let output = sandbox
                .run(&request("cmd.exe", &["/c", "echo ok"]), None, &cancel)
                .unwrap_or_else(|error| panic!("ошибка: запуск в клетке: {error}"));

            assert_eq!(
                output.exit_code,
                Some(0),
                "ошибка: клетка не запускает программы: stdout={:?} stderr={:?}",
                output.stdout,
                output.stderr
            );
            assert!(output.stdout.contains("ok"), "{:?}", output.stdout);
        }

        #[test]
        fn the_fence_holds_for_files_and_network() {
            let sandbox = open(&dir("zshelper-kletka-zabor"))
                .unwrap_or_else(|error| panic!("ошибка: клетка не открылась: {error}"));
            let cancel = AtomicBool::new(false);

            // 1. Внутри своей папки писать можно — иначе клетка была бы поломкой.
            let output = sandbox
                .run(
                    &request("cmd.exe", &["/c", "echo x > inside.txt"]),
                    None,
                    &cancel,
                )
                .unwrap_or_else(|error| panic!("ошибка: запуск в клетке: {error}"));
            assert!(
                sandbox.dir().join("inside.txt").exists(),
                "ошибка: внутри папки писать нельзя: code={:?} stdout={:?} stderr={:?}",
                output.exit_code,
                output.stdout,
                output.stderr
            );

            // 2. Снаружи писать нельзя.
            let outside = std::env::temp_dir().join("zshelper-vne-kletki.txt");
            let _ = std::fs::remove_file(&outside);
            let target = format!("echo x > \"{}\"", outside.display());
            sandbox
                .run(&request("cmd.exe", &["/c", &target]), None, &cancel)
                .unwrap_or_else(|error| panic!("ошибка: запуск в клетке: {error}"));

            assert!(
                std::fs::metadata(&outside).is_err(),
                "ошибка: из клетки записали файл снаружи: {}",
                outside.display()
            );

            // 3. Сети нет. Вне клетки — есть, иначе проверка ничего не доказывает.
            let probe = request(
                "curl.exe",
                &["-s", "-m", "5", "-o", "NUL", "http://example.com"],
            );
            let inside = sandbox.run(&probe, None, &cancel).unwrap_or_else(|error| panic!("ошибка: запуск в клетке: {error}"));
            let outside_network =
                crate::executor::run(&probe, &cancel)
                    .unwrap_or_else(|error| panic!("ошибка: запуск вне клетки: {error}"));

            assert_eq!(
                outside_network.exit_code,
                Some(0),
                "проверка бессмысленна, если у машины нет сети: {:?}",
                outside_network.stderr
            );
            assert_ne!(
                inside.exit_code,
                Some(0),
                "ошибка: из клетки есть выход в сеть: stdout={:?} stderr={:?}",
                inside.stdout,
                inside.stderr
            );
        }
    }
}
