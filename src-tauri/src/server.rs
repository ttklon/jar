//! Управляемый локальный процесс: запуск, ожидание `/health`, остановка.
//!
//! Модель поднимается отдельным процессом на `127.0.0.1`, и приложение обязано уметь
//! три вещи: запустить его, дождаться, что он действительно отвечает, и остановить.
//! «Запустился» здесь означает именно «ответил по HTTP», а не «spawn не упал»: процесс
//! может подняться и молчать, и тогда интерфейс врал бы про готовность.
//!
//! Сознательные ограничения:
//! * только `127.0.0.1` — наружу ничего не смотрит;
//! * свой лог у процесса: упавший сервер должен оставить след, а не исчезнуть молча;
//! * PID знает приложение, а не человек: остановка идёт по нему.
//!
//! Сейчас модуль не подключён к моделям: следующим шагом сюда придёт `llama-server`
//! со своими флагами (см. `ROADMAP.md`). Тесты поднимают вместо него заглушку на
//! PowerShell с `HttpListener` — контракт тот же: процесс + ответ на `/health`.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Что запускаем и как проверяем, что оно живо.
#[derive(Debug, Clone)]
pub struct ServerSpec {
    pub program: String,
    pub args: Vec<String>,
    pub port: u16,
    /// Путь проверки здоровья, для `llama-server` — `/health`.
    pub health_path: String,
}

impl ServerSpec {
    pub fn new(program: &str, args: Vec<String>, port: u16, health_path: &str) -> Self {
        Self {
            program: program.to_string(),
            args,
            port,
            health_path: health_path.to_string(),
        }
    }

    fn address(&self) -> SocketAddr {
        SocketAddr::from(([127, 0, 0, 1], self.port))
    }
}

/// Запущенный процесс.
#[derive(Debug)]
pub struct Server {
    child: Child,
    spec: ServerSpec,
}

impl Server {
    /// Запускает процесс и ждёт ответа на проверку здоровья.
    ///
    /// Если процесс не ответил за `timeout`, он **останавливается** здесь же: висящий
    /// sidecar без хозяина — это утечка, а не «пусть работает».
    pub fn start(spec: &ServerSpec, log: &Path, timeout: Duration) -> Result<Self, String> {
        let out = std::fs::File::create(log)
            .map_err(|error| format!("лог процесса не создаётся: {error}"))?;
        let errors = out
            .try_clone()
            .map_err(|error| format!("лог процесса не открывается второй раз: {error}"))?;

        let mut child = Command::new(&spec.program)
            .args(&spec.args)
            .stdout(Stdio::from(out))
            .stderr(Stdio::from(errors))
            .spawn()
            .map_err(|error| format!("процесс не запустился: {error}"))?;

        let deadline = Instant::now() + timeout;

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Err(format!(
                        "процесс завершился до готовности ({status}), лог: {}",
                        log.display()
                    ));
                }
                Ok(None) => {}
                Err(error) => {
                    let _ = child.kill();
                    return Err(format!("состояние процесса не читается: {error}"));
                }
            }

            if answers(spec, Duration::from_millis(400)) {
                return Ok(Self {
                    child,
                    spec: spec.clone(),
                });
            }

            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "процесс не ответил на {} за {} с, лог: {}",
                    spec.health_path,
                    timeout.as_secs(),
                    log.display()
                ));
            }

            std::thread::sleep(Duration::from_millis(100));
        }
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn port(&self) -> u16 {
        self.spec.port
    }

    /// Остановка. Уже завершившийся процесс — не ошибка: цель достигнута.
    pub fn stop(&mut self) -> Result<(), String> {
        match self.child.try_wait() {
            Ok(Some(_)) => Ok(()),
            Ok(None) => {
                self.child
                    .kill()
                    .map_err(|error| format!("процесс не останавливается: {error}"))?;
                self.child
                    .wait()
                    .map_err(|error| format!("процесс не завершился: {error}"))?;
                Ok(())
            }
            Err(error) => Err(format!("состояние процесса не читается: {error}")),
        }
    }
}

/// Отвечает ли процесс по проверке здоровья.
pub fn answers(spec: &ServerSpec, timeout: Duration) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&spec.address(), timeout) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(timeout));

    let request = format!(
        "GET {} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        spec.health_path
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }

    let mut head = [0u8; 64];
    match stream.read(&mut head) {
        // Смотрим только строку статуса: тело ответа нам не нужно.
        Ok(read) if read > 0 => {
            let line = String::from_utf8_lossy(&head[..read]);
            line.starts_with("HTTP/") && line.contains(" 200")
        }
        _ => false,
    }
}

/// Свободный порт на `127.0.0.1`. Порт освобождается сразу после ответа — между
/// выбором и запуском его теоретически может занять кто-то другой, и это нормально:
/// тогда процесс не поднимется, и мы скажем об этом честно.
pub fn free_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|error| format!("порт не выбрать: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("порт не прочитать: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Заглушка вместо модели: PowerShell поднимает `HttpListener` и отвечает 200 на
    /// всё. Так проверяется контракт «процесс + /health», а не конкретный движок.
    #[cfg(windows)]
    fn stand_in(port: u16) -> ServerSpec {
        let script = format!(
            "$l = [System.Net.HttpListener]::new(); \
             $l.Prefixes.Add('http://127.0.0.1:{port}/'); \
             $l.Start(); \
             while ($true) {{ \
               $c = $l.GetContext(); \
               $b = [System.Text.Encoding]::ASCII.GetBytes('ok'); \
               $c.Response.StatusCode = 200; \
               $c.Response.OutputStream.Write($b, 0, $b.Length); \
               $c.Response.Close() \
             }}"
        );

        ServerSpec::new(
            "powershell.exe",
            vec![
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-Command".to_string(),
                script,
            ],
            port,
            "/health",
        )
    }

    fn temp_log(tag: &str) -> std::path::PathBuf {
        let path =
            std::env::temp_dir().join(format!("zshelper-sidecar-{tag}-{}.log", std::process::id()));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn free_port_can_be_bound() {
        let port = free_port().expect("порт выбирается");
        assert!(port > 1024, "системные порты нам не нужны: {port}");
        assert!(TcpListener::bind(("127.0.0.1", port)).is_ok());
    }

    #[test]
    fn nothing_listening_means_no_answer() {
        let port = free_port().expect("порт выбирается");
        let spec = ServerSpec::new("nothing", Vec::new(), port, "/health");
        assert!(!answers(&spec, Duration::from_millis(200)));
    }

    #[test]
    fn absent_program_is_a_clear_error() {
        let spec = ServerSpec::new(
            "zshelper-no-such-program",
            Vec::new(),
            free_port().expect("порт"),
            "/health",
        );
        let error = Server::start(&spec, &temp_log("absent"), Duration::from_secs(3))
            .expect_err("такого процесса нет");
        assert!(error.contains("не запустился"), "{error}");
    }

    #[cfg(windows)]
    #[test]
    fn starts_when_health_answers_and_stops_on_request() {
        let port = free_port().expect("порт выбирается");
        let spec = stand_in(port);
        let mut server = Server::start(&spec, &temp_log("started"), Duration::from_secs(20))
            .expect("заглушка обязана ответить");

        assert_eq!(server.port(), port);
        assert!(server.pid() > 0);
        assert!(answers(&spec, Duration::from_millis(500)), "отвечает после старта");

        server.stop().expect("останавливается");

        // Порт освободился: никто больше не отвечает.
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline && answers(&spec, Duration::from_millis(200)) {
            std::thread::sleep(Duration::from_millis(100));
        }
        assert!(!answers(&spec, Duration::from_millis(200)), "после stop никто не отвечает");
    }

    #[cfg(windows)]
    #[test]
    fn process_that_dies_is_reported_with_its_log() {
        let port = free_port().expect("порт выбирается");
        let spec = ServerSpec::new(
            "powershell.exe",
            vec![
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-Command".to_string(),
                "exit 3".to_string(),
            ],
            port,
            "/health",
        );

        let error = Server::start(&spec, &temp_log("dies"), Duration::from_secs(10))
            .expect_err("процесс сразу выходит");
        assert!(error.contains("завершился до готовности"), "{error}");
        assert!(error.contains(".log"), "в ошибке есть путь к логу: {error}");
    }

    #[cfg(windows)]
    #[test]
    fn silent_process_times_out_and_is_stopped() {
        let port = free_port().expect("порт выбирается");
        // Процесс живёт и молчит: ровно тот случай, который легко принять за «готово».
        let spec = ServerSpec::new(
            "powershell.exe",
            vec![
                "-NoProfile".to_string(),
                "-NonInteractive".to_string(),
                "-Command".to_string(),
                "Start-Sleep -Seconds 30".to_string(),
            ],
            port,
            "/health",
        );

        let error = Server::start(&spec, &temp_log("silent"), Duration::from_secs(3))
            .expect_err("молчащий процесс не готов");
        assert!(error.contains("не ответил"), "{error}");
        assert!(error.contains("/health"), "{error}");
    }
}
