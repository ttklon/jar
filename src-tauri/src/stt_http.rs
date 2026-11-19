//! Small fail-closed response parser for the non-streaming local ASR endpoint.
//! No redirects, compression, chunked transfer or lossy UTF-8 conversion.
pub fn json_body(response: &[u8]) -> Result<&str, String> {
    let end = response.windows(4).position(|w| w == b"\r\n\r\n")
        .ok_or("ASR: HTTP-заголовок отсутствует или оборван")?;
    if end > 16 * 1024 { return Err("ASR: HTTP-заголовок превышает 16 КиБ".into()); }
    let header = std::str::from_utf8(&response[..end]).map_err(|_| "ASR: неверная кодировка HTTP-заголовка")?;
    let mut lines = header.split("\r\n");
    let status_line = lines.next().unwrap_or_default();
    if status_line.bytes().any(|b| b < 32 || b == 127) {
        return Err("ASR: недопустимые символы HTTP-статуса".into());
    }
    let mut status = status_line.splitn(3, ' ');
    if !matches!(status.next(), Some("HTTP/1.0" | "HTTP/1.1")) {
        return Err("ASR: неизвестный HTTP-протокол".into());
    }
    let code = status.next().unwrap_or_default();
    if code.len() != 3 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return Err("ASR: неверный HTTP-статус".into());
    }
    if code != "200" { return Err(format!("ASR: сервер вернул HTTP {code}; расшифровка не принята")); }
    let mut length = None;
    let mut content_type = false;
    for line in lines {
        let (name, value) = line.split_once(':').ok_or("ASR: повреждён HTTP-заголовок")?;
        if name.is_empty() || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b)) ||
            value.bytes().any(|b| b < 32 && b != b'\t' || b == 127) {
            return Err("ASR: недопустимые символы HTTP-заголовка".into());
        }
        let value = value.trim();
        if name.eq_ignore_ascii_case("content-length") {
            if length.is_some() || value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
                return Err("ASR: неоднозначный Content-Length".into());
            }
            length = Some(value.parse::<usize>().map_err(|_| "ASR: неверный Content-Length")?);
        }
        if name.eq_ignore_ascii_case("transfer-encoding") {
            return Err("ASR: потоковый Transfer-Encoding не поддерживается".into());
        }
        if name.eq_ignore_ascii_case("content-encoding") && !value.eq_ignore_ascii_case("identity") {
            return Err("ASR: сжатый ответ не поддерживается".into());
        }
        if name.eq_ignore_ascii_case("content-type") {
            if content_type || !value.split(';').next().unwrap_or_default().trim().eq_ignore_ascii_case("application/json") {
                return Err("ASR: ожидается единственный Content-Type application/json".into());
            }
            content_type = true;
        }
    }
    if !content_type { return Err("ASR: сервер не объявил JSON-ответ".into()); }
    let body = &response[end + 4..];
    if body.is_empty() || body.len() > 1024 * 1024 { return Err("ASR: пустой или слишком большой HTTP-ответ".into()); }
    if length.is_some_and(|length| length != body.len()) {
        return Err("ASR: HTTP-ответ оборван или длина не совпадает с Content-Length".into());
    }
    std::str::from_utf8(body).map_err(|_| "ASR: ответ содержит неверный UTF-8".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(headers: &str, body: &str) -> Vec<u8> {
        format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n{headers}\r\n{body}").into_bytes()
    }
    #[test]
    fn accepts_exact_length_or_explicit_connection_close_framing() {
        let json = r#"{"text":"привет"}"#;
        let framed = response(&format!("Content-Length: {}\r\n", json.len()), json);
        assert_eq!(json_body(&framed).unwrap(), json);
        let closed = response("Connection: close\r\n", json);
        assert_eq!(json_body(&closed).unwrap(), json);
    }
    #[test]
    fn rejects_error_status_even_when_body_looks_like_valid_recognition() {
        for code in ["301", "400", "401", "404", "429", "500", "503", "204"] {
            let raw = format!("HTTP/1.1 {code} Nope\r\nContent-Type: application/json\r\n\r\n{{\"text\":\"do something\"}}");
            assert!(json_body(raw.as_bytes()).unwrap_err().contains(code));
        }
    }
    #[test]
    fn rejects_truncated_extra_ambiguous_and_encoded_responses() {
        for headers in ["Content-Length: 1\r\n", "Content-Length: 999\r\n",
            "Content-Length: 2\r\nContent-Length: 2\r\n", "Content-Length: +2\r\n",
            "Transfer-Encoding: chunked\r\n", "Content-Encoding: gzip\r\n",
            "Content-Type: text/html\r\n", " Content-Length: 2\r\n", "Broken\r\n"] {
            assert!(json_body(&response(headers, "{}")).is_err(), "{headers}");
        }
        assert!(json_body(b"{\"text\":\"raw JSON without HTTP\"}").is_err());
        assert!(json_body(b"HTTP/1.1 200 OK\r\n\r\n{}").is_err());
        let mut invalid = response("", "{}"); invalid.push(255);
        assert!(json_body(&invalid).is_err());
    }
    #[test]
    fn rejects_invalid_protocol_status_and_control_characters() {
        for status in ["HTTP/2 200 OK", "HTTP/1.1 20 OK", "HTTP/1.1 200X OK",
            "HTTP/1.1 200 OK\nInjected", "HTTP/1.1 200 OK\tInjected"] {
            let raw = format!("{status}\r\nContent-Type: application/json\r\n\r\n{{}}");
            assert!(json_body(raw.as_bytes()).is_err(), "{status}");
        }
    }
    #[test]
    fn rejects_oversized_headers_and_incomplete_header_prefixes() {
        let huge = response(&format!("X-Large: {}\r\n", "x".repeat(17000)), "{}");
        assert!(json_body(&huge).is_err());
        let valid = response("", "{}");
        let end = valid.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
        for len in 0..end { assert!(json_body(&valid[..len]).is_err()); }
    }
}
