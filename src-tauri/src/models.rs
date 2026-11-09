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
            2 | 3 => 2,
            4 | 5 | 6 => 4,
            10 | 11 | 12 => 8,
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
        assert!(error.contains("GGUF"), "сообщение объясняет причину: {error}");
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

        assert!(files[0].ok, "GGUF в верхнем регистре расширения тоже модель");
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
    fn default_dir_sits_next_to_the_journal() {
        let base = Path::new("C:/Users/test/AppData/Roaming/zshelper");
        assert_eq!(dir(base), base.join("models"));
    }
}
