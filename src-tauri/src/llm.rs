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
use std::net::{TcpStream, ToSocketAddrs};
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
    let body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.0,
        "max_tokens": 400,
        "stream": false,
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

/// Один POST на петлю. Ошибки говорят, на каком шаге всё встало.
pub fn post(port: u16, path: &str, body: &str, timeout: Duration) -> Result<String, String> {
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
        return Err(format!(
            "движок ответил {status}: {}",
            snippet(text.trim())
        ));
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
    let parsed: serde_json::Value = serde_json::from_str(json)
        .map_err(|error| format!("движок ответил не JSON: {error}"))?;

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
        .ok_or_else(|| format!("в ответе нет поля choices[0].message.content: {}", snippet(json)))?;

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

        assert!(text.starts_with("POST /v1/chat/completions HTTP/1.1\r\n"), "{text}");
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

        let text = ask(port, &chat_body("заплати", "m.gguf"), Duration::from_secs(5))
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
    fn nonsense_instead_of_http_is_not_swallowed() {
        let (sender, _receiver) = std::sync::mpsc::channel();
        let port = serve(b"OK".to_vec(), sender);

        let error = ask(port, "{}", Duration::from_secs(5)).expect_err("это не HTTP");
        assert!(error.contains("не HTTP") || error.contains("нет кода"), "{error}");
    }
}
