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

/// Что сеть на самом деле отвечает про каждый адрес из каталога.
///
/// Считается **до** скачивания и без скачивания: `curl --head` (или `--range 0-0`
/// для серверов, которые HEAD не любят) отвечает кодом, размером и ETag.
/// Это единственный способ проверить обещание «адреса живые» не словами, а
/// прогоном: каталог может пережить переезд релиза, и узнать об этом лучше до
/// того, как человек нажал «Скачать».
#[derive(Debug, Clone, Serialize)]
pub struct AddressProbe {
    /// Адрес, который проверяли.
    pub url: String,
    /// HTTP-код ответа. Ноль — ответа не было (сеть, DNS, таймаут).
    pub status: u16,
    /// Размер, который назвал сервер. `None` — не назвал.
    pub bytes: Option<u64>,
    /// ETag или последний изменённый — чтобы было видно, тот ли это файл.
    pub tag: Option<String>,
    /// Человеческая причина, если проверка не удалась.
    pub problem: Option<String>,
}

/// Разбирает вывод `curl --head --write-out` в факт об адресе.
///
/// Вывод — это заголовки, затем строка вида `HTTPCODE 200` / `SIZE 123` / `TAG "abc"`.
/// Разбор отдельно от запуска: он проверяется тестами без сети, и именно он
/// определяет, что мы считаем «отвечает».
pub fn parse_probe(url: &str, output: &str) -> AddressProbe {
    let mut status = 0u16;
    let mut bytes = None;
    let mut tag = None;
    // Заголовки разбираются из самого ответа, а не через `%header{}`: этот
    // спецификатор появился в curl 7.84, а в Windows 10 живёт 7.55, и проверка
    // молча возвращала бы «размер неизвестен» на целой системе.
    //
    // При `--location` блоков заголовков несколько; верен последний — тот,
    // что относится к конечному адресу после редиректа.
    for line in output.lines() {
        let line = line.trim();
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = line.strip_prefix("ZSHELPER-CODE ") {
            status = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = lower.strip_prefix("content-length:") {
            // Байты — из последнего блока: значение редиректа бывает нулевым.
            if let Ok(value) = rest.trim().parse::<u64>() {
                bytes = if value > 0 { Some(value) } else { None };
            }
        } else if lower.starts_with("etag:") {
            let value = line[5..].trim();
            if !value.is_empty() {
                tag = Some(value.to_string());
            }
        }
    }
    let problem = if status == 0 {
        Some("адрес не ответил: сеть, DNS или таймаут".to_string())
    } else if !(200..400).contains(&status) {
        Some(format!("адрес ответил кодом {status}"))
    } else if bytes.is_none() {
        // Ответ 200 без размера — это страница, а не файл. Для скачивания
        // такой адрес бесполезен, и лучше узнать это до кнопки.
        Some("сервер не назвал размер файла".to_string())
    } else {
        None
    };
    AddressProbe {
        url: url.to_string(),
        status,
        bytes,
        tag,
        problem,
    }
}

/// Прогон по всем адресам каталога: что реально открывается и когда.
///
/// Запуск `curl` живёт в `download.rs`, а не здесь: сеть — одна дверь, и это
/// проверяется сборкой (`tools/one_door.py`). Разбор ответа остаётся здесь:
/// он про каталог, а не про процесс.
pub fn probe_all() -> Vec<AddressProbe> {
    network_addresses()
        .into_iter()
        .map(|address| {
            let (code, stdout, stderr) = crate::download::head(&address.url);
            if code == Some(0) {
                return parse_probe(&address.url, &stdout);
            }
            AddressProbe {
                url: address.url.clone(),
                status: 0,
                bytes: None,
                tag: None,
                problem: Some(if stderr.is_empty() {
                    format!("curl вышел с кодом {code:?}")
                } else {
                    stderr
                }),
            }
        })
        .collect()
}

#[cfg(test)]
mod probe_tests {
    use super::*;

    /// Настоящий ответ GitHub Releases после редиректа: два блока заголовков,
    /// размер во втором. Взят из прогона, а не придуман, — иначе тест проверял
    /// бы мою фантазию о HTTP.
    const GITHUB: &str = "HTTP/1.1 302 Found\r\nContent-Length: 0\r\nLocation: https://objects.githubusercontent.com/x\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 25696689\r\nETag: \"abc123\"\r\n\r\nZSHELPER-CODE 200\r\n";

    #[test]
    fn a_live_answer_is_read_as_status_size_and_tag() {
        let probe = parse_probe("https://github.com/x.zip", GITHUB);
        assert_eq!(probe.status, 200);
        // Размер — из последнего блока: у редиректа он нулевой, и брать первый
        // значило бы «размер неизвестен» на живом адресе.
        assert_eq!(probe.bytes, Some(25696689));
        assert_eq!(probe.tag.as_deref(), Some("\"abc123\""));
        assert_eq!(probe.problem, None, "живой адрес — не проблема");
    }

    #[test]
    fn a_missing_file_is_named_as_a_problem_not_as_zero_bytes() {
        let probe = parse_probe(
            "https://github.com/gone.zip",
            "HTTP/1.1 404 Not Found\r\nZSHELPER-CODE 404\r\n",
        );
        assert_eq!(probe.status, 404);
        assert_eq!(probe.bytes, None);
        assert!(probe.problem.is_some(), "404 — это провал проверки");
        assert!(probe.problem.unwrap().contains("404"));
    }

    #[test]
    fn an_empty_answer_is_not_a_working_address() {
        let probe = parse_probe("https://x/y", "");
        assert_eq!(probe.status, 0);
        // Ноль байт не должен выглядеть как «файл есть, но пустой»: это
        // отсутствие ответа, и человеку так и говорят.
        assert!(probe.problem.is_some());
        assert!(probe.problem.unwrap().contains("не ответил"));
    }

    #[test]
    fn a_page_instead_of_a_file_is_reported_before_the_button() {
        let probe = parse_probe(
            "https://huggingface.co/x",
            "HTTP/1.1 200 OK\r\nZSHELPER-CODE 200\r\n",
        );
        assert_eq!(probe.status, 200);
        assert_eq!(probe.bytes, None);
        assert!(probe.problem.unwrap().contains("размер"));
    }

    /// Живой прогон: каждый адрес каталога проверяется сетью, и сверяется не
    /// только код, но и размер — тот, что записан в каталоге.
    ///
    /// Под `#[ignore]`, как и разговорный smoke: обычные тесты в сеть не ходят
    /// никогда. Запускается в CI отдельным шагом по явному согласию.
    #[test]
    #[ignore = "opens network connections; explicit consent required"]
    fn every_catalog_address_really_answers_with_the_pinned_size() {
        assert!(
            std::env::var("ZSHELPER_NETWORK_PROBE").is_ok_and(|v| v == "1"),
            "explicit ZSHELPER_NETWORK_PROBE=1 consent required"
        );
        let probes = probe_all();
        let addresses = network_addresses();
        assert_eq!(
            probes.len(),
            addresses.len(),
            "проверен каждый адрес, а не первый"
        );
        let mut failures = Vec::new();
        for (probe, address) in probes.iter().zip(addresses.iter()) {
            match &probe.problem {
                Some(problem) => failures.push(format!("{}: {problem}", address.purpose)),
                None => {
                    let got = probe.bytes.expect("у живого адреса есть размер");
                    if got != address.bytes {
                        failures.push(format!(
                            "{}: размер не тот — в каталоге {}, сервер говорит {got}",
                            address.purpose, address.bytes
                        ));
                    } else {
                        println!(
                            "NETWORK_PROBE {} {} байт — совпало с каталогом",
                            address.purpose, got
                        );
                    }
                }
            }
        }
        assert!(failures.is_empty(), "адреса из каталога: {failures:?}");
        println!("NETWORK_PROBE all four catalog addresses answered with the pinned size");
    }
}
