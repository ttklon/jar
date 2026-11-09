//! Распознавание речи своим движком: `whisper-server` рядом с приложением.
//!
//! Зачем свой путь, если в системе уже есть распознавание: чтобы звук не покидал
//! компьютер. Пока движка нет, приложение обязано сказать «локально распознавать
//! нечем», а не делать вид, что локально.
//!
//! Движок — отдельный бинарник, как и `llama-server`: человек кладёт его в
//! `sidecars/whisper-server.exe` (или держит в `PATH`) вместе с моделью. Поэтому
//! первое, что проверяется, — есть ли файл движка и файл модели.
//!
//! Общение с движком — обычный HTTP по `127.0.0.1`, собранный руками: одна форма и
//! один ответ на JSON не стоят ещё одной зависимости.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::llama;

/// Имя бинарника в сборке под Windows.
pub const PROGRAM: &str = "whisper-server.exe";

/// Куда движок принимает звук.
pub const ENDPOINT: &str = "/inference";

/// Граница multipart-формы. Фиксированная: форму собираем мы, и разбирает её движок.
const BOUNDARY: &str = "jar-whisper-form";

/// Сколько ждём распознавания. Минута записи на средней машине — считанные секунды,
/// но первый запуск грузит модель, поэтому запас большой.
pub const TIMEOUT: Duration = Duration::from_secs(120);

/// Где приложение ищет движок: рядом с собой, затем в `PATH`.
pub fn find_program(base: &Path) -> Option<PathBuf> {
    llama::find_named(base, PROGRAM)
}

/// Флаги запуска. Наружу движок не смотрит, потоки — по числу ядер не раздуваем.
pub fn args(model: &Path, port: u16) -> Vec<String> {
    vec![
        "--model".to_string(),
        model.display().to_string(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--threads".to_string(),
        "4".to_string(),
    ]
}

/// Заголовки формы с одним файлом `audio.wav`.
fn head(len: usize) -> String {
    format!(
        "POST {ENDPOINT} HTTP/1.1\r\n\
         Host: 127.0.0.1\r\n\
         Connection: close\r\n\
         Content-Type: multipart/form-data; boundary={BOUNDARY}\r\n\
         Content-Length: {len}\r\n\
         \r\n"
    )
}

/// Тело формы: файл целиком, без перекодирования.
fn body(wav: &[u8], len: usize) -> Vec<u8> {
    let mut body = Vec::with_capacity(len);
    body.extend_from_slice(
        format!(
            "--{BOUNDARY}\r\n\
             Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n\
             Content-Type: audio/wav\r\n\
             \r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(wav);
    body.extend_from_slice(format!("\r\n--{BOUNDARY}--\r\n").as_bytes());
    body
}

/// Длина тела формы — её и указываем в заголовке.
pub fn body_len(wav: &[u8]) -> usize {
    body(wav, 0).len()
}

/// Полный HTTP-запрос: то, что уходит в движок.
pub fn request(wav: &[u8]) -> Vec<u8> {
    let len = body_len(wav);
    let mut request = head(len).into_bytes();
    request.extend_from_slice(&body(wav, len));
    request
}

/// Текст из ответа движка. Пустой текст — это «ничего не разобрал», а не ошибка.
pub fn text_from_json(raw: &str) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(raw).map_err(|error| format!("движок ответил не JSON: {error}"))?;

    if let Some(error) = value.get("error").and_then(|error| error.as_str()) {
        return Err(format!("движок не смог: {error}"));
    }

    let text = value
        .get("text")
        .and_then(|text| text.as_str())
        .ok_or_else(|| "в ответе движка нет поля text".to_string())?;

    Ok(text.trim().to_string())
}

/// Ждёт, пока на порту начнут принимать соединения.
///
/// Проверяем именно порт, а не конкретный путь: у `whisper-server` нет обещанного
/// `/health`, и проверять готовность догадкой значило бы врать про готовность.
pub fn wait_port(port: u16, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
            Duration::from_millis(300),
        )
        .is_ok()
        {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Запускает движок в фоне: свой лог, свой порт, никакого окна.
///
/// Не ответил портом за `timeout` — процесс останавливается здесь же: висящий движок
/// без хозяина это утечка, а не «пусть работает».
pub fn start(
    program: &Path,
    model: &Path,
    port: u16,
    log: &Path,
    timeout: Duration,
) -> Result<std::process::Child, String> {
    use std::process::{Command, Stdio};

    let out =
        std::fs::File::create(log).map_err(|error| format!("лог движка не создаётся: {error}"))?;
    let errors = out
        .try_clone()
        .map_err(|error| format!("лог движка не открывается второй раз: {error}"))?;

    let mut child = Command::new(program)
        .args(args(model, port))
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(errors))
        .spawn()
        .map_err(|error| format!("движок не запустился: {error}"))?;

    let deadline = std::time::Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!(
                    "движок завершился до готовности ({status}), лог: {}",
                    log.display()
                ));
            }
            Ok(None) => {}
            Err(error) => {
                let _ = child.kill();
                return Err(format!("состояние движка не читается: {error}"));
            }
        }

        if wait_port(port, Duration::from_millis(200)) {
            return Ok(child);
        }

        if std::time::Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "движок не открыл порт {port} за {} с, лог: {}",
                timeout.as_secs(),
                log.display()
            ));
        }
    }
}

/// Отделяет тело ответа от заголовков.
fn body_of(response: &[u8]) -> &[u8] {
    response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|at| &response[at + 4..])
        .unwrap_or(response)
}

/// Отправляет звук движку и возвращает распознанный текст.
///
/// Ошибки различаются по смыслу: «движок не отвечает» (не запущен или умер) и
/// «движок ответил, но не тем» (разбирать должен человек, а не догадка).
pub fn post(port: u16, wav: &[u8], timeout: Duration) -> Result<String, String> {
    if wav.is_empty() {
        return Err("нечего распознавать: пустая запись".to_string());
    }

    let address = ("127.0.0.1", port)
        .to_socket_addrs()
        .map_err(|error| format!("адрес движка не разобрался: {error}"))?
        .next()
        .ok_or_else(|| "адрес движка не разобрался".to_string())?;

    let mut stream = TcpStream::connect_timeout(&address, timeout)
        .map_err(|_| format!("движок не отвечает на 127.0.0.1:{port}"))?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();

    stream
        .write_all(&request(wav))
        .map_err(|error| format!("запись не отправилась: {error}"))?;
    stream.flush().ok();

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("ответ движка не прочитался: {error}"))?;

    if response.is_empty() {
        return Err("движок закрыл соединение, ничего не ответив".to_string());
    }

    let body = String::from_utf8_lossy(body_of(&response)).to_string();
    text_from_json(&body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    fn wav_fixture() -> Vec<u8> {
        // Настоящий WAV не нужен: проверяем, что байты дошли без перекодирования.
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&[0x24, 0x00, 0x00, 0x00]);
        bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&[1, 2, 3, 4, 5]);
        bytes
    }

    #[test]
    fn request_is_a_multipart_post_with_the_sound_as_is() {
        let wav = wav_fixture();
        let request = request(&wav);
        let text = String::from_utf8_lossy(&request);

        assert!(text.starts_with("POST /inference HTTP/1.1\r\n"), "{text}");
        assert!(text.contains("boundary=jar-whisper-form"), "{text}");
        assert!(text.contains("filename=\"audio.wav\""), "{text}");
        assert!(text.contains(&format!("Content-Length: {}", body_len(&wav))));

        // Звук лежит в теле без изменений: иначе движок получит не то, что записали.
        let at = request
            .windows(4)
            .position(|window| window == b"RIFF")
            .expect("звук в запросе");
        assert_eq!(&request[at..at + wav.len()], &wav[..]);
    }

    #[test]
    fn text_comes_out_trimmed_and_empty_is_not_an_error() {
        assert_eq!(
            text_from_json(r#"{"text":"  привет, мир  "}"#).expect("текст"),
            "привет, мир"
        );
        assert_eq!(
            text_from_json(r#"{"text":""}"#).expect("пустой текст — не ошибка"),
            ""
        );

        let error = text_from_json(r#"{"error":"model not loaded"}"#).expect_err("ошибка движка");
        assert!(error.contains("model not loaded"), "{error}");

        let error = text_from_json("не json").expect_err("это не JSON");
        assert!(error.contains("не JSON"), "{error}");

        let error = text_from_json(r#"{"segments":[]}"#).expect_err("нет поля text");
        assert!(error.contains("нет поля text"), "{error}");
    }

    #[test]
    fn post_sends_the_sound_and_reads_the_answer() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("порт");
        let port = listener.local_addr().expect("адрес").port();

        let worker = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("соединение");
            let mut buffer = [0u8; 8192];
            let read = stream.read(&mut buffer).expect("запрос");
            let request = String::from_utf8_lossy(&buffer[..read]).to_string();

            let answer = r#"{"text":" открой почту "}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\
                 Content-Length: {}\r\n\r\n{answer}",
                answer.len()
            );
            stream.write_all(response.as_bytes()).ok();
            request
        });

        let text = post(port, &wav_fixture(), Duration::from_secs(5)).expect("ответ движка");
        let request = worker.join().expect("поток ответил");

        assert_eq!(text, "открой почту");
        assert!(request.starts_with("POST /inference"), "{request}");
    }

    #[test]
    fn a_silent_engine_is_named_as_silent() {
        // Порт, который никто не слушает: свободный порт закрываем сразу.
        let port = {
            let listener = TcpListener::bind("127.0.0.1:0").expect("порт");
            listener.local_addr().expect("адрес").port()
        };

        let error = post(port, &wav_fixture(), Duration::from_millis(300)).expect_err("движка нет");
        assert!(error.contains("не отвечает"), "{error}");

        let error = post(port, &[], Duration::from_millis(300)).expect_err("пустая запись");
        assert!(error.contains("пустая запись"), "{error}");
    }

    #[test]
    fn engine_is_looked_for_next_to_the_app_then_in_path() {
        let dir = std::env::temp_dir().join(format!("zshelper-stt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("sidecars")).expect("папка");

        assert!(find_program(&dir).is_none(), "пустая папка — движка нет");

        let program = dir.join("sidecars").join(PROGRAM);
        std::fs::write(&program, b"not really").expect("файл");
        assert_eq!(find_program(&dir), Some(program.clone()));

        let model = dir.join("ggml-small.bin");
        std::fs::write(&model, b"weights").expect("модель");
        let flags = args(&model, 8081);
        assert!(flags.contains(&"--model".to_string()));
        assert!(flags.contains(&"127.0.0.1".to_string()));
        assert!(flags.contains(&"8081".to_string()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn port_wait_sees_an_open_port_and_a_closed_one() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("порт");
        let port = listener.local_addr().expect("адрес").port();
        assert!(wait_port(port, Duration::from_secs(2)), "порт слушают");

        drop(listener);
        assert!(
            !wait_port(port, Duration::from_millis(300)),
            "после закрытия никто не слушает"
        );
    }

    #[cfg(windows)]
    #[test]
    fn an_engine_that_dies_at_once_is_reported_with_its_log() {
        let dir = std::env::temp_dir().join(format!("zshelper-stt-dead-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка");
        let model = dir.join("ggml-small.bin");
        std::fs::write(&model, b"weights").expect("модель");
        let log = dir.join("stt.log");

        // Заглушка вместо движка: сразу выходит, порт не открывает.
        let program = std::path::Path::new("cmd.exe");
        let error = start(program, &model, 8099, &log, Duration::from_secs(5))
            .expect_err("такой движок не поднимется");
        assert!(
            error.contains("завершился до готовности") || error.contains("не открыл порт"),
            "{error}"
        );
        assert!(log.exists(), "лог остаётся на диске");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
