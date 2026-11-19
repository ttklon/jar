//! Скачивание файла модели: `.part` → sha256 → переименование.
//!
//! Качает системный `curl.exe` (он входит в Windows 10 и новее), а не библиотека в
//! бинарнике: TLS, прокси, редиректы и докачка уже отлажены в нём, а нам остаётся то,
//! что действительно наше — порядок шагов и проверка хеша.
//!
//! Порядок намеренно жёсткий:
//! 1. качаем в `<имя>.part`, а не в настоящий файл — недокачанная модель не должна
//!    выглядеть моделью;
//! 2. считаем sha256 и, если эталон задан, сравниваем;
//! 3. только после этого переименовываем и запоминаем хеш.
//!
//! Любая ошибка удаляет `.part`: мусор в папке моделей — это ложь на экране.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::memory::Memory;
use crate::models;

/// Что получилось.
#[derive(Debug, Serialize)]
pub struct Downloaded {
    pub name: String,
    pub bytes: u64,
    pub sha256: String,
    /// Эталон был задан и совпал. `false` — эталона не было, записан посчитанный хеш.
    pub verified: bool,
}

/// `<имя>.part` рядом с целевым файлом: переименование в пределах одной папки —
/// атомарная операция, а «скачать в temp и перенести» атомарным уже не будет.
pub fn part_path(target: &Path) -> PathBuf {
    let mut name = target.file_name().unwrap_or_default().to_os_string();
    name.push(".part");
    target.with_file_name(name)
}

/// Аргументы curl.
///
/// `--fail` обязателен: без него ответ 404 записывается как «успешный» файл с HTML
/// внутри. `--location` нужен, потому что HuggingFace отдаёт редирект на CDN.
pub fn curl_args(url: &str, part: &Path) -> Vec<String> {
    vec![
        "--fail".to_string(),
        "--location".to_string(),
        "--silent".to_string(),
        "--show-error".to_string(),
        "--output".to_string(),
        part.display().to_string(),
        url.to_string(),
    ]
}

/// Имя файла, а не путь: папку выбирает приложение, и выйти из неё запросом нельзя.
fn check_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains(['/', '\\']) || name.contains("..") {
        return Err("имя файла не может быть путём".to_string());
    }
    if !name.to_lowercase().ends_with(".gguf") {
        return Err("ждём файл .gguf: другие расширения папка моделей не показывает".to_string());
    }
    Ok(())
}

/// Разрешены только http(s): file:// и ftp:// — это уже не «скачать по ссылке».
fn check_url(url: &str) -> Result<(), String> {
    let rest = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"));
    match rest {
        Some(host) if !host.is_empty() && !host.starts_with('/') => Ok(()),
        _ => Err("нужна ссылка http(s):// с адресом".to_string()),
    }
}

fn fetch(url: &str, part: &Path) -> Result<(), String> {
    let output = Command::new("curl")
        .args(curl_args(url, part))
        .output()
        .map_err(|error| format!("curl не запустился: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let code = output.status.code().unwrap_or(-1);
        return Err(format!("curl вышел с кодом {code}: {}", stderr.trim()));
    }

    Ok(())
}

/// Скачивает `url` в `dir/name`, проверяет хеш и только потом делает файл видимым.
pub fn download(
    dir: &Path,
    name: &str,
    url: &str,
    expected: Option<&str>,
    memory: &Memory,
) -> Result<Downloaded, String> {
    check_name(name)?;
    check_url(url)?;
    std::fs::create_dir_all(dir).map_err(|error| format!("папка моделей не создаётся: {error}"))?;

    let target = dir.join(name);
    if target.exists() {
        // Перезаписывать модель без спроса нельзя: это гигабайты и, возможно, единственная копия.
        return Err(format!(
            "файл уже есть: {name} — сверьте его хеш или удалите сами"
        ));
    }

    let part = part_path(&target);
    let _ = std::fs::remove_file(&part);

    let result = fetch(url, &part).and_then(|()| commit(&part, &target, name, expected, memory));

    if result.is_err() {
        let _ = std::fs::remove_file(&part);
    }

    result
}

fn commit(
    part: &Path,
    target: &Path,
    name: &str,
    expected: Option<&str>,
    memory: &Memory,
) -> Result<Downloaded, String> {
    let bytes = std::fs::metadata(part)
        .map_err(|error| format!("файл не скачался: {error}"))?
        .len();
    if bytes == 0 {
        return Err("скачался пустой файл".to_string());
    }

    let actual = models::sha256_file(part)?;
    match expected {
        Some(expected) if !expected.eq_ignore_ascii_case(&actual) => {
            return Err(format!(
                "хеш не совпал: ожидали {expected}, получили {actual}"
            ));
        }
        _ => {}
    }

    if target.exists() {
        std::fs::remove_file(target)
            .map_err(|error| format!("старый файл не удаляется: {error}"))?;
    }
    std::fs::rename(part, target).map_err(|error| format!("файл не переименован: {error}"))?;

    memory
        .remember(&models::hash_key(name), &actual)
        .map_err(|error| format!("хеш не записался: {error}"))?;

    Ok(Downloaded {
        name: name.to_string(),
        bytes,
        sha256: actual,
        verified: expected.is_some(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zshelper-download-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("временная папка создаётся");
        dir
    }

    /// Поднимает одноразовый HTTP-сервер и отдаёт ссылку на него.
    /// Так тест проверяет настоящий curl, а не заглушку вокруг него.
    fn serve(payload: Vec<u8>, declared_len: Option<usize>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("порт открывается");
        let port = listener.local_addr().expect("адрес известен").port();
        let length = declared_len.unwrap_or(payload.len());

        thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut headers = [0u8; 2048];
                let _ = stream.read(&mut headers);
                let head = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n"
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&payload);
            }
        });

        format!("http://127.0.0.1:{port}/model.gguf")
    }

    fn sha(text: &[u8]) -> String {
        // Тот же путь, что в бою: хеш считается по файлу.
        let dir = temp_dir("sha");
        let path = dir.join("payload.bin");
        std::fs::write(&path, text).expect("файл пишется");
        let hash = models::sha256_file(&path).expect("хеш считается");
        let _ = std::fs::remove_dir_all(&dir);
        hash
    }

    #[test]
    fn downloads_and_remembers_the_hash() {
        let dir = temp_dir("ok");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        let payload = b"GGUF payload".to_vec();
        let url = serve(payload.clone(), None);

        let done = download(&dir, "model.gguf", &url, None, &memory).expect("скачивание идёт");

        assert_eq!(done.bytes, payload.len() as u64);
        assert!(!done.verified, "эталона не было — так и говорим");
        assert!(dir.join("model.gguf").is_file());
        assert!(!part_path(&dir.join("model.gguf")).exists(), ".part убран");
        assert_eq!(
            memory.fact(&models::hash_key("model.gguf")),
            Some(done.sha256)
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn matching_expected_hash_is_reported_as_verified() {
        let dir = temp_dir("verified");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        let payload = b"GGUF with hash".to_vec();
        let url = serve(payload.clone(), None);

        let done = download(&dir, "model.gguf", &url, Some(&sha(&payload)), &memory)
            .expect("скачивание идёт");
        assert!(done.verified);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn wrong_hash_leaves_no_file_at_all() {
        let dir = temp_dir("badhash");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        let url = serve(b"real payload".to_vec(), None);

        let error = download(&dir, "model.gguf", &url, Some(&"0".repeat(64)), &memory)
            .expect_err("хеш не сойдётся");
        assert!(error.contains("хеш не совпал"), "{error}");
        assert!(
            !dir.join("model.gguf").exists(),
            "битый файл не стал моделью"
        );
        assert!(
            !part_path(&dir.join("model.gguf")).exists(),
            "и .part убран"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn truncated_download_is_an_error_not_a_model() {
        let dir = temp_dir("truncated");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        // Сервер обещает больше, чем отдаёт: curl выходит с ошибкой 18.
        let url = serve(b"short".to_vec(), Some(1024));

        let error =
            download(&dir, "model.gguf", &url, None, &memory).expect_err("файл недокачался");
        assert!(error.contains("curl"), "ошибка называет виновника: {error}");
        assert!(!dir.join("model.gguf").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn existing_file_is_never_overwritten() {
        let dir = temp_dir("exists");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        std::fs::write(dir.join("model.gguf"), b"mine").expect("файл пишется");
        let url = serve(b"other".to_vec(), None);

        let error = download(&dir, "model.gguf", &url, None, &memory).expect_err("файл на месте");
        assert!(error.contains("файл уже есть"), "{error}");
        assert_eq!(
            std::fs::read(dir.join("model.gguf")).expect("файл читается"),
            b"mine",
            "старый файл не тронут"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn names_and_schemes_are_checked_before_network() {
        let dir = temp_dir("checks");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");

        for name in ["../escape.gguf", "sub/model.gguf", "model.bin", ""] {
            let error = download(&dir, name, "https://example.com/m.gguf", None, &memory)
                .expect_err("такое имя не годится");
            assert!(
                error.contains("имя файла") || error.contains(".gguf"),
                "{error}"
            );
        }

        for url in [
            "file:///etc/passwd",
            "ftp://example.com/m.gguf",
            "https://",
            "example.com",
        ] {
            let error = download(&dir, "model.gguf", url, None, &memory)
                .expect_err("такая ссылка не годится");
            assert!(error.contains("ссылка"), "{error}");
        }

        let _ = std::fs::remove_dir_all(&dir);
    }
}
