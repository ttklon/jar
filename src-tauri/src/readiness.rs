//! Готовность к первому разговору: что есть на машине и чего не хватает.
//!
//! Первый запуск не должен оставлять человека перед пустым интерфейсом без AI-компонентов.
//! Поэтому приложение читает реальные состояния — движок (`llama-server`), модели на диске,
//! локальное распознавание и свободное место — и собирает одну карточку «чтобы начать разговор,
//! нужно …». Здесь только факты и pinned-каталог (`data/readiness.json`): ни скачивания, ни
//! запуска, ни скрытых действий. Всё это — отдельные команды по явной кнопке.
//!
//! Каталог — данные, а не код: URL, SHA-256, размер и лицензия сверены с авторитетными
//! источниками (Hugging Face API для модели, GitHub Releases API для движка) и лежат в
//! `data/readiness.json`. Выдуманный хеш здесь был бы хуже отсутствия: скачанный файл
//! проверялся бы по нему и честно не сошёлся бы.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

/// Каталог первого запуска: встроен в бинарник и проверен тестами, как и реестр.
const READINESS_JSON: &str = include_str!("../../data/readiness.json");

/// Рекомендованная модель для первого разговора.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ModelSpec {
    pub id: String,
    pub title: String,
    /// Имя файла в папке моделей.
    pub file: String,
    pub url: String,
    /// Эталонный SHA-256 файла (LFS oid репозитория на Hugging Face).
    pub sha256: String,
    /// Ожидаемый размер в байтах.
    pub bytes: u64,
    pub license: String,
    pub source: String,
    pub min_ram_gb: u64,
    pub description: String,
}

/// Движок `llama-server` из pinned-релиза llama.cpp.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeSpec {
    pub id: String,
    pub title: String,
    /// Имя архива в релизе.
    pub asset: String,
    pub url: String,
    /// Эталонный SHA-256 архива (digest ассета из GitHub Releases API).
    pub sha256: String,
    /// Ожидаемый размер архива в байтах.
    pub bytes: u64,
    pub license: String,
    pub source: String,
    /// Имя бинарника внутри архива.
    pub program: String,
    pub description: String,
}

/// Каталог первого запуска целиком.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Catalog {
    pub model: ModelSpec,
    pub runtime: RuntimeSpec,
}

fn parsed() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    // Ошибка разбора означала бы битые встроенные данные — это проверяется тестом,
    // а не обработкой во время работы.
    CATALOG.get_or_init(|| {
        serde_json::from_str(READINESS_JSON).expect("встроенный каталог готовности разбирается")
    })
}

/// Pinned-каталог первого запуска.
pub fn catalog() -> &'static Catalog {
    parsed()
}

/// Что известно о готовности к первому разговору. Только чтение: ничего не скачивает
/// и не запускает. Имена полей совпадают с `src/ipc/types.ts`.
#[derive(Debug, Clone, Serialize)]
pub struct ReadinessStatus {
    /// Движок найден (файл есть рядом с приложением или в `PATH`).
    pub engine_found: bool,
    /// Движок уже запущен.
    pub engine_running: bool,
    pub engine_program: Option<String>,
    pub engine_search_dir: String,
    /// Есть хотя бы один `.gguf` с читаемым заголовком в папке моделей.
    pub model_present: bool,
    /// Имя первой модели с читаемым заголовком, если она есть.
    pub model_name: Option<String>,
    /// Размер этой модели в байтах.
    pub model_bytes: u64,
    pub models_dir: String,
    /// Свободно на диске; `None` — спросить не удалось.
    pub free_bytes: Option<u64>,
    /// Локальное распознавание: движок и модель.
    pub speech_found: bool,
    pub speech_model: Option<String>,
    pub speech_search_dir: String,
    pub model_spec: ModelSpec,
    pub runtime_spec: RuntimeSpec,
    /// Готов ли первый разговор: движок найден и есть модель с читаемым заголовком.
    pub download_name: Option<String>,
    pub runtime_managed: bool,
    pub runtime_supported: bool,
    pub ready: bool,
    /// Чего не хватает: `engine` и/или `model`. Пусто — готово.
    pub missing: Vec<String>,
}

/// Собирает статус из уже прочитанных фактов. Чистая функция: её проверяют тесты
/// на пустой установке, настроенной машине и частичных состояниях.
#[allow(clippy::too_many_arguments)]
pub fn build(
    engine_found: bool,
    engine_running: bool,
    engine_program: Option<String>,
    engine_search_dir: String,
    model_present: bool,
    model_name: Option<String>,
    model_bytes: u64,
    models_dir: String,
    free_bytes: Option<u64>,
    speech_found: bool,
    speech_model: Option<String>,
    speech_search_dir: String,
) -> ReadinessStatus {
    let mut missing = Vec::new();
    if !engine_found {
        missing.push("engine".to_string());
    }
    if !model_present {
        missing.push("model".to_string());
    }

    let catalog = catalog();
    ReadinessStatus {
        engine_found,
        engine_running,
        engine_program,
        engine_search_dir,
        model_present,
        model_name,
        model_bytes,
        models_dir,
        free_bytes,
        speech_found,
        speech_model,
        speech_search_dir,
        model_spec: catalog.model.clone(),
        runtime_spec: catalog.runtime.clone(),
        download_name: None,
        runtime_managed: false,
        runtime_supported: cfg!(all(windows, target_arch = "x86_64")),
        ready: missing.is_empty(),
        missing,
    }
}

/// SHA-256 в каталоге — 64 шестнадцатеричных символа. Иначе сверка бессмысленна.
pub fn sha256_well_formed(sha: &str) -> bool {
    sha.len() == 64 && sha.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_pinned_and_well_formed() {
        let catalog = catalog();

        assert!(sha256_well_formed(&catalog.model.sha256), "хеш модели");
        assert!(sha256_well_formed(&catalog.runtime.sha256), "хеш движка");
        assert!(catalog.model.bytes > 0, "размер модели известен");
        assert!(catalog.runtime.bytes > 0, "размер движка известен");
        assert!(catalog.model.url.starts_with("https://"), "модель по https");
        assert!(
            catalog.runtime.url.starts_with("https://"),
            "движок по https"
        );
        assert!(
            catalog
                .runtime
                .url
                .contains("github.com/ggml-org/llama.cpp/releases/download/"),
            "движок только из релизов llama.cpp: {}",
            catalog.runtime.url
        );
        assert!(
            catalog
                .model
                .url
                .contains("huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF"),
            "модель только из проверенного репозитория: {}",
            catalog.model.url
        );
        assert_eq!(catalog.runtime.program, "llama-server.exe");
        assert!(catalog.model.file.ends_with(".gguf"), "модель — .gguf");
        assert!(!catalog.model.license.is_empty(), "лицензия модели названа");
        assert!(
            !catalog.runtime.license.is_empty(),
            "лицензия движка названа"
        );
    }

    #[test]
    fn empty_install_misses_both() {
        let status = build(
            false,
            false,
            None,
            "sidecars".into(),
            false,
            None,
            0,
            "models".into(),
            Some(10_000_000_000),
            false,
            None,
            "sidecars".into(),
        );
        assert!(!status.ready);
        assert_eq!(status.missing, ["engine", "model"]);
    }

    #[test]
    fn configured_machine_is_ready() {
        let status = build(
            true,
            false,
            Some("sidecars/llama-server.exe".into()),
            "sidecars".into(),
            true,
            Some("m.gguf".into()),
            986_048_768,
            "models".into(),
            Some(10_000_000_000),
            false,
            None,
            "sidecars".into(),
        );
        assert!(status.ready, "движок и модель есть — разговор возможен");
        assert!(status.missing.is_empty());
    }

    #[test]
    fn partial_install_names_only_what_is_missing() {
        let only_engine = build(
            true,
            false,
            Some("x".into()),
            "s".into(),
            false,
            None,
            0,
            "m".into(),
            None,
            false,
            None,
            "s".into(),
        );
        assert_eq!(only_engine.missing, ["model"]);

        let only_model = build(
            false,
            false,
            None,
            "s".into(),
            true,
            Some("m.gguf".into()),
            1,
            "m".into(),
            None,
            false,
            None,
            "s".into(),
        );
        assert_eq!(only_model.missing, ["engine"]);
    }

    #[test]
    fn speech_is_optional_for_readiness() {
        // Локальное распознавание — не обязательное условие первого разговора:
        // голос может идти через системную службу с согласия человека.
        let status = build(
            true,
            false,
            Some("x".into()),
            "s".into(),
            true,
            Some("m.gguf".into()),
            1,
            "m".into(),
            None,
            false,
            None,
            "s".into(),
        );
        assert!(
            status.ready,
            "без локального ASR разговор всё равно возможен"
        );
        assert!(!status.speech_found);
    }

    #[test]
    fn sha256_format_is_strict() {
        assert!(sha256_well_formed(&"a".repeat(64)));
        assert!(!sha256_well_formed("короткий"));
        assert!(!sha256_well_formed(&"g".repeat(64)));
        assert!(!sha256_well_formed(""));
    }
}
