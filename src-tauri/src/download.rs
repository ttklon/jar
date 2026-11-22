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

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;

use crate::memory::Memory;
use crate::models;

/// Предел размера скачиваемой модели. Модель для первого разговора — около 1 ГБ;
/// лимит с запасом, но не «сколько угодно»: гигантский файл не качается.
pub const MAX_MODEL_BYTES: u64 = 16 * 1024 * 1024 * 1024;

/// Сколько места требовать, когда размер файла неизвестен.
///
/// Не «сколько нужно» — его не знает никто, — а запас, ниже которого
/// скачивание почти наверняка упадёт: 1 ГБ. Это не запрет для большого диска
/// (там места заведомо больше) и не гарантия для маленького (там отказ
/// случится сразу и по-честному).
pub const MIN_SPACE_WHEN_UNKNOWN: u64 = 1024 * 1024 * 1024;

/// Просьба отменить текущее скачивание. Один флаг на одно скачивание за раз:
/// интерфейс не запускает два скачивания одновременно, а второе без отмены
/// не начинается.
static CANCEL: AtomicBool = AtomicBool::new(false);
static ACTIVE: AtomicBool = AtomicBool::new(false);
static ACTIVE_NAME: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
pub fn active_name() -> Option<String> {
    ACTIVE_NAME.lock().ok().and_then(|name| name.clone())
}
pub(crate) fn set_name(name: &str) {
    if let Ok(mut current) = ACTIVE_NAME.lock() {
        *current = Some(name.to_string());
    }
}
#[cfg(test)]
pub(crate) static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
pub(crate) struct DownloadGuard;
impl Drop for DownloadGuard {
    fn drop(&mut self) {
        if let Ok(mut name) = ACTIVE_NAME.lock() {
            *name = None;
        }
        ACTIVE.store(false, Ordering::SeqCst);
    }
}
pub(crate) fn acquire() -> Result<DownloadGuard, String> {
    ACTIVE
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .map_err(|_| "другое скачивание уже идёт".to_string())?;
    clear_cancel();
    Ok(DownloadGuard)
}

/// Попросить отменить текущее скачивание. Процесс curl убивается, `.part` убирается.
pub fn request_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

/// Сбросить флаг отмены. Вызывается в начале каждого скачивания, чтобы отмена
/// прошлого не убила следующее.
pub fn clear_cancel() {
    CANCEL.store(false, Ordering::Relaxed);
}

/// Просили ли отменить текущее скачивание.
pub fn cancelled() -> bool {
    CANCEL.load(Ordering::Relaxed)
}

/// Проверяет, что на диске хватает места для `needed` байт. Если место узнать
/// не удалось (`free_space` вернул `None`), не блокируем: число с потолка
/// в интерфейсе опаснее пустоты.
pub fn check_free_space(dir: &Path, needed: u64) -> Result<(), String> {
    if let Some(free) = models::free_space(dir) {
        if free < needed {
            return Err(format!(
                "на диске мало места: нужно около {} МБ, свободно {} МБ",
                needed / 1024 / 1024,
                free / 1024 / 1024
            ));
        }
    }
    Ok(())
}

/// Сколько байт уже скачано в `<имя>.part` в папке `dir`. `None` — скачивания нет.
/// Интерфейс опрашивает это для прогресса: события Tauri ради прогресса не заводим.
pub fn progress(dir: &Path, name: &str) -> Option<u64> {
    let part = part_path(&dir.join(name));
    std::fs::metadata(part).ok().map(|meta| meta.len())
}

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
        "--proto".into(),
        "=http,https".into(),
        "--proto-redir".into(),
        "=https".into(),
        "--connect-timeout".into(),
        "30".into(),
        "--max-time".into(),
        "3600".into(),
        "--max-redirs".into(),
        "5".into(),
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
    if !crate::runtime::safe_relative(name) || name.contains(['/', '\\']) {
        return Err("имя файла не может быть путём".to_string());
    }
    let lower = name.to_lowercase();
    if lower.ends_with(".gguf") {
        return Ok(());
    }
    // Модель распознавания whisper — `ggml-*.bin`: ядро ищет её в папке моделей
    // именно по такому имени. Произвольный `.bin` не принимаем.
    if lower.ends_with(".bin") && lower.starts_with("ggml-") {
        return Ok(());
    }
    Err("ждём файл .gguf (модель разговора) или ggml-*.bin (модель распознавания)".to_string())
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

pub(crate) fn fetch(url: &str, part: &Path, max_bytes: u64) -> Result<(), String> {
    let mut child = Command::new("curl")
        .arg("--disable")
        .args(["--max-filesize", &max_bytes.to_string()])
        .args(curl_args(url, part))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("curl не запустился: {error}"))?;

    loop {
        let oversized = std::fs::metadata(part)
            .map(|m| m.len() > max_bytes)
            .unwrap_or(false);
        if oversized || cancelled() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(if oversized {
                "скачивание превысило лимит размера"
            } else {
                "скачивание отменено человеком"
            }
            .to_string());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stderr = String::new();
                if let Some(pipe) = child.stderr.take() {
                    let mut pipe = pipe;
                    let _ = pipe.read_to_string(&mut stderr);
                }
                if status.success() {
                    if cancelled() {
                        return Err("скачивание отменено человеком".into());
                    }
                    return Ok(());
                }
                let code = status.code().unwrap_or(-1);
                return Err(format!("curl вышел с кодом {code}: {}", stderr.trim()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(200)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("curl не дождался: {error}"));
            }
        }
    }
}

/// Скачивает `url` в `dir/name`, проверяет хеш и только потом делает файл видимым.
pub fn download(
    dir: &Path,
    name: &str,
    url: &str,
    expected: Option<&str>,
    memory: &Memory,
) -> Result<Downloaded, String> {
    download_sized(dir, name, url, expected, None, MAX_MODEL_BYTES, memory)
}

/// То же, что `download`, но с известным размером: место на диске проверяется
/// **до** скачивания, а файл больше лимита не качается. `expected_bytes` — `None`,
/// когда размер неизвестен (произвольная ссылка человека).
#[allow(clippy::too_many_arguments)]
pub fn download_sized(
    dir: &Path,
    name: &str,
    url: &str,
    expected: Option<&str>,
    expected_bytes: Option<u64>,
    max_bytes: u64,
    memory: &Memory,
) -> Result<Downloaded, String> {
    let _guard = acquire()?;
    check_name(name)?;
    set_name(name);
    check_url(url)?;
    if expected.is_some_and(|hash| !crate::readiness::sha256_well_formed(hash)) {
        return Err("эталон SHA-256 должен содержать 64 шестнадцатеричных символа; исправьте его до скачивания".into());
    }
    std::fs::create_dir_all(dir).map_err(|error| format!("папка моделей не создаётся: {error}"))?;

    if let Some(bytes) = expected_bytes {
        if bytes > max_bytes {
            return Err(format!(
                "файл больше лимита: {} МБ при пределе {} МБ",
                bytes / 1024 / 1024,
                max_bytes / 1024 / 1024
            ));
        }
        check_free_space(dir, bytes)?;
    } else {
        // Размер неизвестен (ссылка вставлена человеком, каталог не назвал
        // размер). Молчать нельзя: без проверки гигабайт качается в пустоту и
        // падает на середине — а «места не хватило» человек узнаёт только
        // тогда, когда диск уже заполнен мусором. Требуем не «сколько нужно»,
        // а нижнюю границу запаса: файл меньше этого почти наверняка, а если
        // больше — отказ случится на первом же блоке, а не на сороковом.
        check_free_space(dir, MIN_SPACE_WHEN_UNKNOWN)?;
    }

    let target = dir.join(name);
    if target.exists() {
        // Перезаписывать модель без спроса нельзя: это гигабайты и, возможно, единственная копия.
        return Err(format!(
            "файл уже есть: {name} — сверьте его хеш или удалите сами"
        ));
    }

    let part = part_path(&target);
    remove_stale_part(&part)?;

    let result = fetch(url, &part, max_bytes).and_then(|()| {
        let bytes = std::fs::metadata(&part).map_err(|e| e.to_string())?.len();
        if bytes > max_bytes || expected_bytes.is_some_and(|expected| expected != bytes) {
            return Err("размер скачанного файла не совпал с ожидаемым".into());
        }
        commit(&part, &target, name, expected, memory)
    });

    result.map_err(|error| cleanup_error(&part, error))
}

/// A failed cleanup is not a successful cancellation: keep the reason and recovery path.
pub(crate) fn cleanup_error(part: &Path, reason: String) -> String {
    match std::fs::remove_file(part) {
        Ok(()) => reason,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => reason,
        Err(error) => format!("{reason}; временный файл не убран: {} ({error}). Проверьте права и удалите только этот временный файл перед повтором", part.display()),
    }
}

pub(crate) fn remove_stale_part(part: &Path) -> Result<(), String> {
    match std::fs::remove_file(part) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "не удалось убрать старый временный файл {}: {error}; проверьте права перед повтором",
            part.display()
        )),
    }
}

/// Check cancellation between hash blocks, not only after hashing a multi-GB file.
pub(crate) fn sha256_cancellable(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    sha256_reader(file, cancelled)
}

fn sha256_reader(
    mut file: impl Read,
    mut is_cancelled: impl FnMut() -> bool,
) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        if is_cancelled() {
            return Err("скачивание отменено человеком".into());
        }
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
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

    if cancelled() {
        return Err("скачивание отменено человеком".into());
    }
    let actual = sha256_cancellable(part)?;
    if cancelled() {
        return Err("скачивание отменено человеком".into());
    }
    match expected {
        Some(expected) if !expected.eq_ignore_ascii_case(&actual) => {
            return Err(format!(
                "хеш не совпал: ожидали {expected}, получили {actual}"
            ));
        }
        _ => {}
    }

    // hard_link атомарно отказывает, если цель уже появилась: чужой файл не затираем.
    std::fs::hard_link(part, target).map_err(|error| format!("файл не опубликован: {error}"))?;
    std::fs::remove_file(part).map_err(|error| {
        format!("модель опубликована после проверки, но временный файл не убран: {error}")
    })?;

    memory
        .remember(&models::hash_key(name), &actual)
        .map_err(|error| {
            format!("модель опубликована после проверки, но хеш не записался: {error}")
        })?;

    Ok(Downloaded {
        name: name.to_string(),
        bytes,
        sha256: actual,
        verified: expected.is_some(),
    })
}

/// Проверка адреса заголовками: что сервер отвечает, не скачивая файл.
///
/// Живёт рядом с `fetch`, потому что это та же дверь в сеть: процессы `curl`
/// в приложении запускаются только здесь. Возвращает код выхода, stdout и
/// stderr — разбор ответа делает `readiness::parse_probe`, чтобы он проверялся
/// тестами без сети.
pub(crate) fn head(url: &str) -> (Option<i32>, String, String) {
    let result = Command::new("curl").args(probe_args(url)).output();
    match result {
        Ok(output) => (
            output.status.code(),
            String::from_utf8_lossy(&output.stdout).to_string(),
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ),
        Err(error) => (None, String::new(), format!("curl не запустился: {error}")),
    }
}

/// Команда `curl` для проверки адреса без скачивания файла.
///
/// `--head` не скачивает тело: проверка стоит несколько байт трафика, а не
/// гигабайт. Именно поэтому её можно делать перед кнопкой, а не после.
pub fn probe_args(url: &str) -> Vec<String> {
    vec![
        "--proto".into(),
        "=http,https".into(),
        "--proto-redir".into(),
        "=https".into(),
        "--connect-timeout".into(),
        "20".into(),
        "--max-time".into(),
        "60".into(),
        "--max-redirs".into(),
        "5".into(),
        "--location".into(),
        "--silent".into(),
        "--show-error".into(),
        "--head".into(),
        "--write-out".into(),
        "ZSHELPER-CODE %{http_code}\n".into(),
        url.into(),
    ]
}

#[cfg(test)]
mod probe_args_tests {
    use super::*;

    #[test]
    fn the_probe_asks_for_headers_only_and_never_writes_a_file() {
        let args = probe_args("https://huggingface.co/x.gguf");
        assert!(
            args.iter().any(|a| a == "--head"),
            "только заголовки, без тела"
        );
        assert!(
            !args.iter().any(|a| a == "-o" || a == "--output"),
            "ничего не сохраняем на диск"
        );
        assert!(args.iter().any(|a| a == "--proto-redir"));
        assert_eq!(
            args.last().map(String::as_str),
            Some("https://huggingface.co/x.gguf")
        );
    }
}

#[cfg(test)]
mod space_tests {
    use super::*;

    /// Шаг 347: место проверяется ДО скачивания, а не после.
    ///
    /// Проверка нарочно просит больше, чем есть на любом диске: тест не должен
    /// зависеть от свободного места на машине, где его гоняют.
    #[test]
    fn the_size_is_checked_before_a_single_byte_is_downloaded() {
        let dir = std::env::temp_dir();
        let impossible = u64::MAX / 2;
        match models::free_space(&dir) {
            Some(_) => {
                let refused = check_free_space(&dir, impossible);
                assert!(refused.is_err(), "место должно проверяться до скачивания");
                let text = refused.unwrap_err();
                // Числом, а не «недостаточно места»: человеку нужно понять,
                // сколько освободить.
                assert!(text.contains("МБ"), "причина с числами: {text}");
            }
            // Не-Windows: свободное место не спрашивается, и функция честно
            // молчит, а не притворяется, что места хватает.
            None => assert!(check_free_space(&dir, impossible).is_ok()),
        }
    }

    #[test]
    fn a_small_request_passes_on_a_real_disk() {
        let dir = std::env::temp_dir();
        // Один байт свободен на любом диске, где вообще есть место под
        // временные файлы этого теста.
        assert!(check_free_space(&dir, 1).is_ok());
    }

    /// Запас для неизвестного размера — гигабайт, и это не «на глаз».
    ///
    /// Сравнение константы с самой собой (`assert_eq!(K, 1024³)`) clippy
    /// справедливо не пропускает: оно ничего не проверяет, кроме того, что
    /// я дважды написал одно число. Проверяем смысл: запас — это гигабайт,
    /// а не мегабайт и не десять, и он меньше предела размера.
    #[test]
    fn the_unknown_size_reserve_is_one_gigabyte_of_real_expectations() {
        const GB: u64 = 1024 * 1024 * 1024;
        // Отказ на первом байте — это про «гигабайт», а не «на всяческий».
        assert!(MIN_SPACE_WHEN_UNKNOWN >= GB, "не меньше гигабайта");
        assert!(MIN_SPACE_WHEN_UNKNOWN < 4 * GB, "и не запас на фильм");
        assert!(
            MIN_SPACE_WHEN_UNKNOWN < MAX_MODEL_BYTES,
            "запас меньше предела: иначе неизвестный размер запрещал бы всё"
        );
    }
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
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
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
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
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
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
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
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
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
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
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
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = temp_dir("checks");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");

        for name in [
            "../escape.gguf",
            "sub/model.gguf",
            "model.bin",
            "ggml-evil.exe",
            "CON.gguf",
            "LPT1.gguf",
            "m:ads.gguf",
            "",
        ] {
            let error = download(&dir, name, "https://example.com/m.gguf", None, &memory)
                .expect_err("такое имя не годится");
            assert!(
                error.contains("имя файла") || error.contains(".gguf"),
                "{error}"
            );
        }

        // Модель распознавания — законное имя: pinned ggml-base.bin проходит
        // проверку имени и отклоняется уже на ссылке, без сети. Повторный
        // TEST_LOCK здесь нельзя: Mutex не реентерабельный, внешний захват
        // ещё жив, и второй lock вешает весь `cargo test`.
        let error = download(&dir, "ggml-base.bin", "not-a-url", None, &memory)
            .expect_err("имя годится, ссылка нет");
        assert!(
            error.contains("ссылка"),
            "ggml-*.bin — допустимое имя, отказ только по ссылке: {error}"
        );
        assert!(
            !error.contains(".gguf"),
            "законное имя не должно отвергаться как не-.gguf: {error}"
        );

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

    #[test]
    fn oversized_file_is_refused_before_network() {
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = temp_dir("oversize");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");

        let error = download_sized(
            &dir,
            "model.gguf",
            "https://example.com/m.gguf",
            None,
            Some(MAX_MODEL_BYTES + 1),
            MAX_MODEL_BYTES,
            &memory,
        )
        .expect_err("файл больше лимита");
        assert!(error.contains("больше лимита"), "{error}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn progress_reads_the_part_file() {
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = temp_dir("progress");
        assert!(progress(&dir, "model.gguf").is_none(), "скачивания нет");

        let part = part_path(&dir.join("model.gguf"));
        std::fs::write(&part, b"12345").expect("part пишется");
        assert_eq!(progress(&dir, "model.gguf"), Some(5));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cancel_flag_round_trips() {
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear_cancel();
        assert!(!cancelled());
        request_cancel();
        assert!(cancelled());
        clear_cancel();
        assert!(!cancelled());
    }
    #[test]
    fn expected_size_mismatch_removes_partial() {
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = temp_dir("wrong-size");
        let memory = Memory::open(dir.join("memory.db")).expect("memory");
        let url = serve(b"small".to_vec(), None);
        let result = download_sized(&dir, "m.gguf", &url, None, Some(10), 100, &memory);
        assert!(result.unwrap_err().contains("размер"));
        assert!(!dir.join("m.gguf").exists());
        assert!(!dir.join("m.gguf.part").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn commit_does_not_overwrite_existing_target() {
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = temp_dir("no-clobber");
        let memory = Memory::open(dir.join("memory.db")).expect("memory");
        let part = dir.join("m.gguf.part");
        let target = dir.join("m.gguf");
        std::fs::write(&part, b"download").unwrap();
        std::fs::write(&target, b"user data").unwrap();
        assert!(commit(&part, &target, "m.gguf", None, &memory).is_err());
        assert_eq!(std::fs::read(target).unwrap(), b"user data");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn hashing_can_be_cancelled_between_blocks() {
        let mut data = std::io::Cursor::new(vec![7u8; 1024 * 1024]);
        let mut checks = 0;
        let error = sha256_reader(&mut data, || {
            checks += 1;
            checks >= 3
        })
        .unwrap_err();
        assert!(error.contains("отменено"));
        assert_eq!(data.position(), 2 * 65536);
    }

    #[test]
    fn hashing_without_cancellation_matches_sha256() {
        assert_eq!(
            sha256_reader(std::io::Cursor::new(b"abc"), || false).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn cleanup_failure_retains_error_and_recovery_path() {
        let dir = temp_dir("cleanup-error");
        let not_a_file = dir.join("blocked.part");
        std::fs::create_dir(&not_a_file).unwrap();
        let message = cleanup_error(&not_a_file, "скачивание отменено человеком".into());
        assert!(message.contains("временный файл не убран"));
        assert!(message.contains("blocked.part"));
        assert!(remove_stale_part(&not_a_file).is_err());
        assert!(not_a_file.is_dir());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn malformed_hash_is_rejected_without_network_or_partial_file() {
        let _test_guard = TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = temp_dir("malformed-hash");
        let memory = Memory::open(dir.join("memory.db")).unwrap();
        let error = download(
            &dir,
            "m.gguf",
            "https://example.com/m.gguf",
            Some("bad hash"),
            &memory,
        )
        .unwrap_err();
        assert!(error.contains("64 шестнадцатеричных"));
        assert!(!dir.join("m.gguf.part").exists());
        assert!(active_name().is_none());
        drop(memory);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
