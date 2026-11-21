//! Готовность к первому разговору: что есть на машине и чего не хватает.
//!
//! Первый запуск не должен оставлять человека перед пустым интерфейсом без AI-компонентов.
//! Поэтому приложение читает реальные состояния — движок (`llama-server`), модели на диске,
//! локальное распознавание и свободное место — и собирает одну карточку «чтобы начать разговор,
//! нужно …». Здесь только факты и pinned-каталог (`data/readiness.json`): ни скачивания, ни
//! запуска, ни скрытых действий. Всё это — отдельные команды по явной кнопке.
//!
//! Локальное распознавание (whisper) — необязательная часть разговора, но с той же
//! дисциплиной доставки: pinned-источник, SHA-256 и явное согласие. Без него голос
//! идёт системной службой, и карточка обязана это сказать, а не молчать.
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
    /// Необязательное локальное распознавание: движок whisper.cpp.
    pub whisper_runtime: RuntimeSpec,
    /// Необязательное локальное распознавание: модель whisper.
    pub whisper_model: ModelSpec,
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

/// Куда приложение может обратиться в сети — весь список, для человека.
///
/// Зачем это отдельной функцией и отдельным экраном. «Бесплатно и локально» —
/// обещание, которое легко проверить на словах и невозможно проверить на деле,
/// если человек не видит списка. Здесь он видит: четыре адреса, и у каждого —
/// что именно качается, сколько весит и почему именно оттуда.
///
/// Список строится **из каталога**, а не пишется рядом: список, написанный
/// отдельно, однажды разойдётся с тем, что приложение делает, и станет ещё одной
/// обещалкой. Тест сверяет его с каталогом и с `download.rs`.
#[derive(Debug, Clone, Serialize)]
pub struct NetworkAddress {
    /// Что качается: «модель», «движок», «распознавание»…
    pub purpose: &'static str,
    pub url: String,
    /// Сколько байт. Ноль — размер неизвестен заранее.
    pub bytes: u64,
    /// Обязательно ли для первого разговора.
    pub needed: bool,
    /// Почему именно оттуда, а не «просто на всякий случай».
    pub reason: &'static str,
}

/// Все сетевые адреса приложения. Пусто быть не может: тогда бы не было и
/// приложения, умеющего говорить.
pub fn network_addresses() -> Vec<NetworkAddress> {
    let catalog = catalog();
    vec![
        NetworkAddress {
            purpose: "модель для разговора",
            url: catalog.model.url.clone(),
            bytes: catalog.model.bytes,
            needed: true,
            reason:
                "единственный разговорный движок; файл лежит у вас в папке моделей после скачивания",
        },
        NetworkAddress {
            purpose: "движок llama.cpp",
            url: catalog.runtime.url.clone(),
            bytes: catalog.runtime.bytes,
            needed: true,
            reason: "pinned-релиз: версия не «последняя», а названная, и её хеш проверяется",
        },
        NetworkAddress {
            purpose: "движок распознавания речи",
            url: catalog.whisper_runtime.url.clone(),
            bytes: catalog.whisper_runtime.bytes,
            needed: false,
            reason: "нужен только для голоса, а не для текста; без него приложение работает",
        },
        NetworkAddress {
            purpose: "модель распознавания речи",
            url: catalog.whisper_model.url.clone(),
            bytes: catalog.whisper_model.bytes,
            needed: false,
            reason: "нужна только для голоса; скачивается по явному нажатию",
        },
    ]
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
    /// Установлен ли движок распознавания нашим установщиком (управляемый каталог).
    pub speech_runtime_managed: bool,
    /// Pinned-спецификации необязательного локального распознавания.
    pub speech_runtime_spec: RuntimeSpec,
    pub speech_model_spec: ModelSpec,
    /// Готов ли первый разговор: движок найден и есть модель с читаемым заголовком.
    pub download_name: Option<String>,
    pub runtime_managed: bool,
    pub runtime_supported: bool,
    pub ready: bool,
    /// Чего не хватает: `engine` и/или `model`. Пусто — готово.
    pub missing: Vec<String>,
}

/// Факты о машине, из которых собирается статус. Отдельная структура, а не пятнадцать
/// аргументов: факт и его источник видны рядом, а тесты не гоняют пустые строки.
#[derive(Debug, Clone)]
pub struct Facts {
    pub engine_found: bool,
    pub engine_running: bool,
    pub engine_program: Option<String>,
    pub engine_search_dir: String,
    pub model_present: bool,
    pub model_name: Option<String>,
    pub model_bytes: u64,
    pub models_dir: String,
    pub free_bytes: Option<u64>,
    /// Движок распознавания найден (управляемый, sidecars или PATH).
    pub speech_found: bool,
    pub speech_model: Option<String>,
    pub speech_search_dir: String,
    pub speech_runtime_managed: bool,
}

/// Собирает статус из уже прочитанных фактов. Чистая функция: её проверяют тесты
/// на пустой установке, настроенной машине и частичных состояниях.
pub fn build(facts: Facts) -> ReadinessStatus {
    let mut missing = Vec::new();
    if !facts.engine_found {
        missing.push("engine".to_string());
    }
    if !facts.model_present {
        missing.push("model".to_string());
    }

    let catalog = catalog();
    ReadinessStatus {
        engine_found: facts.engine_found,
        engine_running: facts.engine_running,
        engine_program: facts.engine_program,
        engine_search_dir: facts.engine_search_dir,
        model_present: facts.model_present,
        model_name: facts.model_name,
        model_bytes: facts.model_bytes,
        models_dir: facts.models_dir,
        free_bytes: facts.free_bytes,
        speech_found: facts.speech_found,
        speech_model: facts.speech_model,
        speech_search_dir: facts.speech_search_dir,
        model_spec: catalog.model.clone(),
        runtime_spec: catalog.runtime.clone(),
        speech_runtime_managed: facts.speech_runtime_managed,
        speech_runtime_spec: catalog.whisper_runtime.clone(),
        speech_model_spec: catalog.whisper_model.clone(),
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
        assert!(
            sha256_well_formed(&catalog.whisper_model.sha256),
            "хеш модели распознавания"
        );
        assert!(
            sha256_well_formed(&catalog.whisper_runtime.sha256),
            "хеш движка распознавания"
        );
        assert!(catalog.model.bytes > 0, "размер модели известен");
        assert!(catalog.runtime.bytes > 0, "размер движка известен");
        assert!(
            catalog.whisper_model.bytes > 0,
            "размер модели распознавания известен"
        );
        assert!(
            catalog.whisper_runtime.bytes > 0,
            "размер движка распознавания известен"
        );
        assert!(catalog.model.url.starts_with("https://"), "модель по https");
        assert!(
            catalog.runtime.url.starts_with("https://"),
            "движок по https"
        );
        assert!(
            catalog.whisper_model.url.starts_with("https://"),
            "модель распознавания по https"
        );
        assert!(
            catalog.whisper_runtime.url.starts_with("https://"),
            "движок распознавания по https"
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
        assert!(
            catalog
                .whisper_runtime
                .url
                .contains("github.com/ggml-org/whisper.cpp/releases/download/"),
            "движок распознавания только из релизов whisper.cpp: {}",
            catalog.whisper_runtime.url
        );
        assert!(
            catalog
                .whisper_model
                .url
                .contains("huggingface.co/ggerganov/whisper.cpp"),
            "модель распознавания только из проверенного репозитория: {}",
            catalog.whisper_model.url
        );
        assert_eq!(catalog.runtime.program, "llama-server.exe");
        assert_eq!(catalog.whisper_runtime.program, "whisper-server.exe");
        assert!(catalog.model.file.ends_with(".gguf"), "модель — .gguf");
        assert!(
            catalog.whisper_model.file.starts_with("ggml-")
                && catalog.whisper_model.file.ends_with(".bin"),
            "модель распознавания — ggml-*.bin, как ищет ядро: {}",
            catalog.whisper_model.file
        );
        assert!(!catalog.model.license.is_empty(), "лицензия модели названа");
        assert!(
            !catalog.runtime.license.is_empty(),
            "лицензия движка названа"
        );
        assert!(
            !catalog.whisper_model.license.is_empty(),
            "лицензия модели распознавания названа"
        );
        assert!(
            !catalog.whisper_runtime.license.is_empty(),
            "лицензия движка распознавания названа"
        );
        // У каждого компонента свой id: каталоги установки и записи не должны
        // столкнуться.
        let ids = [
            &catalog.model.id,
            &catalog.runtime.id,
            &catalog.whisper_model.id,
            &catalog.whisper_runtime.id,
        ];
        let mut seen = std::collections::BTreeSet::new();
        for id in ids {
            assert!(!id.is_empty(), "пустой id в каталоге");
            assert!(seen.insert(id.as_str()), "id не уникален: {id}");
        }
    }

    #[test]
    fn empty_install_misses_both() {
        let status = build(Facts {
            engine_found: false,
            engine_running: false,
            engine_program: None,
            engine_search_dir: "sidecars".into(),
            model_present: false,
            model_name: None,
            model_bytes: 0,
            models_dir: "models".into(),
            free_bytes: Some(10_000_000_000),
            speech_found: false,
            speech_model: None,
            speech_search_dir: "sidecars".into(),
            speech_runtime_managed: false,
        });
        assert!(!status.ready);
        assert_eq!(status.missing, ["engine", "model"]);
    }

    #[test]
    fn configured_machine_is_ready() {
        let status = build(Facts {
            engine_found: true,
            engine_running: false,
            engine_program: Some("sidecars/llama-server.exe".into()),
            engine_search_dir: "sidecars".into(),
            model_present: true,
            model_name: Some("m.gguf".into()),
            model_bytes: 986_048_768,
            models_dir: "models".into(),
            free_bytes: Some(10_000_000_000),
            speech_found: true,
            speech_model: Some("models/ggml-base.bin".into()),
            speech_search_dir: "sidecars".into(),
            speech_runtime_managed: true,
        });
        assert!(status.ready, "движок и модель есть — разговор возможен");
        assert!(status.missing.is_empty());
    }

    #[test]
    fn partial_install_names_only_what_is_missing() {
        let only_engine = build(Facts {
            engine_found: true,
            engine_running: false,
            engine_program: Some("x".into()),
            engine_search_dir: "s".into(),
            model_present: false,
            model_name: None,
            model_bytes: 0,
            models_dir: "m".into(),
            free_bytes: None,
            speech_found: false,
            speech_model: None,
            speech_search_dir: "s".into(),
            speech_runtime_managed: false,
        });
        assert_eq!(only_engine.missing, ["model"]);

        let only_model = build(Facts {
            engine_found: false,
            engine_running: false,
            engine_program: None,
            engine_search_dir: "s".into(),
            model_present: true,
            model_name: Some("m.gguf".into()),
            model_bytes: 1,
            models_dir: "m".into(),
            free_bytes: None,
            speech_found: false,
            speech_model: None,
            speech_search_dir: "s".into(),
            speech_runtime_managed: false,
        });
        assert_eq!(only_model.missing, ["engine"]);
    }

    #[test]
    fn speech_is_optional_for_readiness() {
        // Локальное распознавание — не обязательное условие первого разговора:
        // голос может идти через системную службу с согласия человека.
        let status = build(Facts {
            engine_found: true,
            engine_running: false,
            engine_program: Some("x".into()),
            engine_search_dir: "s".into(),
            model_present: true,
            model_name: Some("m.gguf".into()),
            model_bytes: 1,
            models_dir: "m".into(),
            free_bytes: None,
            speech_found: false,
            speech_model: None,
            speech_search_dir: "s".into(),
            speech_runtime_managed: false,
        });
        assert!(
            status.ready,
            "без локального ASR разговор всё равно возможен"
        );
        assert!(!status.speech_found);
    }

    #[test]
    fn speech_parts_are_reported_separately() {
        // Движок распознавания есть, модели нет — карточка должна предложить
        // именно модель, а не «переустановите всё».
        let status = build(Facts {
            engine_found: true,
            engine_running: false,
            engine_program: Some("x".into()),
            engine_search_dir: "s".into(),
            model_present: true,
            model_name: Some("m.gguf".into()),
            model_bytes: 1,
            models_dir: "m".into(),
            free_bytes: Some(500_000_000_000),
            speech_found: true,
            speech_model: None,
            speech_search_dir: "s".into(),
            speech_runtime_managed: true,
        });
        assert!(status.speech_found, "движок распознавания найден");
        assert!(status.speech_model.is_none(), "модели распознавания нет");
        assert!(status.speech_runtime_managed, "движок — управляемый");
    }

    #[test]
    fn sha256_format_is_strict() {
        assert!(sha256_well_formed(&"a".repeat(64)));
        assert!(!sha256_well_formed("короткий"));
        assert!(!sha256_well_formed(&"g".repeat(64)));
        assert!(!sha256_well_formed(""));
    }

    #[test]
    fn the_list_of_network_addresses_is_the_catalog_and_nothing_else() {
        // Список не пишется руками — он строится из каталога. Тест держит это:
        // если кто-то добавит адрес в каталог и забудет список (или наоборот),
        // человек увидит на экране не то, что приложение делает.
        let catalog = catalog();
        let addresses = network_addresses();

        let urls: Vec<&str> = addresses.iter().map(|a| a.url.as_str()).collect();
        for spec in [
            &catalog.model.url,
            &catalog.runtime.url,
            &catalog.whisper_runtime.url,
            &catalog.whisper_model.url,
        ] {
            assert!(
                urls.contains(&spec.as_str()),
                "адрес не попал в список: {spec}"
            );
        }
        assert_eq!(
            addresses.len(),
            4,
            "список не должен ни расти, ни сжиматься сам"
        );
    }

    #[test]
    fn every_address_says_why_it_exists_and_whether_it_is_needed_for_talking() {
        // «Зачем» — не украшение: адрес без причины читается как «зовём куда-то,
        // сами не знаем зачем». И обязательность обязана быть у двух, а не у
        // четырёх: голос не должен выглядеть обязательным для первого разговора.
        for address in network_addresses() {
            assert!(!address.reason.is_empty(), "{}: нет причины", address.url);
            assert!(
                address.url.starts_with("https://"),
                "{}: не https — значит трафик можно подменить",
                address.url
            );
            assert!(!address.purpose.is_empty());
        }

        let needed = network_addresses().iter().filter(|a| a.needed).count();
        assert_eq!(needed, 2, "для разговора нужны ровно движок и модель");
    }
}
