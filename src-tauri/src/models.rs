//! Что за модели лежат на диске и годятся ли они для запуска.
//!
//! Менеджер моделей начинается не со скачивания, а с честного взгляда на папку: файл
//! `.gguf` человек может положить сам, и приложение обязано его увидеть, а не делать
//! вид, что моделей нет. Здесь только чтение заголовка GGUF: версия, квантование,
//! архитектура, число тензоров. Скачивание, проверка sha256 и запуск `llama-server` —
//! следующие шаги, и до них интерфейс не имеет права обещать «модель готова».
//!
//! Формат GGUF (v2/v3): `magic "GGUF"`, `version u32`, `tensor_count u64`,
//! `metadata_kv_count u64`, затем пары «ключ-значение». Строки — `len u64` + байты,
//! массивы — `тип u32`, `len u64`, элементы. Заголовок читается потоком до нужных
//! ключей, поэтому миллион мегабайт в память не тянем.

use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::memory::Memory;

/// Сколько байт файла читаем для разбора. Метаданные GGUF обычно десятки килобайт;
/// держать в памяти начало в мегабайт достаточно и для больших словарей.
const HEADER_BYTES: u64 = 1024 * 1024;

const MAGIC: &[u8; 4] = b"GGUF";

/// Один файл в папке моделей. `ok` — не «модель работает», а «файл похож на GGUF».
#[derive(Debug, Clone, Serialize)]
pub struct ModelFile {
    /// Только имя файла: полный путь в интерфейсе не нужен.
    pub name: String,
    pub size_bytes: u64,
    /// Заголовок прочитан и версия поддерживается.
    pub ok: bool,
    /// Человеческая причина, если файл не годится (или краткая сводка, если годится).
    pub note: String,
    pub version: Option<u32>,
    pub tensors: Option<u64>,
    pub architecture: Option<String>,
    /// Квантование из `general.file_type`, например `Q4_K_M`.
    pub quant: Option<String>,
    /// Известный хеш файла из памяти (заполняет IPC, а не `scan`: чтение папки не
    /// должно ничего знать про память).
    pub hash: Option<String>,
}

/// Ключ факта с известным хешем файла. Имя файла, а не полный путь: папку моделей
/// пользователь может перенести, и тогда «файл другой» было бы ложью.
pub fn hash_key(name: &str) -> String {
    format!("model.sha256:{name}")
}

/// Считает sha256 потоком по 64 КиБ: модель на много гигабайт не должна целиком
/// попадать в память, иначе проверка станет причиной её отсутствия.
pub fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("файл не открывается: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("файл не читается: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Что показала сверка хеша.
#[derive(Debug, Serialize)]
pub struct HashCheck {
    pub name: String,
    pub actual: String,
    /// Хеш, который был известен до этой сверки (если был).
    pub previous: Option<String>,
    /// `first` — хеш записан впервые, `same` — совпал, `changed` — файл другой.
    pub verdict: &'static str,
}

/// Сверяет файл с известным хешем и запоминает новый.
///
/// Это не «защита от подмены»: манифеста с эталонными хешами пока нет. Это проверка
/// «файл тот же, что и в прошлый раз» — она ловит битую докачку и подмену файла, но
/// не подменяет собой проверку по манифесту, которая появится вместе со скачиванием.
pub fn verify(dir: &Path, name: &str, memory: &Memory) -> Result<HashCheck, String> {
    check_file_name(name)?;

    let path = dir.join(name);
    if !path.is_file() {
        return Err(format!("файла нет: {name}"));
    }

    let actual = sha256_file(&path)?;
    let previous = memory.fact(&hash_key(name));
    let verdict = match previous.as_deref() {
        None => "first",
        Some(known) if known == actual => "same",
        Some(_) => "changed",
    };

    // Записываем всегда: память обязана отражать то, что лежит на диске сейчас.
    // «Было иначе» видно по `verdict` и `previous` — это ответ на сверку, а не история.
    memory
        .remember(&hash_key(name), &actual)
        .map_err(|error| format!("хеш не записался: {error}"))?;

    Ok(HashCheck {
        name: name.to_string(),
        actual,
        previous,
        verdict,
    })
}

/// Имя файла, а не путь: папку выбирает приложение, и запросом из неё не выйти.
fn check_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains(['/', '\\']) || name.contains("..") {
        return Err("имя файла не может быть путём".to_string());
    }
    Ok(())
}

/// Удаляет файл модели. Действие необратимое, поэтому подтверждение спрашивает
/// интерфейс, а не этот код: здесь только «сделать», если человек уже сказал «да».
pub fn remove(dir: &Path, name: &str, memory: &Memory) -> Result<(), String> {
    check_file_name(name)?;

    let path = dir.join(name);
    if !path.is_file() {
        return Err(format!("файла нет: {name}"));
    }

    std::fs::remove_file(&path).map_err(|error| format!("файл не удаляется: {error}"))?;

    // Память не должна помнить хеш файла, которого больше нет.
    memory
        .forget(&hash_key(name))
        .map_err(|error| format!("память не обновилась: {error}"))
}

/// Сколько всего занимают модели в папке.
pub fn total_bytes(items: &[ModelFile]) -> u64 {
    items.iter().map(|item| item.size_bytes).sum()
}

/// Свободное место на диске, где лежит папка моделей.
///
/// На не-Windows — `None`: число, взятое с потолка, в интерфейсе опаснее пустоты.
/// Папки может ещё не быть, поэтому диск определяется по корню пути, а не по файлу.
#[cfg(windows)]
pub fn free_space(dir: &Path) -> Option<u64> {
    let path = dir.display().to_string().replace('\'', "''");
    let script = format!(
        "$root = [System.IO.Path]::GetPathRoot('{path}');\
         $disk = Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='$root'\";\
         Write-Output $disk.FreeSpace"
    );

    let output = std::process::Command::new("powershell.exe")
        .args(crate::executor::powershell(&script))
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout).trim().parse().ok()
}

#[cfg(not(windows))]
pub fn free_space(_dir: &Path) -> Option<u64> {
    None
}

/// Разобранный заголовок: только то, что показывается человеку.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Header {
    pub version: u32,
    pub tensors: u64,
    pub architecture: Option<String>,
    pub quant: Option<String>,
}

/// Папка моделей: рядом с журналом и памятью, но с возможностью указать свою.
/// Модели весят гигабайты, и держать их на системном диске не всегда разумно.
pub fn dir(base: &Path) -> PathBuf {
    match std::env::var_os("ZSHELPER_MODELS_DIR") {
        Some(path) => PathBuf::from(path),
        None => base.join("models"),
    }
}

/// Все `.gguf` в папке, по имени. Ошибки чтения папки не скрываются: пустой список
/// и «папки нет» — разные вещи, и интерфейс должен их различать.
pub fn scan(dir: &Path) -> Result<Vec<ModelFile>, String> {
    if !dir.is_dir() {
        let path = dir.display();
        return Err(format!("папки моделей нет: {path}"));
    }

    let mut files: Vec<ModelFile> = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|error| format!("не читается папка: {error}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !is_gguf(&path) {
            continue;
        }
        files.push(inspect(&path));
    }

    files.sort_by_key(|file| file.name.clone());
    Ok(files)
}

fn is_gguf(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("gguf"))
}

fn inspect(path: &Path) -> ModelFile {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("(без имени)")
        .to_string();
    let size_bytes = std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);

    let mut file = ModelFile {
        name,
        size_bytes,
        ok: false,
        note: String::new(),
        version: None,
        tensors: None,
        architecture: None,
        quant: None,
        hash: None,
    };

    match read_prefix(path) {
        Err(error) => file.note = format!("файл не читается: {error}"),
        Ok(bytes) => match parse(&bytes) {
            Err(error) => file.note = error,
            Ok(header) => {
                file.ok = true;
                file.version = Some(header.version);
                file.tensors = Some(header.tensors);
                file.architecture = header.architecture;
                file.quant = header.quant;
                file.note = "заголовок GGUF прочитан".to_string();
            }
        },
    }

    file
}

fn read_prefix(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut file = File::open(path)?;
    let mut bytes = Vec::new();
    file.by_ref().take(HEADER_BYTES).read_to_end(&mut bytes)?;
    Ok(bytes)
}

/// Читает заголовок GGUF. Ошибка — человеческая строка: она попадает в интерфейс.
pub fn parse(bytes: &[u8]) -> Result<Header, String> {
    if bytes.len() < 4 || &bytes[0..4] != MAGIC {
        return Err("это не GGUF: файл начинается не с «GGUF»".to_string());
    }

    let mut reader = Reader { bytes, pos: 4 };
    let version = reader.u32()?;
    if !(2..=3).contains(&version) {
        return Err(format!("версия GGUF {version} не поддерживается"));
    }

    let tensors = reader.u64()?;
    let metadata = reader.u64()?;

    let mut header = Header {
        version,
        tensors,
        ..Header::default()
    };

    for _ in 0..metadata {
        let key = reader.string()?;
        let kind = reader.u32()?;

        match (key.as_str(), kind) {
            ("general.architecture", KIND_STRING) => header.architecture = Some(reader.string()?),
            ("general.file_type", KIND_U32) => header.quant = Some(quant_name(reader.u32()?)),
            _ => reader.skip(kind)?,
        }
    }

    Ok(header)
}

const KIND_U32: u32 = 4;
const KIND_STRING: u32 = 8;
const KIND_ARRAY: u32 = 9;

struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Reader<'_> {
    fn take(&mut self, count: usize) -> Result<&[u8], String> {
        let end = self.pos.checked_add(count).ok_or("заголовок испорчен")?;
        if end > self.bytes.len() {
            return Err("заголовок обрывается: файл короче, чем говорит GGUF".to_string());
        }
        let slice = &self.bytes[self.pos..end];
        self.pos = end;
        Ok(slice)
    }

    fn u32(&mut self) -> Result<u32, String> {
        let bytes: [u8; 4] = self.take(4)?.try_into().map_err(|_| "нет u32")?;
        Ok(u32::from_le_bytes(bytes))
    }

    fn u64(&mut self) -> Result<u64, String> {
        let bytes: [u8; 8] = self.take(8)?.try_into().map_err(|_| "нет u64")?;
        Ok(u64::from_le_bytes(bytes))
    }

    fn string(&mut self) -> Result<String, String> {
        let len = self.u64()?.min(self.bytes.len() as u64) as usize;
        let raw = self.take(len)?;
        Ok(String::from_utf8_lossy(raw).into_owned())
    }

    /// Пропускает значение любого типа: читать чужие метаданные целиком незачем,
    /// но пройти мимо них, чтобы добраться до нужного ключа, придётся.
    fn skip(&mut self, kind: u32) -> Result<(), String> {
        let size = match kind {
            0 | 1 | 7 => 1,
            2..=3 => 2,
            4..=6 => 4,
            10..=12 => 8,
            KIND_STRING => {
                let len = self.u64()?;
                self.take(len.min(self.bytes.len() as u64) as usize)?;
                return Ok(());
            }
            KIND_ARRAY => {
                let item = self.u32()?;
                let count = self.u64()?;
                for _ in 0..count {
                    self.skip(item)?;
                }
                return Ok(());
            }
            other => return Err(format!("неизвестный тип метаданных {other}")),
        };
        self.take(size)?;
        Ok(())
    }
}

/// `general.file_type` — число, а человеку нужно слово.
fn quant_name(file_type: u32) -> String {
    let name = match file_type {
        0 => "F32",
        1 => "F16",
        2 => "Q4_0",
        3 => "Q4_1",
        7 => "Q8_0",
        8 => "Q5_0",
        9 => "Q5_1",
        10 => "Q2_K",
        11 => "Q3_K_S",
        12 => "Q3_K_M",
        13 => "Q3_K_L",
        14 => "Q4_K_S",
        15 => "Q4_K_M",
        16 => "Q5_K_S",
        17 => "Q5_K_M",
        18 => "Q6_K",
        28 => "BF16",
        other => return format!("file_type {other}"),
    };
    name.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Собирает минимальный GGUF v3 с двумя ключами метаданных.
    fn gguf(architecture: &str, file_type: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.extend_from_slice(&3u32.to_le_bytes());
        bytes.extend_from_slice(&291u64.to_le_bytes()); // тензоров
        bytes.extend_from_slice(&2u64.to_le_bytes()); // ключей

        push_string(&mut bytes, "general.architecture");
        bytes.extend_from_slice(&KIND_STRING.to_le_bytes());
        push_string(&mut bytes, architecture);

        push_string(&mut bytes, "general.file_type");
        bytes.extend_from_slice(&KIND_U32.to_le_bytes());
        bytes.extend_from_slice(&file_type.to_le_bytes());
        bytes
    }

    fn push_string(bytes: &mut Vec<u8>, text: &str) {
        bytes.extend_from_slice(&(text.len() as u64).to_le_bytes());
        bytes.extend_from_slice(text.as_bytes());
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zshelper-models-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("временная папка создаётся");
        dir
    }

    #[test]
    fn reads_architecture_and_quantisation() {
        let header = parse(&gguf("llama", 15)).expect("заголовок разбирается");
        assert_eq!(header.version, 3);
        assert_eq!(header.tensors, 291);
        assert_eq!(header.architecture.as_deref(), Some("llama"));
        assert_eq!(header.quant.as_deref(), Some("Q4_K_M"));
    }

    #[test]
    fn foreign_file_is_named_as_foreign() {
        let error = parse(b"hello world").expect_err("это не GGUF");
        assert!(
            error.contains("GGUF"),
            "сообщение объясняет причину: {error}"
        );
    }

    #[test]
    fn truncated_header_does_not_panic() {
        let mut bytes = gguf("llama", 15);
        bytes.truncate(bytes.len() - 3);
        let error = parse(&bytes).expect_err("обрезанный файл не разбирается");
        assert!(error.contains("обрывается"));
    }

    #[test]
    fn unsupported_version_is_reported() {
        let mut bytes = gguf("llama", 15);
        bytes[4..8].copy_from_slice(&1u32.to_le_bytes());
        let error = parse(&bytes).expect_err("версия 1 не поддерживается");
        assert!(error.contains("версия"));
    }

    #[test]
    fn unknown_metadata_types_are_skipped() {
        // Массив из трёх u32 между заголовком и нужным ключом.
        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.extend_from_slice(&2u32.to_le_bytes());
        bytes.extend_from_slice(&1u64.to_le_bytes());
        bytes.extend_from_slice(&2u64.to_le_bytes());
        push_string(&mut bytes, "tokenizer.ggml.tokens");
        bytes.extend_from_slice(&KIND_ARRAY.to_le_bytes());
        bytes.extend_from_slice(&KIND_U32.to_le_bytes());
        bytes.extend_from_slice(&3u64.to_le_bytes());
        for value in [1u32, 2, 3] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        push_string(&mut bytes, "general.file_type");
        bytes.extend_from_slice(&KIND_U32.to_le_bytes());
        bytes.extend_from_slice(&2u32.to_le_bytes());

        let header = parse(&bytes).expect("массив пропускается");
        assert_eq!(header.quant.as_deref(), Some("Q4_0"));
    }

    #[test]
    fn scan_lists_only_gguf_and_sorts_by_name() {
        let dir = temp_dir("scan");
        std::fs::write(dir.join("b-model.gguf"), gguf("llama", 7)).expect("файл пишется");
        std::fs::write(dir.join("a-model.GGUF"), gguf("qwen2", 15)).expect("файл пишется");
        std::fs::write(dir.join("readme.txt"), "не модель").expect("файл пишется");
        std::fs::write(dir.join("broken.gguf"), b"not a gguf at all").expect("файл пишется");

        let files = scan(&dir).expect("папка читается");
        let names: Vec<&str> = files.iter().map(|file| file.name.as_str()).collect();
        assert_eq!(names, ["a-model.GGUF", "b-model.gguf", "broken.gguf"]);

        assert!(
            files[0].ok,
            "GGUF в верхнем регистре расширения тоже модель"
        );
        assert_eq!(files[0].quant.as_deref(), Some("Q4_K_M"));
        assert!(!files[2].ok, "битый файл виден, но не считается моделью");
        assert!(files[2].size_bytes > 0);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_dir_is_an_error_not_an_empty_list() {
        let dir = std::env::temp_dir().join("zshelper-models-нет-такой-папки");
        let _ = std::fs::remove_dir_all(&dir);
        let error = scan(&dir).expect_err("папки нет");
        assert!(error.contains("папки моделей нет"), "{error}");
    }

    #[test]
    fn sha256_matches_the_published_values() {
        let dir = temp_dir("sha");
        let empty = dir.join("empty.gguf");
        let abc = dir.join("abc.gguf");
        std::fs::write(&empty, b"").expect("файл пишется");
        std::fs::write(&abc, b"abc").expect("файл пишется");

        assert_eq!(
            sha256_file(&empty).expect("хеш считается"),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_file(&abc).expect("хеш считается"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_records_the_hash_then_notices_a_change() {
        let dir = temp_dir("verify");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        std::fs::write(dir.join("model.gguf"), b"first").expect("файл пишется");

        let first = verify(&dir, "model.gguf", &memory).expect("сверка работает");
        assert_eq!(first.verdict, "first");
        assert!(first.previous.is_none());

        let second = verify(&dir, "model.gguf", &memory).expect("сверка работает");
        assert_eq!(second.verdict, "same");
        assert_eq!(second.previous.as_deref(), Some(first.actual.as_str()));

        std::fs::write(dir.join("model.gguf"), b"second").expect("файл перезаписывается");
        let third = verify(&dir, "model.gguf", &memory).expect("сверка работает");
        assert_eq!(third.verdict, "changed", "файл подменили — это видно");
        assert_eq!(third.previous.as_deref(), Some(first.actual.as_str()));
        assert_ne!(third.actual, first.actual);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_refuses_paths_instead_of_names() {
        let dir = temp_dir("traversal");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");

        for name in ["../secret", "sub/model.gguf", "..\\model.gguf", ""] {
            let error = verify(&dir, name, &memory).expect_err("это не имя файла");
            assert!(
                error.contains("путём") || error.contains("файла нет"),
                "{error}"
            );
        }

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn verify_says_when_there_is_no_file() {
        let dir = temp_dir("nofile");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");

        let error = verify(&dir, "absent.gguf", &memory).expect_err("файла нет");
        assert!(error.contains("файла нет"), "{error}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_deletes_the_file_and_forgets_its_hash() {
        let dir = temp_dir("remove");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        std::fs::write(dir.join("gone.gguf"), b"payload").expect("файл пишется");
        verify(&dir, "gone.gguf", &memory).expect("хеш запоминается");
        assert!(memory.fact(&hash_key("gone.gguf")).is_some());

        remove(&dir, "gone.gguf", &memory).expect("файл удаляется");

        assert!(!dir.join("gone.gguf").exists());
        assert!(
            memory.fact(&hash_key("gone.gguf")).is_none(),
            "память не помнит хеш того, чего нет"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_refuses_paths_and_absent_files() {
        let dir = temp_dir("remove-guard");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");

        let error = remove(&dir, "../secret", &memory).expect_err("это путь");
        assert!(error.contains("путём"), "{error}");

        let error = remove(&dir, "absent.gguf", &memory).expect_err("файла нет");
        assert!(error.contains("файла нет"), "{error}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn total_bytes_adds_up_what_is_on_disk() {
        let items = vec![
            ModelFile {
                name: "a.gguf".into(),
                size_bytes: 1000,
                ok: true,
                note: String::new(),
                version: None,
                tensors: None,
                architecture: None,
                quant: None,
                hash: None,
            },
            ModelFile {
                name: "b.gguf".into(),
                size_bytes: 24,
                ok: false,
                note: String::new(),
                version: None,
                tensors: None,
                architecture: None,
                quant: None,
                hash: None,
            },
        ];

        assert_eq!(total_bytes(&items), 1024);
        assert_eq!(total_bytes(&[]), 0);
    }

    #[test]
    fn free_space_is_a_real_number_or_an_honest_none() {
        let free = free_space(&std::env::temp_dir());

        if cfg!(windows) {
            assert!(
                free.is_some_and(|bytes| bytes > 0),
                "на Windows PowerShell обязан ответить числом: {free:?}"
            );
        } else {
            assert!(free.is_none(), "на других системах мы не выдумываем место");
        }
    }

    #[test]
    fn default_dir_sits_next_to_the_journal() {
        let base = Path::new("C:/Users/test/AppData/Roaming/zshelper");
        assert_eq!(dir(base), base.join("models"));
    }
}
