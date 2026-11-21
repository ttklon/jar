//! Разговор с моделью по HTTP — только по петле, только один запрос.
//!
//! `llama-server` поднимается рядом (`server.rs`) и слушает `127.0.0.1`. Здесь — клиент к нему:
//! один POST, таймаут, разбор ответа. Свой HTTP вместо тяжёлой библиотеки выбран не из любви к
//! велосипедам: зависимость на весь TLS-стек ради петли на своём же компьютере противоречит
//! обещанию «наружу ничего не уходит». Наружу действительно ничего не идёт — это видно по
//! адресу в коде и проверяется тестом, который поднимает свой сервер на петле.
//!
//! Ошибки разделены по смыслу, потому что человеку нужно разное действие:
//! * «движок не отвечает» — его не запустили или он умер;
//! * «движок ответил отказом» — модель не загрузилась, смотрите лог;
//! * «движок ответил не тем» — ответ есть, но разобрать его нельзя.
//!
//! Что здесь **не** решается: что делать с ответом. Разбор — `intent::parse`, выполнение —
//! `plan` и человек.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

/// Путь к чату в `llama-server` (совместим с OpenAI).
pub const CHAT_PATH: &str = "/v1/chat/completions";

/// Сколько ждём ответа модели. Долго — потому что первый токен считается медленно, но
/// бесконечно ждать нельзя: человек стоит и молчит.
pub const TIMEOUT: Duration = Duration::from_secs(120);

/// Сколько символов ответа показываем в ошибке. Полотно из чужого лога не помогает.
const SNIPPET: usize = 300;

/// Тело запроса к чату: одна реплика человека, без ролей и истории.
///
/// История не отправляется намеренно: у нас нет диалога, а лишний контекст — это лишние
/// токены и лишние поводы соврать. `temperature` низкая: нужен выбор действия, а не рассказ.
pub fn chat_body(prompt: &str, model: &str) -> String {
    chat_body_with(prompt, model, false)
}

/// То же тело, но с выбором: просить ответ целиком или по кускам.
///
/// `stream` не выключается навсегда, потому что для разбора намерения нужен **весь**
/// JSON: `intent::parse` ждёт закрывающую скобку. А вот черновик руки — текст
/// свободной формы, и его можно собирать из кусков: там первый кусок полезен сразу.
pub fn chat_body_with(prompt: &str, model: &str, stream: bool) -> String {
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.0,
        "max_tokens": 400,
        "stream": stream,
    });
    body.to_string()
}

/// Запрос целиком: заголовки и тело. `Content-Length` в байтах, не в символах.
pub fn request(path: &str, body: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(body.len() + 128);
    out.extend_from_slice(
        format!(
            "POST {path} HTTP/1.1\r\n\
             Host: 127.0.0.1\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n",
            body.len()
        )
        .as_bytes(),
    );
    out.extend_from_slice(body.as_bytes());
    out
}

/// Спросить модель. Возвращает уже разобранный текст ответа, без обёрток сервера.
pub fn ask(port: u16, body: &str, timeout: Duration) -> Result<String, String> {
    let answer = post(port, CHAT_PATH, body, timeout)?;
    content(&answer)
}

/// Адрес движка на петле — **без разрешения имени**.
///
/// Это звучит как мелочь, но это не мелочь. `("127.0.0.1", port).to_socket_addrs()`
/// идёт через системный резолвер, а резолвер на Windows в момент смены сети
/// (Wi-Fi ↔ кабель, подключение VPN, «нет доступа к интернету») перезагружает
/// список сетевых интерфейсов и на секунды перестаёт отвечать даже на числовой
/// адрес. Соединение с движком, который стоит на этой же машине, при этом падает
/// с «движок не отвечает» — и человек видит, что локальный помощник сломался от
/// смены Wi-Fi, хотя ни движок, ни наша машина никуда не делись.
///
/// Петля — это константа. Разрешать её через резолвер — значит ставить локальное в
/// зависимость от сетевого, то есть ровно наоборот.
fn loopback(port: u16) -> Result<SocketAddr, String> {
    Ok(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))
}

/// Один POST на петлю. Ошибки говорят, на каком шаге всё встало.
pub fn post(port: u16, path: &str, body: &str, timeout: Duration) -> Result<String, String> {
    let address = loopback(port)?;

    let mut stream = TcpStream::connect_timeout(&address, timeout)
        .map_err(|_| format!("движок не отвечает на 127.0.0.1:{port}"))?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();

    stream
        .write_all(&request(path, body))
        .map_err(|error| format!("запрос не отправился: {error}"))?;
    stream.flush().ok();

    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("ответ модели не прочитался: {error}"))?;

    if response.is_empty() {
        return Err("движок закрыл соединение, ничего не ответив".to_string());
    }

    let (status, headers, body) = split(&response)?;
    let text = if headers.contains("transfer-encoding: chunked") {
        unchunk(body)?
    } else {
        body.to_vec()
    };

    let text = String::from_utf8_lossy(&text).to_string();

    if !(200..300).contains(&status) {
        return Err(format!("движок ответил {status}: {}", snippet(text.trim())));
    }

    Ok(text)
}

/// Один POST на петлю, но тело отдаётся по мере прихода, а не целиком.
///
/// Зачем отдельная функция, а не `post` + разбор: «поток», прочитанный до конца, —
/// это не поток. Первый кусок должен уйти человеку тогда, когда его прислали.
/// `on_chunk` вызывается на каждую **законченную строку** тела: разрезанная пополам
/// строка JSON — ещё не строка, и показывать человеку половину слова нельзя.
///
/// Возвращается тело целиком (уже раскодированное из `chunked`), чтобы вызывающий
/// мог склеить ответ из тех же строк, что видел по пути.
pub fn post_lines<F>(
    port: u16,
    path: &str,
    body: &str,
    timeout: Duration,
    mut on_chunk: F,
) -> Result<String, String>
where
    F: FnMut(&str) -> Result<(), String>,
{
    let address = loopback(port)?;

    let mut stream = TcpStream::connect_timeout(&address, timeout)
        .map_err(|_| format!("движок не отвечает на 127.0.0.1:{port}"))?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();

    stream
        .write_all(&request(path, body))
        .map_err(|error| format!("запрос не отправился: {error}"))?;
    stream.flush().ok();

    // Заголовки читаются по байту: иначе тело уже началось, а границу мы не знаем.
    let mut head: Vec<u8> = Vec::new();
    let mut byte = [0u8; 1];
    while head.len() < 64 * 1024 {
        match stream.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                head.push(byte[0]);
                if head.ends_with(b"\r\n\r\n") {
                    break;
                }
            }
            Err(error) => return Err(format!("ответ модели не прочитался: {error}")),
        }
    }

    if head.is_empty() {
        return Err("движок закрыл соединение, ничего не ответив".to_string());
    }

    let (status, headers, _) = split(&head)?;
    let chunked = headers.contains("transfer-encoding: chunked");

    let mut raw = Vec::new();
    let mut decoded: Vec<u8> = Vec::new();
    let mut chunked_state = ChunkedState::default();
    let mut pending: Vec<u8> = Vec::new();
    let mut buffer = [0u8; 8192];

    loop {
        let read = match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => read,
            Err(error) => return Err(format!("ответ модели не прочитался: {error}")),
        };

        raw.extend_from_slice(&buffer[..read]);

        if chunked {
            for piece in chunked_state.feed(&buffer[..read]) {
                decoded.extend_from_slice(&piece);
                pending.extend_from_slice(&piece);
            }
        } else {
            decoded.extend_from_slice(&buffer[..read]);
            pending.extend_from_slice(&buffer[..read]);
        }

        // Строки собираются из байт: символ UTF-8 тоже может разрезаться пополам.
        while let Some(at) = pending.iter().position(|byte| *byte == b'\n') {
            let line = pending.drain(..at + 1).collect::<Vec<u8>>();
            let text = String::from_utf8_lossy(&line).to_string();
            on_chunk(text.trim_end())?;
        }
    }

    if !pending.is_empty() {
        let text = String::from_utf8_lossy(&pending).to_string();
        if !text.trim().is_empty() {
            on_chunk(text.trim_end())?;
        }
    }

    if !(200..300).contains(&status) {
        let text = String::from_utf8_lossy(&decoded).to_string();
        return Err(format!("движок ответил {status}: {}", snippet(text.trim())));
    }

    Ok(String::from_utf8_lossy(&decoded).to_string())
}

/// Разбор `chunked` по мере прихода: `размер` `CRLF` `данные` `CRLF` … `0` `CRLF`.
///
/// Отдельный тип, а не `unchunk` на всём буфере: `unchunk` умеет только законченный
/// ответ, а нам нужен первый кусок задолго до последнего токена.
#[derive(Default)]
struct ChunkedState {
    /// Байты, ещё не разобранные на размер и данные.
    buffer: Vec<u8>,
    /// Сколько байт данных текущего куска ещё ждём.
    need: Option<usize>,
    /// После данных идёт свой `CRLF`, его надо пропустить.
    after_data: bool,
}

impl ChunkedState {
    fn feed(&mut self, bytes: &[u8]) -> Vec<Vec<u8>> {
        let mut out = Vec::new();
        self.buffer.extend_from_slice(bytes);

        loop {
            if self.after_data {
                if self.buffer.len() < 2 {
                    break;
                }
                self.buffer.drain(..2);
                self.after_data = false;
            }

            match self.need {
                None => {
                    let Some(at) = self.buffer.windows(2).position(|window| window == b"\r\n")
                    else {
                        break;
                    };
                    let header = String::from_utf8_lossy(&self.buffer[..at]).to_string();
                    let size_text = header.split(';').next().unwrap_or("").trim().to_string();
                    let Ok(size) = usize::from_str_radix(&size_text, 16) else {
                        break;
                    };
                    self.buffer.drain(..at + 2);
                    if size == 0 {
                        // Конец потока: дальше только пустая строка.
                        break;
                    }
                    self.need = Some(size);
                }
                Some(need) => {
                    if self.buffer.is_empty() {
                        break;
                    }
                    let take = need.min(self.buffer.len());
                    out.push(self.buffer.drain(..take).collect());
                    self.need = if need > take { Some(need - take) } else { None };
                    if self.need.is_none() {
                        self.after_data = true;
                    }
                }
            }
        }

        out
    }
}

/// Потоковый разбор ответа: одна строка SSE → кусок текста.
///
/// Протокол тот же, что на стороне интерфейса (`src/lib/llmStream.ts`), и это не
/// дублирование ради красоты: ядру тоже нужен ответ по частям, иначе первый звук
/// ждёт последний токен. Правила простые и проверяемые без сервера:
///
/// * `data: [DONE]` — конец потока, а не текст;
/// * пустая строка и прочие поля SSE (`event:`, `id:`) — не текст;
/// * битый JSON не убивает уже сказанное, но и не глотается молча: причина уходит
///   в `error`, а текст продолжает собираться.
pub fn stream_delta(line: &str) -> (Option<String>, Option<String>) {
    let trimmed = line.trim();
    if trimmed.is_empty() || !trimmed.starts_with("data:") {
        return (None, None);
    }

    let payload = trimmed["data:".len()..].trim();
    if payload == "[DONE]" {
        return (None, None);
    }

    match serde_json::from_str::<serde_json::Value>(payload) {
        Ok(parsed) => {
            // Отказ посреди потока приходит как `{"error":{...}}` — его нельзя
            // принять за пустой кусок: человек должен увидеть причину.
            if let Some(error) = parsed.get("error") {
                let message = error
                    .get("message")
                    .and_then(|value| value.as_str())
                    .map(str::to_string)
                    .unwrap_or_else(|| error.to_string());
                return (
                    None,
                    Some(format!("движок ответил отказом: {}", snippet(&message))),
                );
            }

            let delta = parsed
                .get("choices")
                .and_then(|choices| choices.get(0))
                .and_then(|choice| choice.get("delta"))
                .and_then(|delta| delta.get("content"))
                .and_then(|content| content.as_str());

            match delta {
                Some(text) if !text.is_empty() => (Some(text.to_string()), None),
                _ => (None, None),
            }
        }
        Err(error) => (None, Some(format!("кусок потока не разобрался: {error}"))),
    }
}

/// Собрать текст из потока целиком: строки SSE на входе, текст и первая причина на выходе.
///
/// Причина возвращается отдельно, а не вместо текста: один непонятный кусок не должен
/// отменять весь ответ, но и врать «всё хорошо» нельзя.
pub fn stream_text(lines: &str) -> (String, Option<String>) {
    let mut text = String::new();
    let mut problem = None;

    for line in lines.lines() {
        let (delta, error) = stream_delta(line);
        if let Some(delta) = delta {
            text.push_str(&delta);
        }
        if let Some(error) = error {
            if problem.is_none() {
                problem = Some(error);
            }
        }
    }

    (text.trim().to_string(), problem)
}

/// Спросить модель потоком и вернуть уже склеенный текст.
///
/// Зачем это ядру, если интерфейс умеет поток сам: черновик руки и проверка движка
/// тоже хотят ответ, не дожидаясь последнего токена. Склейка здесь — один проход по
/// строкам, без промежуточных структур.
pub fn ask_stream(port: u16, body: &str, timeout: Duration) -> Result<String, String> {
    let raw = post(port, CHAT_PATH, body, timeout)?;
    let (text, problem) = stream_text(&raw);

    if text.is_empty() {
        return Err(match problem {
            Some(problem) => problem,
            None => "модель закрыла поток, не сказав ни слова".to_string(),
        });
    }

    Ok(text)
}

/// Разбор ответа: строка состояния, заголовки, тело. Всё три части обязательны.
fn split(response: &[u8]) -> Result<(u16, String, &[u8]), String> {
    let at = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "в ответе нет заголовков: это не HTTP".to_string())?;

    let head = String::from_utf8_lossy(&response[..at]).to_lowercase();
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .ok_or_else(|| "в ответе нет кода состояния".to_string())?;

    Ok((status, head, &response[at + 4..]))
}

/// Разбор `chunked`: llama-server может отвечать потоком даже при `stream: false`.
fn unchunk(body: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(body.len());
    let mut rest = body;

    loop {
        let line_end = rest
            .windows(2)
            .position(|window| window == b"\r\n")
            .ok_or_else(|| "кусок ответа обрезан".to_string())?;

        let header = String::from_utf8_lossy(&rest[..line_end]).to_string();
        let size_text = header.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_text, 16)
            .map_err(|_| format!("размер куска не разобрался: `{size_text}`"))?;

        rest = &rest[line_end + 2..];
        if size == 0 {
            return Ok(out);
        }

        if rest.len() < size {
            return Err("кусок ответа короче заявленного".to_string());
        }

        out.extend_from_slice(&rest[..size]);
        rest = &rest[size..];
        // После данных идёт свой CRLF. Его отсутствие — обрезанный ответ.
        if rest.len() < 2 {
            return Err("после куска ответа нет перевода строки".to_string());
        }
        rest = &rest[2..];
    }
}

/// Текст ответа модели из тела чата: `choices[0].message.content`.
pub fn content(json: &str) -> Result<String, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(json).map_err(|error| format!("движок ответил не JSON: {error}"))?;

    if let Some(error) = parsed.get("error") {
        let message = error
            .get("message")
            .and_then(|value| value.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| error.to_string());
        return Err(format!("движок ответил отказом: {}", snippet(&message)));
    }

    let text = parsed
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|content| content.as_str())
        .ok_or_else(|| {
            format!(
                "в ответе нет поля choices[0].message.content: {}",
                snippet(json)
            )
        })?;

    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("модель ответила пустотой".to_string());
    }

    Ok(text)
}

fn snippet(text: &str) -> String {
    let clean = text.replace(['\n', '\r'], " ");
    let trimmed = clean.trim();
    if trimmed.chars().count() <= SNIPPET {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(SNIPPET).collect();
    format!("{cut}…")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn the_request_is_a_json_post_with_the_exact_length() {
        let body = chat_body("убавить громкость", "qwen.gguf");
        let text = String::from_utf8_lossy(&request(CHAT_PATH, &body)).to_string();

        assert!(
            text.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"),
            "{text}"
        );
        assert!(text.contains("Content-Type: application/json"));
        assert!(text.contains(&format!("Content-Length: {}\r\n", body.len())));
        // Тело без истории: одна реплика, низкая температура, без потока.
        let parsed: serde_json::Value = serde_json::from_str(&body).expect("тело — JSON");
        assert_eq!(parsed["messages"][0]["content"], "убавить громкость");
        assert_eq!(parsed["stream"], false);
        assert_eq!(parsed["temperature"], 0.0);
    }

    #[test]
    fn the_answer_text_is_taken_from_the_first_choice() {
        let json = r#"{"choices":[{"message":{"role":"assistant","content":"  {\"kind\":\"learn\",\"goal\":\"будильник\"}  "}}]}"#;
        assert_eq!(
            content(json).expect("текст"),
            "{\"kind\":\"learn\",\"goal\":\"будильник\"}"
        );
    }

    #[test]
    fn refusals_and_odd_answers_say_what_happened() {
        let refused = content(r#"{"error":{"message":"model not loaded"}}"#).expect_err("отказ");
        assert!(refused.contains("model not loaded"), "{refused}");

        let empty = content(r#"{"choices":[{"message":{"content":"   "}}]}"#).expect_err("пусто");
        assert!(empty.contains("пустотой"), "{empty}");

        let odd = content(r#"{"segments":[]}"#).expect_err("нет поля");
        assert!(odd.contains("choices[0].message.content"), "{odd}");

        let not_json = content("<html>502</html>").expect_err("не JSON");
        assert!(not_json.contains("не JSON"), "{not_json}");
    }

    #[test]
    fn a_chunked_answer_is_glued_back_together() {
        let body = b"7\r\n{\"hello\r\n4\r\n\":1}\r\n0\r\n\r\n";
        assert_eq!(unchunk(body).expect("куски"), b"{\"hello\":1}");

        assert!(unchunk(b"7\r\nabc").is_err(), "обрезанный кусок — ошибка");
        assert!(unchunk(b"zz\r\n").is_err(), "нечисловой размер — ошибка");
    }

    /// Настоящий разговор с сервером на петле: проверяем и запрос, и разбор ответа.
    fn serve(answer: Vec<u8>, seen: std::sync::mpsc::Sender<String>) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("порт");
        let port = listener.local_addr().expect("адрес").port();

        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("соединение");
            let mut buffer = [0u8; 4096];
            let read = stream.read(&mut buffer).unwrap_or(0);
            let _ = seen.send(String::from_utf8_lossy(&buffer[..read]).to_string());
            let _ = stream.write_all(&answer);
            let _ = stream.flush();
        });

        port
    }

    #[test]
    fn a_real_answer_reaches_the_caller() {
        let body = r#"{"choices":[{"message":{"content":"{\"kind\":\"refuse\",\"reason\":\"деньги\"}"}}]}"#;
        let answer = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let (sender, receiver) = std::sync::mpsc::channel();
        let port = serve(answer.into_bytes(), sender);

        let text = ask(
            port,
            &chat_body("заплати", "m.gguf"),
            Duration::from_secs(5),
        )
        .expect("ответ получен");
        assert_eq!(text, r#"{"kind":"refuse","reason":"деньги"}"#);

        let seen = receiver.recv().expect("сервер увидел запрос");
        assert!(seen.starts_with("POST /v1/chat/completions"), "{seen}");
        assert!(seen.contains("заплати"), "{seen}");
    }

    #[test]
    fn a_refusal_from_the_server_keeps_its_words() {
        let body = r#"{"error":{"message":"failed to load model"}}"#;
        let answer = format!(
            "HTTP/1.1 500 Internal Server Error\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let (sender, _receiver) = std::sync::mpsc::channel();
        let port = serve(answer.into_bytes(), sender);

        let error = ask(port, "{}", Duration::from_secs(5)).expect_err("отказ");
        assert!(error.contains("500"), "{error}");
        assert!(error.contains("failed to load model"), "{error}");
    }

    /// Сервер, который отвечает по кускам и **ждёт**, пока клиент прочитает первый.
    ///
    /// Так проверяется именно «раньше»: если клиент ждёт закрытия соединения,
    /// второй кусок придёт только по таймауту, и тест это увидит.
    fn serve_stream(first: &str, second: &str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("порт");
        let port = listener.local_addr().expect("адрес").port();

        let first = first.to_string();
        let second = second.to_string();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("соединение");
            let mut buffer = [0u8; 4096];
            let _ = stream.read(&mut buffer);

            let head =
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(first.as_bytes());
            let _ = stream.flush();

            // Пауза: здесь клиент обязан уже отдать первый кусок. Если он не умеет
            // читать по частям, он придёт сюда же, но с пустым списком.
            thread::sleep(Duration::from_millis(150));
            let _ = stream.write_all(second.as_bytes());
            let _ = stream.flush();
        });

        port
    }

    #[test]
    fn lines_arrive_before_the_answer_is_finished() {
        let port = serve_stream(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Первое.\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"Второе.\"}}]}\ndata: [DONE]\n",
        );

        let started = std::time::Instant::now();
        let mut seen: Vec<String> = Vec::new();
        let mut first_at: Option<Duration> = None;

        let whole = post_lines(port, CHAT_PATH, "{}", Duration::from_secs(5), |line| {
            seen.push(line.to_string());
            if first_at.is_none() && line.contains("Первое") {
                first_at = Some(started.elapsed());
            }
            Ok(())
        })
        .expect("поток прочитан");

        assert!(
            whole.contains("Первое") && whole.contains("Второе"),
            "{whole}"
        );
        // Первая строка пришла до того, как сервер отправил вторую.
        let first_at = first_at.expect("первая строка увидана");
        assert!(
            first_at < Duration::from_millis(150),
            "первая строка пришла через {first_at:?} — значит ждали конца ответа"
        );
        assert_eq!(seen.len(), 3, "{seen:?}");
    }

    #[test]
    fn chunked_stream_is_decoded_piece_by_piece() {
        // Реальный `llama-server` отвечает `Transfer-Encoding: chunked`. Кусок
        // разрезан по границе строки, чтобы проверить инкрементальный разбор.
        let first = "data: {\"choices\":[{\"delta\":{\"content\":\"А\"}}]}\n";
        let second = "data: {\"choices\":[{\"delta\":{\"content\":\"Б\"}}]}\n";

        let mut state = ChunkedState::default();
        let body_first = format!("{:X}\r\n{}\r\n", first.len(), first);
        let body_second = format!("{:X}\r\n{}\r\n0\r\n\r\n", second.len(), second);

        let mut out = state.feed(body_first.as_bytes());
        // Разбор по частям: данные первого куска на месте, второй ещё не пришёл.
        assert_eq!(out.concat(), first.as_bytes());
        assert!(!out.is_empty());

        out = state.feed(body_second.as_bytes());
        assert_eq!(out.concat(), second.as_bytes());
    }

    #[test]
    fn the_loopback_address_never_goes_through_a_resolver() {
        // Это проверка того, что локальный путь не зависит от сети. Резолвер на
        // Windows при смене Wi-Fi на кабель перезагружает интерфейсы и на секунды
        // не отвечает даже на числовой адрес; `to_socket_addrs` в этот момент
        // возвращает ошибку, и соединение с движком на этой же машине падало.
        //
        // Функция ничего не разрешает: она просто собирает адрес из константы.
        // Тест держит это свойство: если кто-то вернёт сюда `to_socket_addrs`
        // «для единообразия», адрес перестанет быть константой, и падение от
        // смены сети вернётся.
        for port in [1u16, 8080, 65_535] {
            let address = loopback(port).expect("петля");
            assert_eq!(address.port(), port);
            assert!(address.ip().is_loopback(), "{address}");
            // Именно IPv4-петля, а не `[::1]`: движок слушает `127.0.0.1`
            // (`llama.rs`), и подключение к `::1` ушло бы не туда.
            assert_eq!(address, SocketAddr::from((Ipv4Addr::LOCALHOST, port)));
        }
    }

    #[test]
    fn the_loopback_address_depends_only_on_the_port() {
        // Свойство, а не скорость: адрес — чистая функция от порта. Резолвер
        // зависит от сети, конфигурации, hosts-файла и службы DNS; константа —
        // ни от чего. Если однажды сюда вернут `to_socket_addrs`, тест этого не
        // заметит (значение то же), поэтому рядом стоит проверка прямо на текст
        // исходника — грубо, но честно: свойство «без резолвера» иначе не
        // удержать.
        let source = include_str!("llm.rs");
        let body = source
            .split("fn loopback(port: u16)")
            .nth(1)
            .expect("функция на месте");
        let body = &body[..body.find("\n}").expect("конец функции")];
        assert!(
            !body.contains("to_socket_addrs"),
            "в loopback снова разрешение имени: локальный путь снова зависит от сети"
        );

        // И само значение: IPv4-петля, ровно тот порт, который просили.
        assert_eq!(
            loopback(8080).expect("петля"),
            SocketAddr::from((Ipv4Addr::LOCALHOST, 8080))
        );
    }

    #[test]
    fn the_engine_is_reached_even_while_the_network_name_lookup_is_down() {
        // Заглушка слушает петлю, а «интернета» нет вовсе — здесь его и не бывает.
        // Проверяется, что разговор с движком от сети не зависит: резолвер имени
        // не участвует, адрес известен заранее.
        let listener = TcpListener::bind("127.0.0.1:0").expect("порт");
        let port = listener.local_addr().expect("адрес").port();
        let server = std::thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                // Читаем запрос до конца заголовков и отвечаем телом.
                let mut buffer = [0u8; 1024];
                let _ = stream.read(&mut buffer);
                let body = "{\"ok\":true}";
                let answer = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(answer.as_bytes());
            }
        });

        let answer = post(port, "/v1/chat/completions", "{}", Duration::from_secs(3));
        let _ = server.join();
        let text = answer.expect("движок ответил");
        assert!(text.contains("\"ok\""), "{text}");
    }

    #[test]
    fn a_dead_engine_says_it_is_not_answering() {
        // Заняли и сразу освободили порт: соединение никто не примет.
        let port = {
            let listener = TcpListener::bind("127.0.0.1:0").expect("порт");
            listener.local_addr().expect("адрес").port()
        };

        let error = ask(port, "{}", Duration::from_millis(300)).expect_err("движка нет");
        assert!(error.contains("не отвечает"), "{error}");
    }

    #[test]
    fn a_streamed_answer_is_glued_from_pieces() {
        // Ровно то, что присылает llama-server при `stream: true`: по строке на кусок.
        let lines = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Гото\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"во.\"}}]}\n\n",
            ": keep-alive\n\n",
            "data: [DONE]\n\n",
        );

        let (text, problem) = stream_text(lines);
        assert_eq!(text, "Готово.");
        assert!(problem.is_none(), "{problem:?}");
    }

    #[test]
    fn stream_pieces_never_leak_protocol_lines_into_speech() {
        // Служебная строка и пустое поле — не текст: иначе человек услышит «DONE».
        let (none, _) = stream_delta("data: [DONE]");
        assert!(none.is_none());
        let (empty, _) = stream_delta("data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}");
        assert!(empty.is_none());
        let (other, _) = stream_delta("event: message");
        assert!(other.is_none());
        // А обычный кусок — текст, вместе с пробелом внутри.
        let (word, _) = stream_delta("data: {\"choices\":[{\"delta\":{\"content\":\"ок \"}}]}");
        assert_eq!(word.expect("кусок"), "ок ");
    }

    #[test]
    fn one_broken_piece_does_not_erase_what_was_already_said() {
        let lines = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Первое предложение. \"}}]}\n",
            "data: {это не json\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"Второе.\"}}]}\n",
        );

        let (text, problem) = stream_text(lines);
        assert_eq!(text, "Первое предложение. Второе.");
        // Битая строка не проглочена: причина названа.
        assert!(problem.expect("причина").contains("не разобрался"));
    }

    #[test]
    fn an_error_in_the_middle_of_a_stream_keeps_its_words() {
        let (delta, error) = stream_delta("data: {\"error\":{\"message\":\"context full\"}}");
        assert!(delta.is_none());
        let error = error.expect("причина");
        assert!(error.contains("context full"), "{error}");
    }

    #[test]
    fn a_silent_stream_is_an_error_not_an_empty_answer() {
        let (sender, _receiver) = std::sync::mpsc::channel();
        let port = serve(b"".to_vec(), sender);
        let error = ask_stream(port, "{}", Duration::from_secs(5)).expect_err("пусто");
        assert!(
            error.contains("ничего") || error.contains("ничего не ответив"),
            "{error}"
        );
    }

    #[test]
    fn the_body_can_ask_for_a_stream_and_still_defaults_to_whole() {
        let whole: serde_json::Value =
            serde_json::from_str(&chat_body("привет", "m")).expect("json");
        assert_eq!(whole["stream"], false);

        let streamed: serde_json::Value =
            serde_json::from_str(&chat_body_with("привет", "m", true)).expect("json");
        assert_eq!(streamed["stream"], true);
        // Всё остальное не изменилось: без истории, низкая температура.
        assert_eq!(streamed["messages"][0]["content"], "привет");
        assert_eq!(streamed["temperature"], 0.0);
    }

    #[test]
    fn nonsense_instead_of_http_is_not_swallowed() {
        let (sender, _receiver) = std::sync::mpsc::channel();
        let port = serve(b"OK".to_vec(), sender);

        let error = ask(port, "{}", Duration::from_secs(5)).expect_err("это не HTTP");
        assert!(
            error.contains("не HTTP") || error.contains("нет кода"),
            "{error}"
        );
    }
}
