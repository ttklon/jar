//! Первые «руки» — исполняемые действия из реестра.
//!
//! Описание инструментов лежит в данных (`data/tools.json`), а не в коде: его
//! читают и Rust, и интерфейс, и питон-валидатор в CI. Так исчезает обычная
//! болезнь — «в UI один список, в ядре другой».
//!
//! Каждый инструмент — связка трёх вещей:
//! 1) строка реестра `domain|verb|object` (что именно обещано пользователю);
//! 2) параметры, которые вводит человек (путь, маска);
//! 3) ожидание, по которому проверяется результат (`verifier`).
//!
//! Правило безопасности: значения передаются в PowerShell **переменными
//! окружения**, а не склейкой в текст скрипта — иначе кавычка в имени папки
//! становится чужой командой.

use std::collections::BTreeMap;
use std::sync::atomic::AtomicBool;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::executor::{self, ExecOutput, ExecRequest};
use crate::step::{tail, Evidence, StepResult};
use crate::verifier::{self, Expectation};

const TOOLS_JSON: &str = include_str!("../../data/tools.json");

/// Ограничение размера вывода в результате, символов.
const DETAIL_TAIL: usize = 4000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamSpec {
    /// Имя параметра: латиницей, потому что оно же суффикс переменной окружения.
    pub name: String,
    pub label: String,
    pub placeholder: String,
    pub hint: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSpec {
    /// Ключ реестра: по нему берутся риск, статус и обещание.
    pub registry: String,
    pub title: String,
    pub summary: String,
    /// Что реально запускается — для честного «как это работает».
    pub implementation: String,
    pub params: Vec<ParamSpec>,
}

static TOOLS: OnceLock<Vec<ToolSpec>> = OnceLock::new();

/// Все объявленные инструменты. Файл проверяется CI (`tools/hands.py`), поэтому
/// разбор на старте — это утверждение, а не надежда.
pub fn all() -> &'static [ToolSpec] {
    TOOLS.get_or_init(|| {
        serde_json::from_str(TOOLS_JSON).expect("data/tools.json обязан быть валидным (CI)")
    })
}

pub fn spec(registry: &str) -> Option<&'static ToolSpec> {
    all().iter().find(|tool| tool.registry == registry)
}

/// Проверка параметров до запуска: пустой путь бессмысленно отправлять в PowerShell.
///
/// Проверяются обе стороны. Обязательный параметр обязан быть — это понятно. А незнакомый
/// параметр — не мелочь: план покажет человеку «пароль», рука его не прочитает, и
/// подтверждение станет обещанием, которого никто не выполнит. Лучше отказать до запуска.
pub fn validate(spec: &ToolSpec, params: &BTreeMap<String, String>) -> Result<(), String> {
    for param in spec.params.iter().filter(|param| param.required) {
        match params.get(&param.name) {
            Some(value) if !value.trim().is_empty() => {}
            _ => return Err(format!("не задан параметр «{}»", param.label)),
        }
    }

    let unknown = params
        .keys()
        .find(|name| !spec.params.iter().any(|param| &param.name == *name));
    if let Some(name) = unknown {
        return Err(format!("эта рука не понимает параметр «{name}»"));
    }

    Ok(())
}

/// Выполняет инструмент. Таймауты и отмена — внутри `executor`.
pub fn run(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let spec = match spec(registry) {
        Some(spec) => spec,
        None => return StepResult::failed(registry, "такого инструмента ещё нет"),
    };

    if let Err(reason) = validate(spec, params) {
        return StepResult::failed(registry, reason);
    }

    match registry {
        "files|создать|папку" => create_folder(registry, params),
        "files|переместить|файлы/папки" => move_item(registry, params, cancel),
        "apps-windows|запустить|программу" => {
            launch_app(registry, params, cancel)
        }
        "apps-windows|показать|установленные программы" => {
            simple(registry, INSTALLED_APPS, 60, cancel)
        }
        "files|удалить|в корзину" => recycle(registry, params, cancel),
        "files|проверить|размеры и место" => {
            folder_sizes(registry, params, cancel)
        }
        "files|найти|по имени" => find_by_name(registry, params, cancel),
        "files|проверить|дубликаты по хэшу" => {
            duplicates(registry, params, cancel)
        }
        "processes-services|показать|топ по нагрузке" => {
            simple(registry, TOP_PROCESSES, 30, cancel)
        }
        "storage-backup|проверить|свободное место" => {
            simple(registry, FREE_SPACE, 30, cancel)
        }
        "storage-backup|проверить|SMART диска" => simple(registry, SMART, 30, cancel),
        "system-power|проверить|батарею" => simple(registry, BATTERY, 30, cancel),
        "hardware-diag|показать|характеристики железа" => {
            simple(registry, HARDWARE, 60, cancel)
        }
        "processes-services|проанализировать|автозапуск" => {
            simple(registry, STARTUP, 60, cancel)
        }
        "network|проверить|подключение" => {
            simple(registry, CONNECTIVITY, 60, cancel)
        }
        "network|проверить|открытые порты" => {
            simple(registry, OPEN_PORTS, 60, cancel)
        }
        "files|записать|текст в файл" => write_text(registry, params),
        "files|прочитать|текст файла" => read_text(registry, params),
        "files|заменить|текст в файле" => replace_text(registry, params),
        "web|скачать|файл по ссылке" => download_file(registry, params, cancel),
        "files|распаковать|архив" => expand_archive(registry, params, cancel),
        "files|скопировать|файлы/папки" => copy_item(registry, params),
        "files|сжать|в архив" => create_archive(registry, params, cancel),
        "files|переименовать|массово по правилу" => {
            rename_by_rule(registry, params)
        }
        "web|открыть|сайт" => open_site(registry, params, cancel),
        "apps-windows|нажать|кнопку" => press_element(registry, params),
        "apps-windows|ввести|текст" => type_into_field(registry, params, cancel),
        _ => StepResult::failed(registry, "инструмент объявлен, но не реализован"),
    }
}

/// Нажатие кнопки в активном окне — как шаг плана, а не как отдельная кнопка на экране.
///
/// Проверка здесь та же, что в ручном режиме: элемент находится однозначно, нажимается
/// только то, что объявляет `invoke`, а результат сравнивается с прежним экраном.
fn press_element(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let name = param(params, "name").trim();
    if name.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Имя элемента»");
    }

    let outcome = crate::uia::press(crate::uia::MAX_NODES / 3, name);
    let duration_ms = started.elapsed().as_millis() as u64;

    match outcome {
        Ok(press) => {
            let mut result = StepResult::ok_with(
                registry,
                Evidence::UiChanged {
                    what: format!("{} «{}»", press.target.kind, press.target.name),
                    changed: press.changed,
                },
                press.note.clone(),
                duration_ms,
            );
            // «Нажато, но ничего не изменилось» — не выполненный шаг: доказательства нет.
            result.ok = press.changed;
            result
        }
        Err(reason) => StepResult::failed(registry, reason),
    }
}

/// Ввод текста в поле активного окна. Доказательство — прочитанное обратно значение.
fn type_into_field(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let name = param(params, "name").trim();
    let text = param(params, "text");

    if name.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Имя поля»");
    }
    if text.trim().is_empty() {
        return StepResult::failed(registry, "не задан параметр «Текст»");
    }
    if cancel.load(std::sync::atomic::Ordering::Relaxed) {
        return StepResult::failed(registry, "отменено до начала ввода");
    }

    let outcome = crate::uia::type_text(crate::uia::MAX_NODES / 3, name, text);
    let duration_ms = started.elapsed().as_millis() as u64;

    match outcome {
        Ok(typed) => {
            let mut result = StepResult::ok_with(
                registry,
                Evidence::UiChanged {
                    what: format!("поле «{}»", typed.target.name),
                    changed: typed.verified,
                },
                typed.note.clone(),
                duration_ms,
            );
            result.ok = typed.verified;
            result
        }
        Err(reason) => StepResult::failed(registry, reason),
    }
}

fn param<'a>(params: &'a BTreeMap<String, String>, name: &str) -> &'a str {
    params.get(name).map(String::as_str).unwrap_or_default()
}

/// Путь без внешних кавычек и пробелов по краям. Вторая линия защиты — сам путь
/// всё равно уходит переменной окружения, а не в текст скрипта.
fn clean_path(path: &str) -> String {
    path.trim().trim_matches('"').to_string()
}

fn run_script(
    registry: &str,
    script: &str,
    params: &[(&str, &str)],
    expectation: Expectation,
    timeout: Duration,
    cancel: &AtomicBool,
) -> StepResult {
    let mut request =
        ExecRequest::new("powershell.exe", executor::powershell(script)).with_timeout(timeout);
    for (name, value) in params {
        request = request.with_env(format!("ZS_{name}"), *value);
    }

    match executor::run(&request, cancel) {
        Ok(output) => verifier::check(registry, &expectation, &output),
        Err(error) => StepResult::failed(registry, error.to_string()),
    }
}

fn native_result(
    registry: &str,
    expectation: Expectation,
    started: Instant,
    stdout: &str,
) -> StepResult {
    let output = ExecOutput {
        exit_code: Some(0),
        stdout: stdout.to_string(),
        stderr: String::new(),
        timed_out: false,
        cancelled: false,
        duration_ms: started.elapsed().as_millis() as u64,
        limits_note: String::new(),
    };
    verifier::check(registry, &expectation, &output)
}

fn create_folder(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));

    match std::fs::create_dir_all(&path) {
        Ok(()) => {
            let message = format!("создано: {path}");
            native_result(registry, Expectation::PathExists(path), started, &message)
        }
        Err(error) => StepResult::failed(registry, format!("папка не создана: {error}")),
    }
}

/// Заменить текст в файле и доказать, что получилось ровно то, что должно было.
///
/// Правила здесь такие же строгие, как у нажатия кнопки:
///
///  * **старое не нашлось — ничего не делаем.** «Заменил ноль раз» — это не успех, а
///    пустая работа, о которой надо сказать;
///  * **нашлось несколько раз — спрашиваем слово «все».** Менять первое из пяти — это
///    угадывание, а угадывание на диске стоит дорого;
///  * **искомое равно замене — это не замена.** Молча «сделать» тут нечего;
///  * **доказательство — сравнение с ожидаемым текстом.** После записи файл читается
///    обратно и сравнивается с тем, что должно было получиться, а не просто «запись прошла».
fn replace_text(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));
    let find = param(params, "find");
    let replace = param(params, "replace");
    let all = matches!(param(params, "all").trim(), "true" | "да" | "yes");

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Путь»");
    }
    // Пробелы внутри искомого — законная часть текста, поэтому проверяем только пустоту.
    if find.trim().is_empty() {
        return StepResult::failed(registry, "не задан параметр «Что найти»");
    }
    if replace.trim().is_empty() {
        return StepResult::failed(registry, "не задан параметр «На что заменить»");
    }
    if find == replace {
        return StepResult::failed(
            registry,
            "искомое и замена совпадают — менять нечего, и делать вид, что заменили, я не буду",
        );
    }

    let target = std::path::Path::new(&path);
    let metadata = match std::fs::metadata(target) {
        Ok(metadata) => metadata,
        Err(_) => return StepResult::failed(registry, format!("файла нет: {path}")),
    };
    if !metadata.is_file() {
        return StepResult::failed(registry, format!("это не файл, а папка: {path}"));
    }
    if metadata.len() > MAX_READ_BYTES {
        return StepResult::failed(
            registry,
            format!(
                "файл {} КБ, а правлю не больше {} КБ за шаг: такой файл правят программой",
                metadata.len() / 1024,
                MAX_READ_BYTES / 1024
            ),
        );
    }

    let unreadable = format!(
        "файл не читается как текст: {path} — возможно, он двоичный или в другой кодировке"
    );
    let content = match std::fs::read_to_string(target) {
        Ok(content) => content,
        Err(_) => return StepResult::failed(registry, unreadable),
    };

    let count = content.matches(find).count();
    if count == 0 {
        return StepResult::failed(
            registry,
            format!("в файле нет «{}» — заменять нечего", head(find, 60)),
        );
    }
    if count > 1 && !all {
        return StepResult::failed(
            registry,
            format!(
                "«{}» встречается {count} раз — непонятно, какое менять: скажите «заменить все»",
                head(find, 60)
            ),
        );
    }

    let expected = if all {
        content.replace(find, replace)
    } else {
        content.replacen(find, replace, 1)
    };

    if let Err(error) = std::fs::write(target, expected.as_bytes()) {
        return StepResult::failed(registry, format!("файл не записался: {error}"));
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    let replaced = if all { count } else { 1 };

    let back = match std::fs::read_to_string(target) {
        Ok(back) => back,
        Err(error) => {
            return StepResult::failed(
                registry,
                format!("файл записан, но не читается обратно: {error}"),
            )
        }
    };

    // Доказательство — совпадение с ожидаемым текстом, а не «запись прошла без ошибки».
    let same = back == expected;
    let reason = if same {
        format!("файл обновлён, заменено вхождений: {replaced} — {path}")
    } else {
        format!("после замены в файле не то, что должно было быть: {path}")
    };
    let mut result = StepResult::ok_with(
        registry,
        Evidence::FileText {
            path,
            matches: same,
        },
        reason,
        duration_ms,
    );
    // Не совпало — значит, не выполнено, что бы ни говорил отчёт.
    result.ok = same;
    result
}

/// Скопировать файл или папку и доказать, что копия совпадает с источником.
///
/// Правила — про чужое и про бесконечность:
///
///  * **цель не должна существовать.** `Copy-Item` поверх молча затирает чужой файл, а
///    «скопировал» после этого — неправда: старое потеряно;
///  * **папку внутрь себя копировать нельзя** — это бесконечное копирование, и проверять
///    это надо до первого файла, а не когда диск кончится;
///  * **доказательство — совпадение числа файлов и байт**, а не код возврата: «функция не
///    выдала ошибку» ничего не говорит о том, что копия полная;
///  * **источник остаётся на месте.** Копирование — не перемещение, и говорить иначе нельзя.
fn copy_item(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let from = clean_path(param(params, "from"));
    let to = clean_path(param(params, "to"));

    if from.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Откуда»");
    }
    if to.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Куда»");
    }

    // «..» разные функции разворачивают по-разному, и проверка «цель внутри источника» на
    // этом ломается — а цена ошибки здесь бесконечное копирование. Честнее попросить
    // полный путь, чем угадывать.
    if has_parent_dir(&from) || has_parent_dir(&to) {
        return StepResult::failed(
            registry,
            "в пути есть «..» — назови папку полным путём, без сокращений",
        );
    }

    let source = std::path::Path::new(&from);
    let metadata = match std::fs::metadata(source) {
        Ok(metadata) => metadata,
        Err(_) => {
            return StepResult::failed(
                registry,
                format!("копировать нечего, источника нет: {from}"),
            )
        }
    };

    let target = std::path::Path::new(&to);
    if target.exists() {
        return StepResult::failed(
            registry,
            format!("цель уже есть: {to} — молча заменять чужое я не буду"),
        );
    }

    if metadata.is_dir() && is_inside(target, source) {
        return StepResult::failed(
            registry,
            format!("копировать папку внутрь себя нельзя: {to} лежит внутри {from}"),
        );
    }

    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                return StepResult::failed(registry, format!("папка не создалась: {error}"));
            }
        }
    }

    if metadata.is_file() {
        if let Err(error) = std::fs::copy(source, target) {
            return StepResult::failed(registry, format!("файл не скопирован: {error}"));
        }
    } else if let Err(reason) = copy_tree(source, target, 0) {
        return StepResult::failed(registry, reason);
    }

    let expected = measure(source);
    let actual = measure(target);
    if expected != actual {
        let message = format!(
            "копия не совпала с источником: было {} файлов ({} байт), стало {} файлов ({} байт)",
            expected.0, expected.1, actual.0, actual.1
        );
        return StepResult::failed(registry, message);
    }

    StepResult::ok_with(
        registry,
        Evidence::PathExists {
            path: to.clone(),
            exists: true,
        },
        format!(
            "скопировано файлов: {}, байт: {} — {to}",
            actual.0, actual.1
        ),
        started.elapsed().as_millis() as u64,
    )
}

/// Есть ли в пути «..». Такой путь нельзя сравнивать надёжно, поэтому рука его не берёт.
fn has_parent_dir(path: &str) -> bool {
    std::path::Path::new(path)
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
}

/// Цель лежит внутри источника. Оба пути приводит к одному виду `canonical_ish` — иначе
/// короткое имя папки в одном и длинное в другом сделают проверку бессмысленной.
fn is_inside(target: &std::path::Path, source: &std::path::Path) -> bool {
    let source_text = comparable(&canonical_ish(source, true));

    let target_abs = if target.is_absolute() {
        target.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(target)
    };
    let target_text = comparable(&canonical_ish(&target_abs, false));
    // Слэш на конце — чтобы «Проект» не считался родителем «Проект2».
    target_text == source_text || target_text.starts_with(&format!("{source_text}/"))
}

/// Приводит путь к каноническому виду, даже если самого пути ещё нет: канонизирует
/// ближайшего существующего предка и дописывает остаток как есть.
///
/// Зачем не просто `canonicalize()`. На Windows он раскрывает короткие имена (`RUNNER~1` →
/// `runneradmin`) и добавляет префикс `\\?\`, поэтому канонический путь источника и
/// собранный из слов человека путь цели перестают быть похожими — и проверка «цель внутри
/// источника» молча отвечает «нет». На этом папка копировалась внутрь себя до отказа диска.
fn canonical_ish(path: &std::path::Path, must_exist: bool) -> std::path::PathBuf {
    if let Ok(found) = path.canonicalize() {
        return found;
    }
    if must_exist {
        return path.to_path_buf();
    }

    let mut rest: Vec<std::ffi::OsString> = Vec::new();
    let mut current = path.to_path_buf();
    loop {
        let Some(parent) = current.parent().map(|parent| parent.to_path_buf()) else {
            return path.to_path_buf();
        };
        let Some(name) = current.file_name().map(|name| name.to_os_string()) else {
            return path.to_path_buf();
        };
        rest.push(name);

        if let Ok(found) = parent.canonicalize() {
            let mut result = found;
            for part in rest.iter().rev() {
                result.push(part);
            }
            return result;
        }

        current = parent;
        if current.as_os_str().is_empty() {
            return path.to_path_buf();
        }
    }
}

/// Путь в виде строки для сравнения: без вербатим-префикса Windows (`\\?\`), с прямыми
/// слэшами и без учёта регистра.
///
/// Зачем так. `canonicalize()` на Windows возвращает `\\?\C:\…`, а путь из слов человека —
/// обычный `C:\…`. Без нормализации сравнение «внутри или нет» молча перестаёт работать, и
/// защита от бесконечного копирования папки в себя превращается в её отсутствие.
fn comparable(path: &std::path::Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/").to_lowercase();
    text.trim_start_matches("//?/").to_string()
}

/// Скопировать папку целиком, по одному файлу. Возвращает причину, а не «что-то пошло не так»:
/// человек должен знать, на каком файле остановилось.
fn copy_tree(from: &std::path::Path, to: &std::path::Path, depth: u32) -> Result<(), String> {
    // Сеть против бесконечности на всякий случай: если проверка «цель внутри источника»
    // когда-нибудь снова ошибётся, лучше остановиться с внятной причиной, чем упасть
    // переполнением стека — в отчёте тогда не видно даже, какой шаг виноват.
    if depth > 64 {
        return Err(String::from(
            "папка вложена глубже 64 уровней — похоже на копирование внутрь себя, остановился",
        ));
    }

    std::fs::create_dir_all(to)
        .map_err(|error| format!("папка не создалась: {}: {error}", to.display()))?;

    let entries = std::fs::read_dir(from)
        .map_err(|error| format!("папка не читается: {}: {error}", from.display()))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("элемент не прочитан: {error}"))?;
        let path = entry.path();
        let destination = to.join(entry.file_name());
        if path.is_dir() {
            copy_tree(&path, &destination, depth + 1)?;
        } else if let Err(error) = std::fs::copy(&path, &destination) {
            let message = format!("файл не скопирован: {}: {error}", path.display());
            return Err(message);
        }
    }

    Ok(())
}

/// Сколько файлов и байт в пути. Для файла — один файл и его длина.
fn measure(path: &std::path::Path) -> (usize, u64) {
    let Ok(metadata) = std::fs::metadata(path) else {
        return (0, 0);
    };
    if metadata.is_file() {
        return (1, metadata.len());
    }

    let mut files = 0;
    let mut bytes = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let (nested_files, nested_bytes) = measure(&entry.path());
            files += nested_files;
            bytes += nested_bytes;
        }
    }
    (files, bytes)
}

/// Заархивировать файл или папку в zip и доказать, что архив не пустой.
///
/// Архив — это запись нового файла, поэтому правила те же, что у копирования: цель не
/// должна существовать (иначе `Compress-Archive` тихо перезапишет её) и архивировать
/// нечего, если источник пуст. Формат — только zip: `Compress-Archive` не умеет ни rar,
/// ни пароль, и делать вид, что умеет, нельзя.
fn create_archive(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));
    let to = clean_path(param(params, "to"));

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Что архивировать»");
    }
    if to.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Куда сохранить архив»");
    }

    let lowered = to.to_ascii_lowercase();
    if !lowered.ends_with(".zip") {
        return StepResult::failed(
            registry,
            "архив делаю только zip: имя должно кончаться на .zip — rar и пароль эта рука не умеет",
        );
    }

    let source = std::path::Path::new(&path);
    let metadata = match std::fs::metadata(source) {
        Ok(metadata) => metadata,
        Err(_) => return StepResult::failed(registry, format!("архивировать нечего: {path}")),
    };
    if metadata.is_dir() && measure(source).0 == 0 {
        return StepResult::failed(
            registry,
            format!("папка пуста: {path} — архив из ничего не архив"),
        );
    }

    let target = std::path::Path::new(&to);
    if target.exists() {
        return StepResult::failed(
            registry,
            format!("архив уже есть: {to} — молча заменять чужой файл я не буду"),
        );
    }
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                return StepResult::failed(registry, format!("папка не создалась: {error}"));
            }
        }
    }

    let result = run_script(
        registry,
        COMPRESS_ARCHIVE,
        &[("PATH", path.as_str()), ("TO", to.as_str())],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(600),
        cancel,
    );
    if !result.ok {
        return result;
    }

    let size = std::fs::metadata(target)
        .map(|meta| meta.len())
        .unwrap_or(0);
    if size == 0 {
        return StepResult::failed(
            registry,
            format!("архив создан размером ноль байт: {to} — это не архив"),
        );
    }

    let mut result = result;
    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = format!("архив создан: {size} байт — {to}");
    result
}

/// Переименовать файлы в папке по правилу «найти в имени — заменить».
///
/// Правила здесь про чужое и про половину сделанного:
///
///  * **сначала проверяется весь план, и только потом переименовывается первый файл.**
///    Если хоть одно имя упрётся в существующий файл, не переименовывается ничего:
///    половина переименованного хуже, чем ничего, — человек не знает, где остановились;
///  * **два файла не получат одно имя.** Иначе второй `rename` молча затрёт первый;
///  * **вложенные папки не трогаются.** Правило звучит «в этой папке», а не «на диске»:
///    иначе одна команда переименовала бы файлы во всём дереве, включая системные;
///  * **сравнение — как написано, с учётом регистра.** Угадывание регистра здесь было бы
///    сюрпризом: «фото» и «Фото» — разные куски имени;
///  * **доказательство — список папки после:** старых имён нет, новые на месте.
fn rename_by_rule(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let folder = clean_path(param(params, "path"));
    let find = param(params, "find").trim().to_string();
    let replace = param(params, "replace").to_string();

    if folder.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Папка»");
    }
    if find.is_empty() {
        return StepResult::failed(
            registry,
            "не задано, что заменить в имени: пустое правило переименовало бы всё подряд",
        );
    }
    if find == replace {
        return StepResult::failed(
            registry,
            "искомое и замена совпадают — имена не изменятся, значит и делать нечего",
        );
    }
    if has_parent_dir(&folder) {
        return StepResult::failed(
            registry,
            "в пути есть «..» — назови папку полным путём, без сокращений",
        );
    }

    let directory = std::path::Path::new(&folder);
    if !directory.is_dir() {
        return StepResult::failed(registry, format!("это не папка: {folder}"));
    }

    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) => return StepResult::failed(registry, format!("папка не читается: {error}")),
    };

    let mut planned: Vec<(std::path::PathBuf, std::path::PathBuf)> = Vec::new();
    let mut seen: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                return StepResult::failed(registry, format!("элемент не прочитан: {error}"))
            }
        };
        let path = entry.path();
        // Папки не переименовываем: правило объявлено для файлов.
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.contains(&find) {
            continue;
        }

        let renamed = name.replace(&find, &replace);
        let target = path.with_file_name(&renamed);
        if target.exists() {
            return StepResult::failed(
                registry,
                format!("рядом уже есть «{renamed}» — молча затирать чужое не буду: {folder}"),
            );
        }
        if !seen.insert(renamed.to_lowercase()) {
            return StepResult::failed(
                registry,
                format!("два файла получили бы одно имя «{renamed}» — правило надо уточнить"),
            );
        }

        planned.push((path, target));
    }

    if planned.is_empty() {
        return StepResult::failed(
            registry,
            format!("переименовывать нечего: в именах файлов нет «{find}»"),
        );
    }

    let total = planned.len();
    let mut renamed = 0;
    for (from, to) in &planned {
        if let Err(error) = std::fs::rename(from, to) {
            let name = from
                .file_name()
                .map(|name| name.to_string_lossy().to_string());
            return StepResult::failed(
                registry,
                format!(
                    "остановился на «{}»: переименовано {renamed} из {total} — {error}",
                    name.unwrap_or_default()
                ),
            );
        }
        renamed += 1;
    }

    // Доказательство: смотрим на папку ещё раз, а не на код возврата.
    let left_behind = planned
        .iter()
        .find(|(from, _)| from.exists())
        .map(|(from, _)| from.display().to_string());
    let missing = planned
        .iter()
        .find(|(_, to)| !to.exists())
        .map(|(_, to)| to.display().to_string());

    if let Some(old) = left_behind {
        return StepResult::failed(
            registry,
            format!("старое имя осталось на месте: {old} — переименование не состоялось"),
        );
    }
    if let Some(new) = missing {
        return StepResult::failed(
            registry,
            format!("нового имени нет на месте: {new} — переименование не состоялось"),
        );
    }

    StepResult::ok_with(
        registry,
        Evidence::Renamed {
            folder: folder.clone(),
            count: renamed,
        },
        format!("переименовано файлов: {renamed} — {folder}; список папки это подтверждает"),
        started.elapsed().as_millis() as u64,
    )
}

/// Открыть ссылку в браузере по умолчанию.
///
/// Что здесь можно доказать, а что нельзя — и это сказано в отчёте прямо:
///
///  * **ссылка проверяется до запуска.** Только `http://` и `https://`: `file://` открыл бы
///    локальный файл, `javascript:` — чужой код, и «открой сайт» превратилось бы во что-то
///    другое;
///  * **доказательство — обработчик ссылок назвался.** Windows знает, какая программа
///    откроет http, и её имя видно в выводе; это подтверждает, что ссылка ушла браузеру,
///    а не в пустоту;
///  * **что страница загрузилась, отсюда не проверить.** Это остаётся человеку, и в отчёте
///    так и написано: обещать проверку, которой нет, — хуже, чем её не иметь.
fn open_site(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let url = param(params, "url").trim();

    if url.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Ссылка»");
    }

    let lowered = url.to_ascii_lowercase();
    if !(lowered.starts_with("http://") || lowered.starts_with("https://")) {
        return StepResult::failed(
            registry,
            "открываю только http:// и https://: file:// и прочие схемы — не сайт",
        );
    }

    let mut result = run_script(
        registry,
        OPEN_SITE,
        &[("URL", url)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(60),
        cancel,
    );
    if !result.ok {
        return result;
    }

    let handler = result
        .stdout_tail
        .split_whitespace()
        .find_map(|word| word.strip_prefix("progid="))
        .unwrap_or("обработчик не назвался");

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = format!(
        "ссылка передана браузеру ({handler}): {url} — что страница загрузилась, отсюда не проверить, это видно на экране"
    );
    result
}

/// Распаковать архив в папку и доказать, что внутри появились файлы.
///
/// Правила здесь про чужое: распаковка — это запись рядом с чужими файлами.
///
///  * **архив должен быть файлом** — папка вместо архива это не «почти то же»;
///  * **папка назначения должна быть пустой или несуществующей.** `Expand-Archive` без
///    `-Force` падает на существующих файлах, а с `-Force` — молча затирает их; ни то, ни
///    другое не годится, поэтому решаем до запуска и говорим причину;
///  * **доказательство — файлы на месте.** «Команда не выдала ошибку» ещё не значит, что
///    архив распаковался: пустая папка после успешного кода — это провал, а не успех.
fn expand_archive(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let path = clean_path(param(params, "path"));
    let to = clean_path(param(params, "to"));

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Архив»");
    }
    if to.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Куда распаковать»");
    }

    let archive = std::path::Path::new(&path);
    match std::fs::metadata(archive) {
        Ok(meta) if meta.is_file() => {}
        Ok(_) => {
            return StepResult::failed(registry, format!("это папка, а нужен файл архива: {path}"))
        }
        Err(_) => return StepResult::failed(registry, format!("архива нет: {path}")),
    }

    let target = std::path::Path::new(&to);
    if target.exists() {
        if !target.is_dir() {
            return StepResult::failed(
                registry,
                format!("по этому пути файл, а нужна папка: {to}"),
            );
        }
        let busy = std::fs::read_dir(target)
            .map(|mut entries| entries.next().is_some())
            .unwrap_or(false);
        if busy {
            return StepResult::failed(
                registry,
                format!("папка не пуста: {to} — распаковка поверх молча затёрла бы файлы"),
            );
        }
    } else if let Err(error) = std::fs::create_dir_all(target) {
        return StepResult::failed(registry, format!("папка не создалась: {error}"));
    }

    let result = run_script(
        registry,
        EXPAND_ARCHIVE,
        &[("PATH", path.as_str()), ("TO", to.as_str())],
        Expectation::PathExists(to.clone()),
        Duration::from_secs(300),
        cancel,
    );
    if !result.ok {
        return result;
    }

    let files = count_files(target);
    if files == 0 {
        return StepResult::failed(
            registry,
            format!("код 0, но в папке нет ни одного файла: {to} — это не распаковка"),
        );
    }

    let mut result = result;
    result.reason = format!("распаковано файлов: {files} — {to}");
    result
}

/// Сколько файлов внутри папки, считая вложенные. Ошибка чтения — ноль: тогда шаг
/// честно скажет, что файлов не видно, а не соврёт про «распаковано».
fn count_files(dir: &std::path::Path) -> usize {
    let mut total = 0;
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            total += count_files(&path);
        } else {
            total += 1;
        }
    }
    total
}

/// Скачать файл по ссылке и доказать, что скачался файл, а не страница ошибки.
///
/// Порядок здесь такой же жёсткий, как при скачивании моделей (`download.rs`), и по той же
/// причине — «получилось» должно означать «файл на месте и он не пустой»:
///
///  * **качаем в `<файл>.part`**, а не в настоящее имя: недокачанное не должно выглядеть
///    скачанным, особенно если человек уйдёт и вернётся через час;
///  * **`--fail` обязателен**: без него ответ 404 записывается как успешный файл, внутри
///    которого текст ошибки;
///  * **чужие схемы закрыты**: `--proto`/`--proto-redir` не дают ссылке увести curl на
///    `file://` и прочитать локальный файл;
///  * **.part удаляется при любой неудаче**: мусор рядом с файлом — это ложь на экране.
fn download_file(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let url = param(params, "url").trim();
    let path = clean_path(param(params, "path"));
    let overwrite = matches!(param(params, "overwrite").trim(), "true" | "да" | "yes");

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Путь»");
    }
    if url.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Ссылка»");
    }

    let lowered = url.to_ascii_lowercase();
    if !(lowered.starts_with("http://") || lowered.starts_with("https://")) {
        return StepResult::failed(
            registry,
            "ссылка должна начинаться с http:// или https://: файловые и прочие схемы не качаю",
        );
    }

    let target = std::path::Path::new(&path);
    if target.is_dir() {
        return StepResult::failed(
            registry,
            format!("по этому пути папка, а нужен файл: {path}"),
        );
    }
    if target.exists() && !overwrite {
        return StepResult::failed(
            registry,
            format!("файл уже есть: {path} — скажите «перезаписать», и я заменю"),
        );
    }
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                return StepResult::failed(registry, format!("папка не создалась: {error}"));
            }
        }
    }

    let part = format!("{path}.part");
    let part_path = std::path::Path::new(&part);
    let _ = std::fs::remove_file(part_path);

    let request =
        ExecRequest::new("curl", curl_argv(url, &part)).with_timeout(Duration::from_secs(600));

    let output = match executor::run(&request, cancel) {
        Ok(output) => output,
        Err(error) => {
            let _ = std::fs::remove_file(part_path);
            return StepResult::failed(registry, format!("curl не запустился: {error}"));
        }
    };

    if output.cancelled || output.timed_out || output.exit_code != Some(0) {
        let _ = std::fs::remove_file(part_path);
        let reason = if output.cancelled {
            "отменено вами: недокачанное удалено".to_string()
        } else if output.timed_out {
            "скачивание не уложилось в десять минут: недокачанное удалено".to_string()
        } else {
            format!(
                "curl вышел с кодом {}: {} — файла нет, {} удалён",
                output.exit_code.unwrap_or(-1),
                tail(output.stderr.trim(), 300),
                part
            )
        };
        return StepResult::failed(registry, reason);
    }

    let size = std::fs::metadata(part_path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    if size == 0 {
        let _ = std::fs::remove_file(part_path);
        return StepResult::failed(
            registry,
            "скачался пустой файл — это не результат: недокачанное удалено",
        );
    }

    if target.exists() {
        if let Err(error) = std::fs::remove_file(target) {
            let _ = std::fs::remove_file(part_path);
            return StepResult::failed(
                registry,
                format!("старый файл не удалось заменить: {error}"),
            );
        }
    }
    if let Err(error) = std::fs::rename(part_path, target) {
        let _ = std::fs::remove_file(part_path);
        return StepResult::failed(registry, format!("файл не переименовался: {error}"));
    }

    let mut result = verifier::check(registry, &Expectation::PathExists(path.clone()), &output);
    if !result.ok {
        // Файл переименовали, а его нет — это не успех, что бы ни говорил curl.
        return StepResult::failed(registry, format!("после скачивания файла нет: {path}"));
    }
    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = format!("скачано {size} байт: {path}");
    result
}

/// Аргументы curl для скачивания в файл.
///
/// `--max-filesize` — не жадность, а защита от «скачай вот эту ссылку», за которой гигабайты:
/// два гигабайта — предел одного шага, и о нём сказано в подсказке параметра.
fn curl_argv(url: &str, part: &str) -> Vec<String> {
    [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--proto",
        "=https,http",
        "--proto-redir",
        "=https,http",
        "--max-filesize",
        "2147483648",
        "--output",
        part,
        url,
    ]
    .iter()
    .map(|value| value.to_string())
    .collect()
}

/// Сколько читаем в один шаг. Мегабайт — уже не «файл заметок», а данные, которым место
/// в программе: показать их человеку в отчёте всё равно нельзя.
const MAX_READ_BYTES: u64 = 1024 * 1024;

/// Прочитать текстовый файл.
///
/// Доказательство — сколько байт текста действительно пришло из файла. Пустой файл — это
/// ноль байт и честный ответ; двоичный или слишком большой файл не читается вовсе, и
/// причина называется, а не прячется за «не удалось».
fn read_text(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Путь»");
    }

    let target = std::path::Path::new(&path);
    let metadata = match std::fs::metadata(target) {
        Ok(metadata) => metadata,
        Err(_) => return StepResult::failed(registry, format!("файла нет: {path}")),
    };

    if !metadata.is_file() {
        return StepResult::failed(registry, format!("это не файл, а папка: {path}"));
    }
    if metadata.len() > MAX_READ_BYTES {
        return StepResult::failed(
            registry,
            format!(
                "файл {} КБ, а читаю не больше {} КБ за шаг: такой файл открывают программой, \
                 а не помощником",
                metadata.len() / 1024,
                MAX_READ_BYTES / 1024
            ),
        );
    }

    // Сообщение готовим заранее: строку с объяснением нельзя разбить, и внутри `match`
    // она тянет за собой форматирование всего блока.
    let unreadable = format!(
        "файл не читается как текст: {path} — возможно, он двоичный или в другой кодировке"
    );
    let content = match std::fs::read_to_string(target) {
        Ok(content) => content,
        Err(_) => return StepResult::failed(registry, unreadable),
    };

    let duration_ms = started.elapsed().as_millis() as u64;
    let bytes = content.len();
    let mut result = StepResult::ok_with(
        registry,
        Evidence::FileRead {
            path: path.clone(),
            bytes,
        },
        format!("прочитано {bytes} байт: {path}"),
        duration_ms,
    );
    // В отчёт кладём начало файла и говорим, если показали не всё.
    result.stdout_tail = if content.chars().count() > DETAIL_TAIL {
        format!(
            "{}\n… (показаны первые {DETAIL_TAIL} символов из {})",
            head(&content, DETAIL_TAIL),
            content.chars().count()
        )
    } else {
        content
    };
    result
}

/// Начало строки в пределах `limit` символов — по границе символа, не байта.
fn head(text: &str, limit: usize) -> String {
    text.chars().take(limit).collect()
}

/// Потолок текста, который можно записать одним шагом.
///
/// 64 КБ — это уже не заметка, а файл, который человек не прочитает в подтверждении.
/// Большое пишут программами, а не через поле параметра.
const MAX_WRITE_BYTES: usize = 64 * 1024;

/// Записать текст в файл.
///
/// Доказательство здесь не «запись прошла без ошибки», а «файл читается обратно и в нём
/// ровно тот текст»: диск мог не принять, кодировка могла подменить символы, чужой процесс
/// мог успеть переписать файл. Поэтому после записи файл читается заново и сравнивается.
///
/// Существующий файл не трогаем без явного слова «перезаписать»: молча затереть чужую
/// работу — худшее из того, что можно сделать, помогая.
fn write_text(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));
    // Текст пишется ровно как пришёл: никаких «улучшений» по дороге — иначе обещание
    // «в файле будет то, что вы сказали» перестало бы быть правдой.
    let text = param(params, "text");

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Путь»");
    }
    if text.trim().is_empty() {
        return StepResult::failed(
            registry,
            "не задан параметр «Текст»: пустой файл — это не результат",
        );
    }
    if text.len() > MAX_WRITE_BYTES {
        return StepResult::failed(
            registry,
            format!(
                "текст {} байт, а потолок {MAX_WRITE_BYTES}: столько в подтверждении не прочитать",
                text.len()
            ),
        );
    }

    let target = std::path::Path::new(&path);
    let overwrite = matches!(param(params, "overwrite").trim(), "true" | "да" | "yes");
    if target.exists() && !overwrite {
        return StepResult::failed(
            registry,
            format!("файл уже есть: {path} — не перезаписываю без слова «перезаписать»"),
        );
    }

    // Папки по дороге создаём: «сохрани в новой папке» — обычная просьба, а не ошибка.
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                return StepResult::failed(
                    registry,
                    format!("папка для файла не создалась: {error}"),
                );
            }
        }
    }

    if let Err(error) = std::fs::write(target, text.as_bytes()) {
        return StepResult::failed(registry, format!("файл не записался: {error}"));
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    match std::fs::read_to_string(target) {
        Ok(back) => {
            let matches = back == text;
            let mut result = StepResult::ok_with(
                registry,
                Evidence::FileText {
                    path: path.clone(),
                    matches,
                },
                if matches {
                    format!("записано и прочитано обратно: {path}")
                } else {
                    format!("в файле оказалось не то, что записали: {path}")
                },
                duration_ms,
            );
            // Прочиталось другое — значит, не выполнено. Доказательство важнее отчёта.
            result.ok = matches;
            result
        }
        Err(error) => StepResult::failed(
            registry,
            format!("файл записан, но не читается обратно: {error}"),
        ),
    }
}

const MOVE_ITEM: &str = r#"$src = $env:ZS_FROM
$dst = $env:ZS_TO
if (-not (Test-Path -LiteralPath $src)) { Write-Output 'ZSHELPER-MISSING: источника нет'; exit 3 }
if (Test-Path -LiteralPath $dst) { Write-Output 'ZSHELPER-EXISTS: цель уже есть, не перезаписываю'; exit 2 }
Move-Item -LiteralPath $src -Destination $dst -ErrorAction Stop
if ((Test-Path -LiteralPath $dst) -and (-not (Test-Path -LiteralPath $src))) {
  Write-Output 'ZSHELPER-OK moved'
} else {
  Write-Output 'ZSHELPER-FAILED: после переноса состояние не сходится'
  exit 4
}"#;

/// Перенос без перезаписи. Ожидание — собственный маркер, а не «путь существует»:
/// цель могла существовать и до запуска, тогда проверка ничего бы не доказала.
fn move_item(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let from = clean_path(param(params, "from"));
    let to = clean_path(param(params, "to"));

    run_script(
        registry,
        MOVE_ITEM,
        &[("FROM", &from), ("TO", &to)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(120),
        cancel,
    )
}

const RECYCLE: &str = r#"$target = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $target)) { Write-Output 'ZSHELPER-MISSING'; exit 3 }
Add-Type -AssemblyName Microsoft.VisualBasic
if ($env:ZS_IS_DIR -eq '1') {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($target,'OnlyErrorDialogs','SendToRecycleBin')
} else {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($target,'OnlyErrorDialogs','SendToRecycleBin')
}
Write-Output 'ZSHELPER-OK'"#;

fn recycle(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let path = clean_path(param(params, "path"));
    let is_dir = std::path::Path::new(&path).is_dir();

    run_script(
        registry,
        RECYCLE,
        &[("PATH", &path), ("IS_DIR", if is_dir { "1" } else { "0" })],
        Expectation::PathAbsent(path.clone()),
        Duration::from_secs(60),
        cancel,
    )
}

const FOLDER_SIZES: &str = r#"$target = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $target)) { Write-Output 'ZSHELPER-MISSING'; exit 3 }
$files = @(Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction SilentlyContinue)
$bytes = ($files | Measure-Object -Property Length -Sum).Sum
if ($null -eq $bytes) { $bytes = 0 }
Write-Output ('ZSHELPER-OK files={0} bytes={1}' -f $files.Count, [int64]$bytes)
$files | Group-Object Extension | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object {
  Write-Output ('{0} {1}' -f $(if ($_.Name) { $_.Name } else { '(без расширения)' }), $_.Count)
}"#;

fn folder_sizes(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let path = clean_path(param(params, "path"));
    run_script(
        registry,
        FOLDER_SIZES,
        &[("PATH", &path)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(300),
        cancel,
    )
}

const FIND_BY_NAME: &str = r#"$target = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $target)) { Write-Output 'ZSHELPER-MISSING'; exit 3 }
$found = @(Get-ChildItem -LiteralPath $target -Recurse -File -Filter $env:ZS_QUERY -ErrorAction SilentlyContinue | Select-Object -First 50)
Write-Output ('ZSHELPER-OK found={0}' -f $found.Count)
$found | ForEach-Object { Write-Output $_.FullName }"#;

fn find_by_name(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let path = clean_path(param(params, "path"));
    let query = param(params, "query").trim().to_string();
    run_script(
        registry,
        FIND_BY_NAME,
        &[("PATH", &path), ("QUERY", &query)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(300),
        cancel,
    )
}

const DUPLICATES: &str = r#"$target = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $target)) { Write-Output 'ZSHELPER-MISSING'; exit 3 }
$files = @(Get-ChildItem -LiteralPath $target -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Length -gt 0 } | Select-Object -First 5000)
$groups = @($files | Get-FileHash -Algorithm SHA256 | Group-Object Hash | Where-Object { $_.Count -gt 1 })
Write-Output ('ZSHELPER-OK groups={0}' -f $groups.Count)
foreach ($group in $groups) {
  Write-Output ('--- {0} копий' -f $group.Count)
  $group.Group | ForEach-Object { Write-Output $_.Path }
}"#;

fn duplicates(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let path = clean_path(param(params, "path"));
    run_script(
        registry,
        DUPLICATES,
        &[("PATH", &path)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(600),
        cancel,
    )
}

const TOP_PROCESSES: &str = r#"$rows = @(Get-Process | Sort-Object -Property WorkingSet64 -Descending | Select-Object -First 5)
Write-Output ('ZSHELPER-OK processes={0}' -f $rows.Count)
$rows | ForEach-Object {
  Write-Output ('{0} (pid {1}): {2} МБ' -f $_.ProcessName, $_.Id, [int]($_.WorkingSet64 / 1MB))
}"#;

const COMPRESS_ARCHIVE: &str = r#"$ErrorActionPreference = 'Stop'
Compress-Archive -LiteralPath $env:ZS_PATH -DestinationPath $env:ZS_TO -CompressionLevel Optimal
Write-Output 'ZSHELPER-OK'"#;

const OPEN_SITE: &str = r#"$ErrorActionPreference = 'Stop'
$url = $env:ZS_URL
if ($url -notmatch '^https?://') {
  Write-Output 'ZSHELPER-BAD: нужна ссылка http:// или https://'
  exit 2
}
$progId = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice' -ErrorAction SilentlyContinue).ProgId
if (-not $progId) { $progId = 'обработчик не назвался' }
try {
  Start-Process -FilePath $url -ErrorAction Stop
} catch {
  Write-Output ('ZSHELPER-FAILED: ' + $_.Exception.Message)
  exit 3
}
Write-Output ('ZSHELPER-OK progid={0}' -f $progId)"#;

const EXPAND_ARCHIVE: &str = r#"$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($env:ZS_PATH, $env:ZS_TO)
Write-Output 'ZSHELPER-OK'"#;

const FREE_SPACE: &str = r#"$drives = @(Get-PSDrive -PSProvider FileSystem | Where-Object { $null -ne $_.Used })
Write-Output ('ZSHELPER-OK drives={0}' -f $drives.Count)
$drives | ForEach-Object {
  Write-Output ('{0}: свободно {1} ГБ, занято {2} ГБ' -f $_.Name, [math]::Round($_.Free / 1GB, 1), [math]::Round($_.Used / 1GB, 1))
}"#;

const SMART: &str = r#"$disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue)
Write-Output ('ZSHELPER-OK disks={0}' -f $disks.Count)
$disks | ForEach-Object {
  Write-Output ('{0}: {1}, {2} ГБ, состояние {3}' -f $_.FriendlyName, $_.MediaType, [math]::Round($_.Size / 1GB), $_.HealthStatus)
}"#;

const LAUNCH_APP: &str = r#"$exe = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $exe)) { Write-Output 'ZSHELPER-MISSING: файла нет'; exit 3 }
if ((Get-Item -LiteralPath $exe).Extension -ne '.exe') {
  Write-Output 'ZSHELPER-BAD: нужен сам .exe, а не ярлык'
  exit 2
}
try {
  $proc = Start-Process -FilePath $exe -PassThru -ErrorAction Stop
} catch {
  Write-Output ('ZSHELPER-FAILED: ' + $_.Exception.Message)
  exit 4
}
Start-Sleep -Milliseconds 1200
$alive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
if ($alive) {
  Write-Output ('ZSHELPER-OK pid={0} name={1}' -f $proc.Id, $alive.ProcessName)
} else {
  Write-Output 'ZSHELPER-FAILED: процесс завершился сразу после старта'
  exit 5
}"#;

/// Запуск программы. Ожидание — маркер после проверки, что процесс жив: «Start-Process
/// не выдал ошибку» ещё не значит, что программа открылась.
fn launch_app(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let path = clean_path(param(params, "path"));

    run_script(
        registry,
        LAUNCH_APP,
        &[("PATH", &path)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(60),
        cancel,
    )
}

const INSTALLED_APPS: &str = r#"$keys = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$apps = @(Get-ItemProperty $keys -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName } |
  Sort-Object DisplayName |
  Select-Object -First 40 DisplayName, DisplayVersion)
Write-Output ('ZSHELPER-OK apps={0}' -f $apps.Count)
$apps | ForEach-Object { Write-Output ('{0} — {1}' -f $_.DisplayName, $_.DisplayVersion) }"#;

const STARTUP: &str = r#"$items = @(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue |
  Select-Object -First 20)
Write-Output ('ZSHELPER-OK autostart={0}' -f $items.Count)
$items | ForEach-Object { Write-Output ('{0} — {1}' -f $_.Name, $_.Command) }"#;

const BATTERY: &str = r#"$batteries = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)
if ($batteries.Count -eq 0) {
  Write-Output 'ZSHELPER-OK none'
  Write-Output 'батареи нет — это настольный компьютер'
  exit 0
}
Write-Output ('ZSHELPER-OK batteries={0}' -f $batteries.Count)
$batteries | ForEach-Object {
  Write-Output ('{0}: заряд {1}%, состояние {2}' -f $_.Name, $_.EstimatedChargeRemaining, $_.BatteryStatus)
}"#;

const HARDWARE: &str = r#"$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$system = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$ram = [math]::Round($system.TotalPhysicalMemory / 1GB, 1)
Write-Output ('ZSHELPER-OK cpu={0}' -f $cpu.Name.Trim())
Write-Output ('ядра: {0}, потоки: {1}' -f $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors)
Write-Output ('память: {0} ГБ' -f $ram)
Write-Output ('система: {0}, версия {1}' -f $os.Caption, $os.Version)
Get-CimInstance Win32_VideoController | ForEach-Object {
  Write-Output ('видео: {0}' -f $_.Name)
}
Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Output ('диск: {0}, {1} ГБ, {2}' -f $_.FriendlyName, [math]::Round($_.Size / 1GB), $_.MediaType)
}"#;

const OPEN_PORTS: &str = r#"$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Sort-Object LocalPort | Select-Object -First 100)
Write-Output ('ZSHELPER-OK listeners={0}' -f $listeners.Count)
$listeners | ForEach-Object {
  $name = '?'
  try { $name = (Get-Process -Id $_.OwningProcess -ErrorAction Stop).ProcessName } catch { }
  Write-Output ('{0}:{1} — {2}' -f $_.LocalAddress, $_.LocalPort, $name)
}"#;

const CONNECTIVITY: &str = r#"$ping = Test-Connection -ComputerName 1.1.1.1 -Count 2 -Quiet -ErrorAction SilentlyContinue
$dns = $null
try { $dns = Resolve-DnsName example.com -Type A -ErrorAction Stop | Select-Object -First 1 } catch { }
Write-Output ('ZSHELPER-OK ping={0} dns={1}' -f $ping, [bool]$dns)
if ($dns) { Write-Output ('example.com → {0}' -f $dns.IPAddress) }"#;

fn simple(registry: &str, script: &str, timeout_secs: u64, cancel: &AtomicBool) -> StepResult {
    run_script(
        registry,
        script,
        &[],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(timeout_secs),
        cancel,
    )
}

/// Скрипты рук: ключ реестра и текст, который выполняется.
///
/// Нужны наружу для двух вещей: проба перед запуском (`sandbox::trial`) и проверка,
/// что собственные руки приложения не содержат того, что приложение само запрещает.
/// Ручной список нарочно: он ломается вместе с новым `match`, и это заметно.
pub fn scripts() -> Vec<(&'static str, &'static str)> {
    vec![
        ("files|переместить|файлы/папки", MOVE_ITEM),
        ("files|удалить|в корзину", RECYCLE),
        ("files|проверить|размеры и место", FOLDER_SIZES),
        ("files|найти|по имени", FIND_BY_NAME),
        ("files|распаковать|архив", EXPAND_ARCHIVE),
        ("files|сжать|в архив", COMPRESS_ARCHIVE),
        ("web|открыть|сайт", OPEN_SITE),
        ("files|проверить|дубликаты по хэшу", DUPLICATES),
        ("processes-services|показать|топ по нагрузке", TOP_PROCESSES),
        ("processes-services|проанализировать|автозапуск", STARTUP),
        ("storage-backup|проверить|свободное место", FREE_SPACE),
        ("storage-backup|проверить|SMART диска", SMART),
        ("system-power|проверить|батарею", BATTERY),
        ("hardware-diag|показать|характеристики железа", HARDWARE),
        ("network|проверить|подключение", CONNECTIVITY),
        ("network|проверить|открытые порты", OPEN_PORTS),
        (
            "apps-windows|показать|установленные программы",
            INSTALLED_APPS,
        ),
        ("apps-windows|запустить|программу", LAUNCH_APP),
    ]
}

/// Полный вывод инструмента для интерфейса — с ограничением размера.
pub fn detail(result: &StepResult) -> String {
    tail(&result.stdout_tail, DETAIL_TAIL)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::Registry;

    #[test]
    fn tools_file_parses_and_every_hand_is_described() {
        let tools = all();
        assert!(tools.len() >= 10, "«рук» не должно становиться меньше");
        for tool in tools {
            assert!(
                !tool.title.trim().is_empty(),
                "у {} нет названия",
                tool.registry
            );
            assert!(
                !tool.summary.trim().is_empty(),
                "у {} нет описания",
                tool.registry
            );
            assert!(
                !tool.implementation.trim().is_empty(),
                "у {} не сказано, чем выполняется",
                tool.registry
            );
        }
    }

    #[test]
    fn every_tool_points_at_a_real_registry_row() {
        let registry = Registry::load().expect("реестр");
        for tool in all() {
            let action = registry
                .by_key(&tool.registry)
                .unwrap_or_else(|| panic!("нет строки реестра для {}", tool.registry));
            // Контракт: инструмент не может быть безопаснее, чем сказано в реестре.
            assert!(
                !action.risk.is_forbidden_for_agent(),
                "{} помечен как {:?} — такие действия система не выполняет",
                tool.registry,
                action.risk
            );
        }
    }

    #[test]
    fn tools_and_param_names_are_unique() {
        let mut seen = std::collections::HashSet::new();
        for tool in all() {
            assert!(
                seen.insert(tool.registry.clone()),
                "дубль {}",
                tool.registry
            );
            for param in &tool.params {
                assert!(
                    param
                        .name
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_'),
                    "имя параметра {} должно быть латиницей: оно идёт в переменную окружения",
                    param.name
                );
            }
        }
    }

    #[test]
    fn missing_required_param_is_rejected_before_running() {
        let spec = spec("files|создать|папку").expect("инструмент есть");
        let empty = BTreeMap::new();
        assert!(validate(spec, &empty).is_err());

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), "   ".to_string());
        assert!(validate(spec, &params).is_err());

        params.insert("path".to_string(), "C:\\tmp".to_string());
        assert!(validate(spec, &params).is_ok());
    }

    #[test]
    fn unknown_tool_fails_without_panicking() {
        let cancel = AtomicBool::new(false);
        let result = run("files|телепортировать|себя", &BTreeMap::new(), &cancel);
        assert!(!result.ok);
        assert!(result.reason.contains("ещё нет"));
    }

    #[test]
    fn pressing_a_button_is_a_declared_hand_and_refuses_without_a_name() {
        assert!(spec("apps-windows|нажать|кнопку").is_some());
        assert!(spec("apps-windows|ввести|текст").is_some());

        let cancel = AtomicBool::new(false);
        let empty = run("apps-windows|нажать|кнопку", &BTreeMap::new(), &cancel);
        assert!(!empty.ok);
        assert!(empty.reason.contains("Имя элемента"));
    }

    #[test]
    fn typing_refuses_an_empty_text_before_touching_the_window() {
        let cancel = AtomicBool::new(false);
        let mut params = BTreeMap::new();
        params.insert("name".to_string(), "Логин".to_string());
        params.insert("text".to_string(), "   ".to_string());

        let result = run("apps-windows|ввести|текст", &params, &cancel);
        assert!(!result.ok);
        assert!(result.reason.contains("Текст"));
    }

    /// Живого окна в CI нет, поэтому проверяем второй слой честности: отказ приходит
    /// словами, а не пустым результатом. Где окно есть — тест всё равно пройдёт, но
    /// тогда причиной отказа будет уже сама система.
    #[test]
    fn a_button_that_cannot_be_pressed_says_why() {
        let cancel = AtomicBool::new(false);
        let mut params = BTreeMap::new();
        params.insert("name".to_string(), "Войти".to_string());

        let result = run("apps-windows|нажать|кнопку", &params, &cancel);
        if !result.ok {
            assert!(
                !result.reason.trim().is_empty(),
                "отказ обязан быть словами"
            );
            assert_eq!(result.evidence.kind(), "failed");
        } else {
            // Нажатие удалось: значит, есть доказательство, а не «вроде нажали».
            assert!(matches!(result.evidence.kind(), "ui_changed"));
        }
    }

    #[test]
    fn create_folder_is_idempotent() {
        let cancel = AtomicBool::new(false);
        let dir = std::env::temp_dir().join(format!("zshelper-tools-{}", std::process::id()));
        let path = dir.join("подпапка");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());

        let created = run("files|создать|папку", &params, &cancel);
        assert!(created.ok, "папка должна создаться: {}", created.reason);
        assert_eq!(created.evidence.kind(), "path_exists");

        let again = run("files|создать|папку", &params, &cancel);
        assert!(again.ok, "повторное создание идемпотентно");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Перенос проверяется на живой Windows: PowerShell есть только в job `core`.
    #[cfg(windows)]
    #[test]
    fn move_refuses_to_overwrite_and_confirms_the_move() {
        let cancel = AtomicBool::new(false);
        let dir = std::env::temp_dir().join(format!("zshelper-move-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("временная папка");
        let source = dir.join("источник.txt");
        let taken = dir.join("занято.txt");
        let free = dir.join("свободно.txt");
        std::fs::write(&source, "данные").expect("файл записан");
        std::fs::write(&taken, "чужое").expect("файл записан");

        let mut blocked = BTreeMap::new();
        blocked.insert("from".to_string(), source.to_string_lossy().to_string());
        blocked.insert("to".to_string(), taken.to_string_lossy().to_string());
        let refused = run("files|переместить|файлы/папки", &blocked, &cancel);
        assert!(!refused.ok, "цель занята — переноса быть не должно");
        assert!(source.exists(), "источник остаётся на месте");
        assert_eq!(
            std::fs::read_to_string(&taken).expect("цель читается"),
            "чужое",
            "чужой файл не перезаписан"
        );

        let mut allowed = BTreeMap::new();
        allowed.insert("from".to_string(), source.to_string_lossy().to_string());
        allowed.insert("to".to_string(), free.to_string_lossy().to_string());
        let moved = run("files|переместить|файлы/папки", &allowed, &cancel);
        assert!(moved.ok, "перенос должен подтвердиться: {}", moved.reason);
        assert_eq!(moved.evidence.kind(), "stdout_marker");
        assert!(free.exists() && !source.exists(), "файл переехал");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Запуск проверяется без побочных эффектов: файла нет — запуска быть не должно.
    #[cfg(windows)]
    #[test]
    fn launching_a_missing_program_is_refused() {
        let cancel = AtomicBool::new(false);
        let mut params = BTreeMap::new();
        params.insert(
            "path".to_string(),
            "C:\\нет-такого-файла\\программа.exe".to_string(),
        );

        let refused = run("apps-windows|запустить|программу", &params, &cancel);
        assert!(!refused.ok, "запускать нечего — это провал");
        assert_eq!(refused.evidence.kind(), "stdout_marker");
    }

    /// Временный путь, уникальный для теста: чужие тесты и запуски не должны мешать.
    fn temp_target(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zshelper-write-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("заметка.txt")
    }

    #[test]
    fn text_is_written_and_read_back_and_an_existing_file_is_not_clobbered() {
        let cancel = AtomicBool::new(false);
        let path = temp_target("notes");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());
        params.insert(
            "text".to_string(),
            "список покупок:\n- хлеб\n- молоко".to_string(),
        );

        let written = run("files|записать|текст в файл", &params, &cancel);
        assert!(written.ok, "{}", written.reason);
        assert_eq!(written.evidence.kind(), "file_text");
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "список покупок:\n- хлеб\n- молоко"
        );

        // Существующий файл без слова «перезаписать» не трогаем — и говорим об этом.
        let mut again = params.clone();
        again.insert("text".to_string(), "другое".to_string());
        let refused = run("files|записать|текст в файл", &again, &cancel);
        assert!(!refused.ok);
        assert!(refused.reason.contains("не перезаписываю"));
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "список покупок:\n- хлеб\n- молоко"
        );

        // Со словом человека — переписывает.
        again.insert("overwrite".to_string(), "true".to_string());
        let overwritten = run("files|записать|текст в файл", &again, &cancel);
        assert!(overwritten.ok, "{}", overwritten.reason);
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "другое"
        );

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn a_huge_text_is_refused_before_it_touches_the_disk() {
        let cancel = AtomicBool::new(false);
        let path = temp_target("huge");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());
        params.insert("text".to_string(), "я".repeat(MAX_WRITE_BYTES + 1));

        let refused = run("files|записать|текст в файл", &params, &cancel);

        assert!(!refused.ok);
        assert!(refused.reason.contains("потолок"));
        assert!(!path.exists(), "ничего не должно появиться на диске");

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn a_text_file_is_read_and_says_how_many_bytes_came() {
        let path = temp_target("read");
        std::fs::create_dir_all(path.parent().expect("у файла есть папка")).expect("папка");
        std::fs::write(&path, "первая строка\nвторая строка").expect("файл");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());

        let read = run(
            "files|прочитать|текст файла",
            &params,
            &AtomicBool::new(false),
        );

        assert!(read.ok, "{}", read.reason);
        assert_eq!(read.evidence.kind(), "file_read");
        assert!(
            read.stdout_tail.contains("первая строка"),
            "{}",
            read.stdout_tail
        );
        assert!(read.stdout_tail.contains("вторая строка"));

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn reading_a_missing_file_or_a_binary_one_is_refused() {
        let mut params = BTreeMap::new();
        params.insert(
            "path".to_string(),
            std::env::temp_dir()
                .join("zshelper-нет-такого-файла.txt")
                .to_string_lossy()
                .to_string(),
        );

        let missing = run(
            "files|прочитать|текст файла",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!missing.ok);
        assert!(missing.reason.contains("файла нет"));

        // Двоичный файл не выдаётся за текст: байты — не строки.
        let path = temp_target("binary");
        std::fs::create_dir_all(path.parent().expect("у файла есть папка")).expect("папка");
        std::fs::write(&path, [0xff, 0xfe, 0x00, 0x01]).expect("файл");

        let mut binary = BTreeMap::new();
        binary.insert("path".to_string(), path.to_string_lossy().to_string());
        let refused = run(
            "files|прочитать|текст файла",
            &binary,
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        assert!(refused.reason.contains("не читается как текст"));

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn a_file_over_the_read_limit_is_not_read_at_all() {
        let path = temp_target("big");
        std::fs::create_dir_all(path.parent().expect("у файла есть папка")).expect("папка");
        std::fs::write(&path, vec![b'a'; (MAX_READ_BYTES + 1) as usize]).expect("файл");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());

        let refused = run(
            "files|прочитать|текст файла",
            &params,
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        assert!(refused.reason.contains("не больше"));

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn one_replacement_is_made_and_checked_against_the_expected_text() {
        let path = temp_target("replace-one");
        std::fs::create_dir_all(path.parent().expect("у файла есть папка")).expect("папка");
        std::fs::write(&path, "цена: 100 рублей\nсрок: завтра").expect("файл");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());
        params.insert("find".to_string(), "100".to_string());
        params.insert("replace".to_string(), "150".to_string());

        let replaced = run(
            "files|заменить|текст в файле",
            &params,
            &AtomicBool::new(false),
        );

        assert!(replaced.ok, "{}", replaced.reason);
        assert_eq!(replaced.evidence.kind(), "file_text");
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "цена: 150 рублей\nсрок: завтра"
        );

        // Старого текста нет — менять нечего, и файл не трогается.
        let mut missing = params.clone();
        missing.insert("find".to_string(), "200".to_string());
        let refused = run(
            "files|заменить|текст в файле",
            &missing,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(refused.reason.contains("заменять нечего"));
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "цена: 150 рублей\nсрок: завтра"
        );

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn several_matches_need_the_word_all() {
        let path = temp_target("replace-many");
        std::fs::create_dir_all(path.parent().expect("у файла есть папка")).expect("папка");
        std::fs::write(&path, "старое и старое").expect("файл");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());
        params.insert("find".to_string(), "старое".to_string());
        params.insert("replace".to_string(), "новое".to_string());

        // Два вхождения без слова «все» — не угадываем, какое менять.
        let refused = run(
            "files|заменить|текст в файле",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(refused.reason.contains("встречается 2 раз"));
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "старое и старое"
        );

        // Со словом «все» — меняем оба и говорим, сколько.
        let mut all = params.clone();
        all.insert("all".to_string(), "true".to_string());
        let replaced = run(
            "files|заменить|текст в файле",
            &all,
            &AtomicBool::new(false),
        );

        assert!(replaced.ok, "{}", replaced.reason);
        assert!(replaced.reason.contains("заменено вхождений: 2"));
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "новое и новое"
        );

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn copying_refuses_dotdot_instead_of_guessing_what_it_means() {
        let mut params = BTreeMap::new();
        params.insert("from".to_string(), "C:\\Temp\\откуда".to_string());
        params.insert("to".to_string(), "C:\\Temp\\откуда\\..\\куда".to_string());

        let refused = run(
            "files|скопировать|файлы/папки",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(
            refused.reason.contains("полным путём"),
            "{}",
            refused.reason
        );
    }

    #[test]
    fn a_path_that_does_not_exist_yet_is_compared_by_its_parent() {
        let root = temp_target("inside")
            .parent()
            .expect("папка")
            .join("inside");
        std::fs::create_dir_all(&root).expect("папка");

        let expected = root.canonicalize().expect("папка").join("ещё").join("нет");
        assert_eq!(canonical_ish(&root.join("ещё/нет"), false), expected);
        // Источник обязан существовать: выдуманный путь не канонизируется.
        assert_eq!(
            canonical_ish(&root.join("выдумка"), true),
            root.join("выдумка")
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn inside_check_ignores_the_windows_verbatim_prefix() {
        // Именно на этом сравнение ломалось: canonicalize() даёт «\\?\C:\…».
        let inside = std::path::Path::new(r"\\?\C:\Temp\Проект\внутри");
        let source = std::path::Path::new(r"C:\Temp\Проект");

        assert_eq!(comparable(inside), "c:/temp/проект/внутри");
        assert_eq!(comparable(source), "c:/temp/проект");
        assert!(comparable(inside).starts_with(&format!("{}/", comparable(source))));
    }

    #[test]
    fn copying_a_folder_keeps_every_file_and_refuses_to_overwrite() {
        let root = temp_target("copy").parent().expect("папка").join("copy");
        std::fs::create_dir_all(root.join("откуда/вложенная")).expect("папка");
        std::fs::write(root.join("откуда/файл.txt"), "раз").expect("файл");
        std::fs::write(root.join("откуда/вложенная/два.txt"), "два-два").expect("файл");

        let mut params = BTreeMap::new();
        params.insert(
            "from".to_string(),
            root.join("откуда").to_string_lossy().to_string(),
        );
        params.insert(
            "to".to_string(),
            root.join("куда").to_string_lossy().to_string(),
        );

        let copied = run(
            "files|скопировать|файлы/папки",
            &params,
            &AtomicBool::new(false),
        );
        assert!(copied.ok, "{}", copied.reason);
        assert_eq!(copied.evidence.kind(), "path_exists");
        assert_eq!(
            std::fs::read_to_string(root.join("куда/вложенная/два.txt")).expect("файл на месте"),
            "два-два"
        );
        // Копирование — не перемещение: источник остаётся на месте.
        assert!(root.join("откуда/файл.txt").exists());

        // Цель уже есть — не затираем чужое.
        let again = run(
            "files|скопировать|файлы/папки",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!again.ok);
        assert!(again.reason.contains("уже есть"), "{}", again.reason);

        // Папка внутрь себя — отказ до первого файла, а не по факту конца диска.
        let mut inside = params.clone();
        inside.insert(
            "to".to_string(),
            root.join("откуда/внутри").to_string_lossy().to_string(),
        );
        let looped = run(
            "files|скопировать|файлы/папки",
            &inside,
            &AtomicBool::new(false),
        );
        assert!(!looped.ok);
        assert!(looped.reason.contains("внутрь себя"), "{}", looped.reason);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn copying_stops_at_a_sane_depth_instead_of_overflowing_the_stack() {
        let root = temp_target("depth").parent().expect("папка").join("depth");

        let error = copy_tree(&root.join("нет"), &root.join("куда"), 65)
            .expect_err("глубже 64 уровней копировать нельзя");
        assert!(error.contains("глубже 64 уровней"), "{error}");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn archiving_refuses_foreign_formats_occupied_names_and_empty_folders() {
        let root = temp_target("archive")
            .parent()
            .expect("папка")
            .join("archive");
        std::fs::create_dir_all(root.join("пустая")).expect("папка");
        std::fs::create_dir_all(root.join("полная")).expect("папка");
        std::fs::write(root.join("полная/файл.txt"), "текст").expect("файл");

        let mut params = BTreeMap::new();
        params.insert(
            "path".to_string(),
            root.join("полная").to_string_lossy().to_string(),
        );
        params.insert(
            "to".to_string(),
            root.join("архив.rar").to_string_lossy().to_string(),
        );

        let wrong_format = run("files|сжать|в архив", &params, &AtomicBool::new(false));
        assert!(!wrong_format.ok);
        assert!(
            wrong_format.reason.contains("только zip"),
            "{}",
            wrong_format.reason
        );

        params.insert(
            "path".to_string(),
            root.join("пустая").to_string_lossy().to_string(),
        );
        params.insert(
            "to".to_string(),
            root.join("архив.zip").to_string_lossy().to_string(),
        );
        let empty = run("files|сжать|в архив", &params, &AtomicBool::new(false));
        assert!(!empty.ok);
        assert!(empty.reason.contains("папка пуста"), "{}", empty.reason);

        // Архив с таким именем уже есть — не затираем его.
        std::fs::write(root.join("архив.zip"), "чужой архив").expect("файл");
        params.insert(
            "path".to_string(),
            root.join("полная").to_string_lossy().to_string(),
        );
        let occupied = run("files|сжать|в архив", &params, &AtomicBool::new(false));
        assert!(!occupied.ok);
        assert!(occupied.reason.contains("уже есть"), "{}", occupied.reason);
        assert_eq!(
            std::fs::read_to_string(root.join("архив.zip")).expect("файл на месте"),
            "чужой архив"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn renaming_checks_the_whole_plan_before_changing_the_first_name() {
        let root = temp_target("rename")
            .parent()
            .expect("папка")
            .join("rename");
        std::fs::create_dir_all(root.join("вложенная")).expect("папка");
        std::fs::write(root.join("отчёт 1.txt"), "раз").expect("файл");
        std::fs::write(root.join("отчёт 2.txt"), "два").expect("файл");
        std::fs::write(root.join("вложенная/отчёт 3.txt"), "три").expect("файл");
        std::fs::write(root.join("прочее.txt"), "четыре").expect("файл");

        let rules = |find: &str, replace: &str| {
            let mut params = BTreeMap::new();
            params.insert("path".to_string(), root.to_string_lossy().to_string());
            params.insert("find".to_string(), find.to_string());
            params.insert("replace".to_string(), replace.to_string());
            params
        };

        // Цель уже занята — отказ до первого переименования, и оба старых имени на месте.
        std::fs::write(root.join("итог 1.txt"), "чужой файл").expect("файл");
        let clash = run(
            "files|переименовать|массово по правилу",
            &rules("отчёт", "итог"),
            &AtomicBool::new(false),
        );
        assert!(!clash.ok);
        assert!(clash.reason.contains("уже есть"), "{}", clash.reason);
        assert!(root.join("отчёт 1.txt").exists());
        assert!(root.join("отчёт 2.txt").exists());
        std::fs::remove_file(root.join("итог 1.txt")).expect("файл");

        // Искомое равно замене — имена не изменятся, значит и делать нечего.
        let same = run(
            "files|переименовать|массово по правилу",
            &rules("отчёт", "отчёт"),
            &AtomicBool::new(false),
        );
        assert!(!same.ok);
        assert!(same.reason.contains("совпадают"), "{}", same.reason);

        let done = run(
            "files|переименовать|массово по правилу",
            &rules("отчёт", "итог"),
            &AtomicBool::new(false),
        );
        assert!(done.ok, "{}", done.reason);
        assert_eq!(done.evidence.kind(), "renamed");
        assert!(root.join("итог 1.txt").exists());
        assert!(root.join("итог 2.txt").exists());
        assert!(!root.join("отчёт 1.txt").exists());
        assert!(!root.join("отчёт 2.txt").exists());
        // Вложенную папку правило не трогает: оно про эту папку, а не про дерево.
        assert!(root.join("вложенная/отчёт 3.txt").exists());
        // Файл без совпадения остался как был.
        assert!(root.join("прочее.txt").exists());

        // Совпадений нет — «переименовывать нечего», а не молчаливый успех.
        let nothing = run(
            "files|переименовать|массово по правилу",
            &rules("нет такого", "x"),
            &AtomicBool::new(false),
        );
        assert!(!nothing.ok);
        assert!(
            nothing.reason.contains("переименовывать нечего"),
            "{}",
            nothing.reason
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn opening_a_site_refuses_foreign_schemes_before_the_browser_starts() {
        let mut params = BTreeMap::new();
        params.insert(
            "url".to_string(),
            "file:///C:/Windows/System32/calc.exe".to_string(),
        );
        let refused = run("web|открыть|сайт", &params, &AtomicBool::new(false));
        assert!(!refused.ok);
        assert!(refused.reason.contains("http"), "{}", refused.reason);

        // Без ссылки рука тоже не гадает, какой сайт имелся в виду.
        let empty = run(
            "web|открыть|сайт",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );
        assert!(!empty.ok);
    }

    #[test]
    fn the_site_script_names_the_handler_instead_of_pretending_to_know_the_page() {
        assert!(OPEN_SITE.contains("$env:ZS_URL"));
        assert!(OPEN_SITE.contains("Start-Process"));
        assert!(OPEN_SITE.contains("progid="));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "web|открыть|сайт"));
    }

    #[test]
    fn archiving_script_takes_paths_from_the_environment() {
        assert!(COMPRESS_ARCHIVE.contains("$env:ZS_PATH"));
        assert!(COMPRESS_ARCHIVE.contains("$env:ZS_TO"));
        assert!(COMPRESS_ARCHIVE.contains("ZSHELPER-OK"));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "files|сжать|в архив"));
    }

    #[test]
    fn validate_refuses_parameters_the_hand_does_not_read() {
        let spec = spec("files|создать|папку").expect("рука есть");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), "C:\\tmp".to_string());
        params.insert("пароль".to_string(), "123".to_string());

        let error = validate(spec, &params).expect_err("лишний параметр не должен проходить");
        assert!(error.contains("не понимает параметр"), "{error}");
    }

    #[test]
    fn unpacking_refuses_an_occupied_folder_and_a_missing_archive() {
        let root = temp_target("expand")
            .parent()
            .expect("папка")
            .join("unpack");
        std::fs::create_dir_all(&root).expect("папка");

        let mut params = BTreeMap::new();
        params.insert(
            "path".to_string(),
            root.join("нет-такого.zip").to_string_lossy().to_string(),
        );
        params.insert(
            "to".to_string(),
            root.join("куда").to_string_lossy().to_string(),
        );

        let missing = run("files|распаковать|архив", &params, &AtomicBool::new(false));
        assert!(!missing.ok);
        assert!(missing.reason.contains("архива нет"), "{}", missing.reason);

        // Архив есть, но папка назначения не пуста — распаковка поверх затёрла бы файлы.
        let archive = root.join("есть.zip");
        std::fs::write(&archive, "не настоящий архив").expect("файл");
        let busy = root.join("куда");
        std::fs::create_dir_all(&busy).expect("папка");
        std::fs::write(busy.join("чужое.txt"), "не трогать").expect("файл");

        params.insert("path".to_string(), archive.to_string_lossy().to_string());
        let refused = run("files|распаковать|архив", &params, &AtomicBool::new(false));
        assert!(!refused.ok);
        assert!(refused.reason.contains("не пуста"), "{}", refused.reason);
        assert_eq!(
            std::fs::read_to_string(busy.join("чужое.txt")).expect("файл на месте"),
            "не трогать"
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn unpacking_script_asks_the_zip_library_and_says_when_it_finished() {
        // Скрипт берёт путь из переменных окружения, а не из склейки: кавычка в имени
        // папки не должна стать командой.
        assert!(EXPAND_ARCHIVE.contains("$env:ZS_PATH"));
        assert!(EXPAND_ARCHIVE.contains("$env:ZS_TO"));
        assert!(EXPAND_ARCHIVE.contains("ZSHELPER-OK"));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "files|распаковать|архив"));
    }

    #[test]
    fn download_arguments_guard_against_error_pages_and_file_urls() {
        let args = curl_argv("https://example.com/a", "C:\\tmp\\a.part");

        // Без --fail ответ 404 станет «успешным» файлом с текстом ошибки внутри.
        assert!(args.contains(&"--fail".to_string()));
        // Схемы закрыты: ссылка не должна уводить curl на file://.
        assert!(args.contains(&"--proto".to_string()));
        assert!(args.contains(&"=https,http".to_string()));
        assert_eq!(
            args.last().map(String::as_str),
            Some("https://example.com/a")
        );
    }

    #[test]
    fn a_download_refuses_other_schemes_and_occupied_paths() {
        let path = temp_target("download-refuse");
        std::fs::create_dir_all(path.parent().expect("у файла есть папка")).expect("папка");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string_lossy().to_string());
        params.insert("url".to_string(), "file:///C:/Windows/win.ini".to_string());

        let refused = run(
            "web|скачать|файл по ссылке",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(refused.reason.contains("http"), "{}", refused.reason);

        // Файл уже есть — без слова «перезаписать» не трогаем и в сеть не идём.
        std::fs::write(&path, "старое").expect("файл");
        params.insert(
            "url".to_string(),
            "https://example.com/файл.bin".to_string(),
        );

        let occupied = run(
            "web|скачать|файл по ссылке",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!occupied.ok);
        assert!(occupied.reason.contains("уже есть"), "{}", occupied.reason);
        assert_eq!(
            std::fs::read_to_string(&path).expect("файл на месте"),
            "старое"
        );

        let _ = std::fs::remove_dir_all(path.parent().expect("у файла есть папка"));
    }

    #[test]
    fn a_download_without_a_link_is_refused_before_any_network() {
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), "C:\\tmp\\файл.bin".to_string());

        let refused = run(
            "web|скачать|файл по ссылке",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(refused.reason.contains("Ссылка"), "{}", refused.reason);
    }

    #[test]
    fn replacing_text_with_itself_is_refused() {
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), "C:\\tmp\\что-угодно.txt".to_string());
        params.insert("find".to_string(), "слово".to_string());
        params.insert("replace".to_string(), "слово".to_string());

        let refused = run(
            "files|заменить|текст в файле",
            &params,
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        assert!(refused.reason.contains("менять нечего"));
    }

    #[test]
    fn clean_path_strips_quotes_and_spaces() {
        assert_eq!(clean_path("  \"C:\\tmp\"  "), "C:\\tmp");
    }
}
