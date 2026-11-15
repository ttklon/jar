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
        "files|найти|по содержимому" => find_text(registry, params, cancel),
        "files|открыть|файл в программе" => {
            open_file(registry, params, cancel)
        }
        "files|открыть|архив без распаковки" => {
            list_archive(registry, params, cancel)
        }
        "learning-research|сохранить|закладку в базу знаний" => {
            save_knowledge(registry, params)
        }
        "files|сравнить|две папки" => compare_folders(registry, params),
        "network|замерить|задержку до узла" => {
            ping_host(registry, params, cancel)
        }
        "processes-services|объяснить|службу/процесс" => {
            explain_process(registry, params, cancel)
        }
        "hardware-diag|проверить|температуры" => temperatures(registry, cancel),
        "processes-services|найти|подозрительный процесс" => {
            suspicious_processes(registry, cancel)
        }
        "hardware-diag|проверить|здоровье диска" => {
            disk_health(registry, cancel)
        }
        "dev-code|запустить|тесты" => run_tests(registry, params, cancel),
        "dev-code|найти|в коде" => find_in_code(registry, params, cancel),
        "video|сжать|размер" => compress_video(registry, params, cancel),
        "virtualization-remote|передать|файл на сервер" => {
            send_to_server(registry, params, cancel)
        }
        "monitoring-triage|найти|причину тормозов" => {
            find_slowdown(registry, params, cancel)
        }
        "music-production|открыть|проект в DAW" => open_daw(registry, params, cancel),
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

    let mut result = StepResult::ok_with(
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
    );
    // Копию можно убрать обратно: источник на месте, значит откат не заденет ничего лишнего.
    if let Some(note) = remember(crate::undo::Kind::Copy, &from, &to) {
        result.reason = format!("{}; {note}", result.reason);
    }
    result
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

/// Сколько файлов в каждой папке сравниваем. Потолок назван в отчёте.
const COMPARE_MAX_FILES: usize = 20_000;

/// Список файлов папки: относительное имя (через «/») и размер.
fn folder_index(root: &std::path::Path) -> (BTreeMap<String, u64>, bool) {
    let mut index = BTreeMap::new();
    let mut stack = vec![root.to_path_buf()];

    while let Some(current) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.is_dir() {
                stack.push(path);
                continue;
            }
            let Ok(relative) = path.strip_prefix(root) else {
                continue;
            };
            let name = relative.to_string_lossy().replace('\\', "/");
            index.insert(name, metadata.len());
            if index.len() >= COMPARE_MAX_FILES {
                return (index, true);
            }
        }
    }

    (index, false)
}

/// Сравнить две папки: что совпало, что отличается, что есть только с одной стороны.
///
/// Что здесь важно:
///
///  * **сравнение по имени и размеру, а не по содержимому.** Хэши по всем файлам — это
///    чтение всего диска; для вопроса «что изменилось между бэкапами» имени и размера
///    обычно хватает, но об этой границе сказано прямо, а не умолчано;
///  * **папку с собой не сравниваем.** Ноль отличий у неё — не ответ, а тавтология;
///  * **потолок назван**: при двадцати тысячах файлов сравнение честно говорит, что
///    просмотрено не всё;
///  * **доказательство — четыре числа**: совпало, отличается, только слева, только справа.
///    «Есть отличия» ничего не даёт тому, кто ищет, что именно поменялось.
fn compare_folders(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let from = clean_path(param(params, "from"));
    let to = clean_path(param(params, "to"));

    if from.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Первая папка»");
    }
    if to.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Вторая папка»");
    }
    if has_parent_dir(&from) || has_parent_dir(&to) {
        return StepResult::failed(
            registry,
            "в пути есть «..» — назови папки полными путями, без сокращений",
        );
    }

    let left = std::path::Path::new(&from);
    let right = std::path::Path::new(&to);
    if !left.is_dir() {
        return StepResult::failed(registry, format!("это не папка: {from}"));
    }
    if !right.is_dir() {
        return StepResult::failed(registry, format!("это не папка: {to}"));
    }

    let left_text = comparable(&canonical_ish(left, false));
    let right_text = comparable(&canonical_ish(right, false));
    if left_text == right_text {
        return StepResult::failed(
            registry,
            "это одна и та же папка — сравнивать её с собой нечего",
        );
    }

    let (left_index, left_cut) = folder_index(left);
    let (right_index, right_cut) = folder_index(right);

    let mut same = 0usize;
    let mut different = 0usize;
    let mut only_left = 0usize;
    let mut only_right = 0usize;
    let mut report: Vec<String> = Vec::new();

    for (name, size) in &left_index {
        match right_index.get(name) {
            Some(other) if other == size => same += 1,
            Some(other) => {
                different += 1;
                if report.len() < 20 {
                    report.push(format!("отличается: {name} — {size} Б против {other} Б"));
                }
            }
            None => {
                only_left += 1;
                if report.len() < 20 {
                    report.push(format!("только в первой: {name} ({size} Б)"));
                }
            }
        }
    }

    for (name, size) in &right_index {
        if left_index.contains_key(name) {
            continue;
        }
        only_right += 1;
        if report.len() < 20 {
            report.push(format!("только во второй: {name} ({size} Б)"));
        }
    }

    let mut result = StepResult::ok_with(
        registry,
        Evidence::Compared {
            same,
            different,
            only_left,
            only_right,
        },
        format!(
            "совпало: {same}, отличается: {different}, только в первой: {only_left}, только во второй: {only_right} — сравнение по имени и размеру, а не по содержимому"
        ),
        started.elapsed().as_millis() as u64,
    );

    if left_cut || right_cut {
        result.reason.push_str(&format!(
            "; потолок сравнения выбран ({COMPARE_MAX_FILES} файлов на папку) — просмотрено не всё"
        ));
    }
    result.stdout_tail = report.join("\n");
    result
}

/// Что приложение знает о частых процессах — своими словами, без интернета.
///
/// Таблица нарочно короткая и честная: в ней только то, что можно сказать уверенно.
/// Всё остальное добирается фактами с машины (путь, подпись, память), а не догадками.
const PROCESS_NOTES: &[(&str, &str)] = &[
    (
        "svchost",
        "хост системных служб Windows: один процесс держит группу служб, и сам по себе он не вирус",
    ),
    (
        "explorer",
        "проводник Windows: рабочий стол, панель задач и окна папок — это он",
    ),
    (
        "dwm",
        "композитор окон Windows: рисует окна и эффекты, работает всегда",
    ),
    (
        "lsass",
        "служба безопасности Windows: проверяет вход в систему, трогать нельзя",
    ),
    ("csrss", "клиент-сервер подсистемы Windows, трогать нельзя"),
    (
        "winlogon",
        "вход в систему и блокировка экрана Windows, трогать нельзя",
    ),
    (
        "system",
        "ядро Windows в пользовательском виде: обычно это драйвер",
    ),
    (
        "antimalware service executable",
        "защитник Windows: проверяет файлы в фоне, отсюда нагрузка на диск",
    ),
    (
        "wmiprvse",
        "инструментарий Windows: через него программы узнают состояние системы",
    ),
    (
        "searchindexer",
        "индексатор поиска Windows: строит индекс файлов, отсюда нагрузка на диск",
    ),
    (
        "chrome",
        "браузер Google Chrome: вкладки и расширения — отдельные процессы",
    ),
    ("msedge", "браузер Microsoft Edge"),
    ("firefox", "браузер Firefox"),
    ("onedrive", "синхронизация OneDrive"),
    ("teams", "Microsoft Teams"),
    ("steam", "клиент Steam"),
    ("code", "редактор Visual Studio Code"),
    ("zshelper", "это само приложение"),
];

/// Пояснение к имени процесса: без учёта регистра, только по точному имени.
fn process_note(name: &str) -> Option<&'static str> {
    PROCESS_NOTES
        .iter()
        .find(|(key, _)| key.eq_ignore_ascii_case(name))
        .map(|(_, note)| *note)
}

/// Объяснить процесс или службу: факты с машины плюс пояснение из своей таблицы.
///
/// Что здесь важно:
///
///  * **факты важнее таблицы.** Путь файла, подпись и память проверяемы, а «это вирус» —
///    нет, поэтому таблица говорит только то, что известно про системные имена, и прямо
///    признаётся, когда имени в ней нет;
///  * **процесс и служба ищутся оба.** «Что это за wuauserv» — это служба, а не процесс,
///    и отвечать «не найдено» было бы неправдой;
///  * **не найдено — это отказ с причиной**, а не пустой список: человек спросил про
///    конкретное имя и должен узнать, что такого нет.
fn explain_process(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let name = param(params, "name").trim().to_string();

    if name.is_empty() {
        return StepResult::failed(registry, "не задано, о каком процессе спросить");
    }

    let mut result = run_script(
        registry,
        EXPLAIN_PROCESS,
        &[("NAME", &name)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(60),
        cancel,
    );
    if !result.ok {
        // Причина скрипта («ни процесса, ни службы») полезнее общего «признак не найден».
        let reason = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-NOTFOUND"))
            .map(|line| line.replace("ZSHELPER-NOTFOUND:", "").trim().to_string());
        if let Some(reason) = reason {
            result.reason = reason;
        }
        return result;
    }

    let found = result
        .stdout_tail
        .lines()
        .filter(|line| line.trim_start().starts_with("процесс:") || line.starts_with("служба:"))
        .count();

    let note = process_note(&name);
    let mut reason = match note {
        Some(note) => format!("«{name}» — {note}"),
        None => format!("«{name}» в моей таблице нет — вот что видно по факту"),
    };
    reason.push_str(&format!("; найдено записей: {found}, подробности ниже"));

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = reason;
    result
}

/// Найти процессы, к которым есть вопросы.
///
/// «Подозрительный» здесь значит **«есть за что зацепиться»**, а не «вирус»:
///
///  * **файл процесса лежит во временной папке или в «Загрузках»** — обычные программы
///    оттуда не запускаются, а вот распакованные «одним файлом» гадости любят это место;
///  * **подпись файла не в порядке** (`NotSigned`, `HashMismatch`, `UnknownError`) — это
///    проверяемый факт, в отличие от «выглядит странно»;
///  * **ничего не найдено — не значит «всё безопасно».** Так и сказано: список нареканий
///    пуст, а не «компьютер чист».
fn suspicious_processes(registry: &str, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let mut result = simple(registry, SUSPICIOUS_PROCESSES, 120, cancel);
    if !result.ok {
        return result;
    }

    let field = |name: &str| -> Option<usize> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<usize>().ok())
    };
    let checked = field("checked=").unwrap_or_default();
    let suspicious = field("suspicious=").unwrap_or_default();

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = if suspicious == 0 {
        format!(
            "проверено процессов: {checked} — ничего явно странного не видно; это не значит «всё безопасно»"
        )
    } else {
        format!(
            "проверено процессов: {checked}, на заметку: {suspicious} — причина названа у каждого; это факты, а не приговор"
        )
    };
    result
}

/// Отправить файл на сервер по scp — без пароля в консоли и без чужих ключей.
///
/// Правила:
///
///  * **пароль не спрашивается**: `BatchMode=yes` не даёт шагу повиснуть на приглашении,
///    которого некому набрать. Нет ключа — честный отказ с подсказкой, а не ожидание;
///  * **незнакомый хост — не наша забота**: ключи хоста рука сама не принимает
///    (`StrictHostKeyChecking` не ослаблен). Принять чужой ключ молча — это подмена сервера;
///  * **имя сервера и путь проверяются до запуска.** Пробел в «сервере» — это опечатка,
///    а не сервер, и лучше сказать об этом сразу, чем после трёх секунд тишины;
///  * **проверка — размер на той стороне**, а не «scp не выдал ошибку». Сверить не удалось —
///    так и сказано: единственное подтверждение тогда — код возврата.
fn send_to_server(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));
    let host = param(params, "host").trim().to_string();
    let remote = param(params, "remote").trim().to_string();

    if path.is_empty() {
        return StepResult::failed(registry, "не задан файл — назовите путь");
    }
    if host.is_empty() {
        return StepResult::failed(
            registry,
            "не задан сервер — нужен вид «пользователь@сервер»",
        );
    }
    let host_ok = host
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | ':' | '_' | '@'));
    if !host_ok {
        return StepResult::failed(
            registry,
            "в имени сервера есть посторонние символы — назовите адрес или имя хоста",
        );
    }
    if remote.is_empty() {
        return StepResult::failed(registry, "не задана папка на сервере — например /home/user");
    }
    let remote_ok = remote
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_' | '/' | '~'));
    if !remote_ok {
        return StepResult::failed(
            registry,
            "в пути на сервере есть посторонние символы — нужны буквы, цифры и / . - _ ~",
        );
    }

    let mut result = run_script(
        registry,
        SEND_TO_SERVER,
        &[
            ("PATH", path.as_str()),
            ("HOST", host.as_str()),
            ("REMOTE", remote.as_str()),
        ],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(330),
        cancel,
    );
    if !result.ok {
        if let Some(line) = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-FAILED"))
        {
            result.reason = line.replace("ZSHELPER-FAILED:", "").trim().to_string();
        }
        return result;
    }

    let field = |name: &str| -> Option<u64> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<u64>().ok())
    };
    let local = field("local=").unwrap_or_default();
    let remote_bytes = field("remote=").unwrap_or_default();
    let verified = field("verified=").unwrap_or_default() == 1;
    let name = result
        .stdout_tail
        .split_whitespace()
        .find_map(|word| word.strip_prefix("file="))
        .unwrap_or("файл")
        .to_string();
    let megabytes = local as f64 / (1024.0 * 1024.0);

    result.duration_ms = started.elapsed().as_millis() as u64;
    if verified && remote_bytes == local {
        result.reason = format!(
            "файл отправлен: {name} ({megabytes:.1} МБ) → {host}:{remote}; размер на той стороне совпал"
        );
    } else if verified {
        result.ok = false;
        result.reason = format!(
            "файл ушёл, но размер на той стороне другой: здесь {local} байт, там {remote_bytes} — проверьте, что записалось"
        );
    } else {
        result.reason = format!(
            "файл отправлен: {name} ({megabytes:.1} МБ) → {host}:{remote}; сверить размер на той стороне не смог — единственное подтверждение это код 0 у scp"
        );
    }
    result
}

/// Сжать видео: меньше байт, исходник цел.
///
/// Правила:
///
///  * **исходник не перезаписывается никогда.** Результат ложится рядом отдельным файлом
///    «имя (сжатое).mp4», а если такой файл уже есть — отказ: молчаливая перезапись
///    прошлого результата стоит человеку работы;
///  * **«сжато» — это про байты, а не про надежду.** Рука сравнивает размеры и говорит
///    «было X МБ, стало Y МБ, легче на Z%». Не стало легче — это неудача шага, а не успех
///    с формулировкой «готово»;
///  * **ffmpeg сам не ставится.** Нет его — рука говорит, чем поставить, и останавливается:
///    приложение ничего не устанавливает без слова человека;
///  * **грубая цель названа грубой.** Остановка по размеру (`-fs`) может срезать хвост;
///    двухпроходный расчёт по битрейту — другой, более долгий путь, и он здесь не выдан
///    за сделанное;
///  * **качество по кадрам не проверяется** (SSIM — отдельная рука), и это сказано в отчёте.
fn compress_video(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));
    let target = param(params, "target").trim().to_string();

    if path.is_empty() {
        return StepResult::failed(registry, "не задан видеофайл — назовите путь");
    }
    if !target.is_empty() {
        let megabytes = target.replace(',', ".").parse::<f64>().unwrap_or(0.0);
        if megabytes.is_nan() || megabytes <= 0.0 {
            return StepResult::failed(
                registry,
                "цель — это число мегабайт, например 25; пустое поле значит «сжимать по качеству»",
            );
        }
    }

    let mut result = run_script(
        registry,
        COMPRESS_VIDEO,
        &[("PATH", path.as_str()), ("TARGET", target.as_str())],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(960),
        cancel,
    );
    if !result.ok {
        if let Some(line) = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-FAILED"))
        {
            result.reason = line.replace("ZSHELPER-FAILED:", "").trim().to_string();
        }
        return result;
    }

    let field = |name: &str| -> Option<u64> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<u64>().ok())
    };
    let before = field("before=").unwrap_or_default();
    let after = field("after=").unwrap_or_default();
    let saved = field("saved=").unwrap_or_default();
    let name = result
        .stdout_tail
        .split_whitespace()
        .find_map(|word| word.strip_prefix("file="))
        .unwrap_or("рядом с исходником")
        .to_string();

    let megabytes = |bytes: u64| format!("{:.1}", bytes as f64 / (1024.0 * 1024.0));
    result.duration_ms = started.elapsed().as_millis() as u64;

    if saved == 0 {
        result.ok = false;
        result.reason = format!(
            "сжатие не уменьшило файл: было {} МБ, стало {} МБ — результат лежит рядом ({name}), решайте сами",
            megabytes(before),
            megabytes(after)
        );
    } else {
        let goal = if target.is_empty() {
            String::from("по качеству (CRF 23), качество по кадрам не проверялось")
        } else {
            format!("остановка по размеру на {target} МБ — это грубая цель, хвост мог срезаться")
        };
        result.reason = format!(
            "видео сжато: было {} МБ, стало {} МБ, легче на {saved}% — {name}; {goal}",
            megabytes(before),
            megabytes(after)
        );
    }
    // Сжатый файл появился рядом с исходником — значит его можно убрать обратно в корзину.
    // Записываем и когда «легче не стало»: файл-то создан, и человек вправе захотеть его убрать.
    let produced = std::path::Path::new(&path)
        .parent()
        .map(|dir| dir.join(&name))
        .unwrap_or_else(|| std::path::PathBuf::from(&name));
    if produced.exists() {
        if let Some(note) = remember(
            crate::undo::Kind::Compress,
            &path,
            &produced.to_string_lossy(),
        ) {
            result.reason = format!("{}; {note}", result.reason);
        }
    }
    result
}

/// Найти слово в исходниках проекта.
///
/// Правила:
///
///  * **слово берётся буквально** (`-SimpleMatch`): точка, звёздочка и скобка в запросе —
///    это символы, а не шаблон. Искать «a.b» и находить «axb» было бы враньём;
///  * **служебные папки пропускаются**: `node_modules`, `.git`, `target`, `dist`, `build`,
///    `bin`, `obj`, `vendor`, `.next`. Иначе ответ про свой же код утонет в чужих библиотеках;
///  * **«не нашлось» — это ответ, а не сбой.** Ноль находок выглядит как ноль, а рядом
///    написано, сколько файлов просмотрено: иначе нельзя отличить «слова нет» от «не смотрел»;
///  * **потолки названы**: двадцать тысяч файлов, до 2 МБ на файл, двадцать находок в отчёте.
fn find_in_code(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));
    let text = param(params, "text").trim().to_string();

    if text.is_empty() {
        return StepResult::failed(
            registry,
            "не задано, что искать — назовите слово или строку",
        );
    }
    if path.is_empty() {
        return StepResult::failed(registry, "не задана папка проекта");
    }

    let mut result = run_script(
        registry,
        FIND_IN_CODE,
        &[("PATH", path.as_str()), ("TEXT", text.as_str())],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(180),
        cancel,
    );
    if !result.ok {
        if let Some(line) = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-FAILED"))
        {
            result.reason = line.replace("ZSHELPER-FAILED:", "").trim().to_string();
        }
        return result;
    }

    let field = |name: &str| -> Option<usize> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<usize>().ok())
    };
    let matches = field("matches=").unwrap_or_default();
    let files = field("files=").unwrap_or_default();
    let scanned = field("scanned=").unwrap_or_default();

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = if matches == 0 {
        format!("«{text}» в коде не нашлось — просмотрено файлов: {scanned}; это ответ, а не сбой")
    } else {
        format!("«{text}»: упоминаний {matches}, файлов {files}, просмотрено {scanned}")
    };
    result
}

/// Прогнать тесты проекта и сказать, чем всё закончилось.
///
/// Правила:
///
///  * **чем запускать — решает папка, а не человек.** `package.json` — `npm test`,
///    `Cargo.toml` — `cargo test`, `pyproject.toml`/`pytest.ini`/`setup.py` —
///    `python -m pytest`, `go.mod` — `go test ./...`. Нет ни одного признака — отказ
///    с перечислением того, что искали, а не «попробую что-нибудь на удачу»;
///  * **упавшие тесты — это результат, а не сбой руки**, но шаг помечается неудачным:
///    иначе следующие шаги плана пошли бы по красному прогону как ни в чём не бывало;
///  * **потолок по времени назван.** Не уложились — прогон остановлен, и это сказано
///    прямо, а не выдано за «тесты работают».
fn run_tests(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));

    if path.is_empty() {
        return StepResult::failed(registry, "не задана папка проекта");
    }

    let mut result = run_script(
        registry,
        RUN_TESTS,
        &[("PATH", path.as_str())],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(400),
        cancel,
    );
    if !result.ok {
        // Причина скрипта («не вижу, чем…») полезнее общего «признак не найден».
        if let Some(line) = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-FAILED"))
        {
            result.reason = line.replace("ZSHELPER-FAILED:", "").trim().to_string();
        }
        return result;
    }

    let field = |name: &str| -> Option<i32> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<i32>().ok())
    };
    let code = field("exit=").unwrap_or(-1);
    let tool = result
        .stdout_tail
        .split_whitespace()
        .find_map(|word| word.strip_prefix("tool="))
        .unwrap_or("неизвестный запускатель")
        .to_string();
    let timed_out = field("timedout=").unwrap_or_default() == 1;

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.exit_code = Some(code);

    if timed_out {
        result.ok = false;
        result.timed_out = true;
        result.reason =
            format!("тесты не уложились в отведённое время — прогон {tool} остановлен, вывод ниже");
    } else if code == 0 {
        let seconds = result.duration_ms / 1000;
        result.reason = format!("тесты прошли: {tool}, код 0, за {seconds} с");
    } else {
        result.ok = false;
        result.reason = format!(
            "тесты провалились: {tool}, код {code} — это результат прогона, а не сбой руки; вывод ниже"
        );
    }
    result
}

/// Спросить у накопителей здоровье: состояние, износ, наработку.
///
/// Что здесь важно:
///
///  * **значения берутся у диска, а не выдумываются.** Диск, который не отдаёт износ,
///    получает «не сообщает», а не ноль процентов: ноль читался бы как «новый»;
///  * **прогноза нет.** «Умрёт ли мой SSD» — вопрос, на который по износу и наработке
///    честно ответить нельзя, поэтому рука даёт числа и состояние, а вывод оставляет
///    человеку;
///  * **пустой список — тоже ответ**: «машина не отдаёт сведения о накопителях».
fn disk_health(registry: &str, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let mut result = simple(registry, DISK_HEALTH, 90, cancel);
    if !result.ok {
        return result;
    }

    let disks = result
        .stdout_tail
        .split_whitespace()
        .find_map(|word| word.strip_prefix("disks="))
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or_default();

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = if disks == 0 {
        String::from("эта машина не отдаёт сведения о накопителях — проверить здоровье нечем")
    } else {
        format!("дисков: {disks} — состояние, износ и наработка ниже; прогноз эта рука не делает")
    };
    result
}

/// Спросить у машины датчики температуры.
///
/// Честность здесь в одном: «машина не сообщает температуру» — это ответ, а не сбой.
/// Многие системы отдают эти значения только со сторонними драйверами, и показать
/// вместо этого ноль градусов значило бы соврать.
fn temperatures(registry: &str, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let mut result = simple(registry, TEMPERATURES, 60, cancel);
    if !result.ok {
        return result;
    }

    let sensors = result
        .stdout_tail
        .split_whitespace()
        .find_map(|word| word.strip_prefix("sensors="))
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or_default();

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = if sensors == 0 {
        String::from("машина не сообщает температуру: датчиков нет или нужны права администратора")
    } else {
        format!("датчиков ответило: {sensors} — значения ниже")
    };
    result
}

/// Замерить задержку до узла.
///
/// Правила:
///
///  * **имя узла проверяется до запуска.** Пробелы, кавычки и прочие посторонние символы
///    не принимаются: в переменную окружения они бы ушли безопасно, но это уже не узел,
///    а опечатка, и лучше сказать об этом сразу;
///  * **«ни одного ответа» — это отказ с причиной**, а не успешный замер с нулями;
///  * **проверка — маркер в выводе и числа рядом с ним**: сколько ответов, среднее,
///    минимум и максимум. Одно число «пинг прошёл» ничего не говорит о качестве связи.
fn ping_host(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let host = param(params, "host").trim();

    if host.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Узел»");
    }
    let looks_like_host = host
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | ':' | '_'));
    if !looks_like_host {
        return StepResult::failed(
            registry,
            "в имени узла есть посторонние символы — назови адрес или имя сайта",
        );
    }

    let mut result = run_script(
        registry,
        PING_HOST,
        &[("HOST", host)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(60),
        cancel,
    );
    if !result.ok {
        // Причина скрипта («узел не ответил») полезнее общего «признак не найден».
        if let Some(line) = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-FAILED"))
        {
            result.reason = line.replace("ZSHELPER-FAILED:", "").trim().to_string();
        }
        return result;
    }

    let field = |name: &str| -> Option<u32> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<u32>().ok())
    };
    let replies = field("replies=").unwrap_or_default();
    let average = field("avg=").unwrap_or_default();
    let min = field("min=").unwrap_or_default();
    let max = field("max=").unwrap_or_default();

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = format!(
        "задержка до {host}: в среднем {average} мс (минимум {min}, максимум {max}), ответов {replies} из 4"
    );
    result
}

/// Посмотреть, что внутри zip-архива, ничего не распаковывая.
///
/// Зачем отдельная рука. «Покажи, что внутри» — вопрос, который задают до «распакуй»,
/// и отвечать на него распаковкой значит делать работу, о которой не просили.
///
/// Что здесь важно:
///
///  * **только zip.** rar и 7z требуют чужих программ, которых у нас нет; обещать
///    «любой архив» и падать на первом же rar — хуже, чем сказать это сразу;
///  * **размер после распаковки считается** — «архив на 2 МБ» и «внутри 4 ГБ» это
///    разные вещи, и вторая важнее;
///  * **ищутся пути, которые нельзя распаковывать в общую папку.** Абсолютные и с «..»
///    внутри архива — это способ разложить файлы куда угодно при распаковке (zip-slip).
///    Архив при этом не «плохой»: он просто не для распаковки вслепую, и так и сказано.
fn list_archive(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Архив»");
    }
    if has_parent_dir(&path) {
        return StepResult::failed(
            registry,
            "в пути есть «..» — назови архив полным путём, без сокращений",
        );
    }

    let archive = std::path::Path::new(&path);
    if !archive.is_file() {
        return StepResult::failed(registry, format!("это не файл: {path}"));
    }

    let extension = archive
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if extension != "zip" {
        return StepResult::failed(
            registry,
            format!("читаю только zip, а тут «.{extension}» — rar и 7z эта рука не умеет"),
        );
    }

    let mut result = run_script(
        registry,
        LIST_ARCHIVE,
        &[("PATH", &path)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(60),
        cancel,
    );
    if !result.ok {
        return result;
    }

    let field = |name: &str| -> Option<usize> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<usize>().ok())
    };
    let entries = field("entries=").unwrap_or_default();
    let dangerous = field("danger=").unwrap_or_default();

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = format!("в архиве файлов: {entries} — {path}; распаковки не было");
    if dangerous > 0 {
        result.reason.push_str(&format!(
            "; внимание: путей, которые нельзя распаковывать вслепую: {dangerous} (абсолютные или с «..»)"
        ));
    }
    result
}

/// Где лежит база знаний: рядом с логами и журналом, в `LOCALAPPDATA`.
///
/// Не в папке программы: её могут переустановить или сделать доступной только на чтение,
/// а база знаний — это данные человека, а не установочные файлы.
fn knowledge_file() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("ZShelper").join("knowledge").join("base.jsonl")
}

/// Сохранить ссылку или заметку в локальную базу знаний.
///
/// Правила:
///
///  * **одинаковое дважды не сохраняется.** База, где одна ссылка лежит пять раз,
///    отвечает на вопрос «что я сохранял» хуже, чем база без неё, — и человек не помнит,
///    какая из пяти копий настоящая;
///  * **битые и чужие строки не чинятся и не мешают**: встретили — пропустили, база
///    открыта для ручной правки;
///  * **доказательство — чтение обратно**: последняя строка файла должна быть ровно той,
///    что записали. «Файл записался без ошибки» — не доказательство, а надежда.
fn save_knowledge(registry: &str, params: &BTreeMap<String, String>) -> StepResult {
    let started = Instant::now();
    let text = param(params, "text").trim().to_string();
    let tag = param(params, "tag").trim().to_string();

    if text.is_empty() {
        return StepResult::failed(registry, "не задано, что сохранить");
    }

    let path = knowledge_file();
    if let Some(parent) = path.parent() {
        if let Err(error) = std::fs::create_dir_all(parent) {
            return StepResult::failed(registry, format!("папка базы не создалась: {error}"));
        }
    }

    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    let mut line_number = 0usize;
    for line in existing.lines().filter(|line| !line.trim().is_empty()) {
        line_number += 1;
        let Ok(saved) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        if saved.get("text").and_then(|value| value.as_str()) == Some(text.as_str()) {
            return StepResult::failed(
                registry,
                format!("это уже есть в базе ({line_number}-я строка) — второй раз не сохраняю"),
            );
        }
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|passed| passed.as_millis() as u64)
        .unwrap_or_default();
    let record = serde_json::json!({ "saved_at": stamp, "text": text, "tag": tag });
    let line = record.to_string();

    let written = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| {
            use std::io::Write;
            writeln!(file, "{line}")
        });
    if let Err(error) = written {
        return StepResult::failed(registry, format!("строка не записалась: {error}"));
    }

    let read_back = std::fs::read_to_string(&path).unwrap_or_default();
    let matches = read_back.lines().last() == Some(line.as_str());
    let where_saved = path.display().to_string();
    let total = read_back
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();

    let mut result = StepResult::ok_with(
        registry,
        Evidence::FileText {
            path: where_saved.clone(),
            matches,
        },
        format!("сохранено в базу знаний: строка {total} — {where_saved}"),
        started.elapsed().as_millis() as u64,
    );
    result.ok = matches;
    if !matches {
        result.reason = format!("после записи строка не совпала: {where_saved}");
    }
    result
}

/// Сколько байт файла ещё считается текстом. Больше — это уже не «найти строку»,
/// а чтение гигабайтов ради одной строчки.
const SEARCH_MAX_FILE: u64 = 1024 * 1024;
/// Сколько файлов просматриваем за один поиск. Потолок назван в отчёте.
const SEARCH_MAX_FILES: usize = 5_000;
/// Сколько строк с совпадением считаем. Дальше — «потолок выбран», и это сказано.
const SEARCH_MAX_HITS: usize = 50;
/// Сколько строк показываем человеку. Остальные есть в счёте.
const SEARCH_MAX_SHOWN: usize = 20;

/// Найти строку текста в файлах папки.
///
/// Правила — про честность ответа:
///
///  * **ищем текст, а не байты.** Двоичные и слишком большие файлы пропускаются и
///    считаются: «поискал везде» и «поискал в том, что похоже на текст» — разные вещи, и
///    человек должен знать, какая из них была;
///  * **потолки названы.** Файлов и строк конечное число; когда потолок выбран,
///    в отчёте сказано, что просмотрено не всё;
///  * **«нигде не встречается» — тоже ответ**, а не ошибка и не повод для повтора;
///  * **доказательство — счёт строк с совпадением и файлов.** Не «вывод без ошибки».
fn find_text(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let folder = clean_path(param(params, "path"));
    let query = param(params, "query").trim().to_string();

    if folder.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Где искать»");
    }
    if query.is_empty() {
        return StepResult::failed(
            registry,
            "не задано, что искать: пустая строка есть в любом файле",
        );
    }
    if has_parent_dir(&folder) {
        return StepResult::failed(
            registry,
            "в пути есть «..» — назови папку полным путём, без сокращений",
        );
    }

    let root = std::path::Path::new(&folder);
    if !root.is_dir() {
        return StepResult::failed(registry, format!("это не папка: {folder}"));
    }

    let needle = query.to_lowercase();
    let mut stack = vec![root.to_path_buf()];
    let mut visited = 0usize;
    let mut skipped = 0usize;
    let mut files = 0usize;
    let mut hits = 0usize;
    let mut shown: Vec<String> = Vec::new();
    let mut cut = false;

    while let Some(current) = stack.pop() {
        if cancel.load(std::sync::atomic::Ordering::Relaxed) {
            return StepResult::failed(registry, "отменено до конца поиска");
        }

        let Ok(entries) = std::fs::read_dir(&current) else {
            // Нечитаемая папка — не повод падать: она просто не просмотрена.
            skipped += 1;
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.is_dir() {
                stack.push(path);
                continue;
            }
            if !metadata.is_file() {
                continue;
            }

            visited += 1;
            if visited > SEARCH_MAX_FILES {
                cut = true;
                break;
            }
            if metadata.len() > SEARCH_MAX_FILE {
                skipped += 1;
                continue;
            }

            let Ok(bytes) = std::fs::read(&path) else {
                skipped += 1;
                continue;
            };
            let Ok(text) = String::from_utf8(bytes) else {
                skipped += 1;
                continue;
            };

            let mut matched = false;
            for (number, line) in text.lines().enumerate() {
                if hits >= SEARCH_MAX_HITS {
                    cut = true;
                    break;
                }
                if !line.to_lowercase().contains(&needle) {
                    continue;
                }
                hits += 1;
                matched = true;
                if shown.len() < SEARCH_MAX_SHOWN {
                    let excerpt: String = line.trim().chars().take(160).collect();
                    shown.push(format!("{}:{} — {excerpt}", path.display(), number + 1));
                }
            }
            if matched {
                files += 1;
            }
        }

        if cut {
            break;
        }
    }

    let mut result = StepResult::ok_with(
        registry,
        Evidence::Search { files, hits },
        format!(
            "строк с совпадением: {hits} в файлах: {files} — просмотрено {visited}, пропущено {skipped} (двоичные, большие и нечитаемые)"
        ),
        started.elapsed().as_millis() as u64,
    );

    if hits == 0 {
        result.reason =
            format!("нигде не встречается: «{query}» — просмотрено {visited}, пропущено {skipped}");
    }
    if cut {
        result.reason.push_str(&format!(
            "; потолок поиска выбран ({SEARCH_MAX_FILES} файлов, {SEARCH_MAX_HITS} строк) — просмотрено не всё"
        ));
    }
    result.stdout_tail = shown.join("\n");
    result
}

/// Открыть файл программой по умолчанию.
///
/// Что здесь важно:
///
///  * **запускаемые файлы не открываются.** `.exe`, `.bat`, `.ps1`, `.lnk` и подобное —
///    это запуск программы, а не «открыть файл». У запуска своя рука и своё подтверждение;
///    иначе «открой отчёт.pdf.exe» обошло бы его целиком;
///  * **файл обязан существовать и быть файлом** — папка открывается проводником, а это
///    другое действие;
///  * **доказательство — связь расширения назвалась**: Windows знает, какая программа
///    отвечает за это расширение. Что файл правда открылся, отсюда не проверить, и это
///    написано прямо.
fn open_file(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let path = clean_path(param(params, "path"));

    if path.is_empty() {
        return StepResult::failed(registry, "не задан параметр «Файл»");
    }
    if has_parent_dir(&path) {
        return StepResult::failed(
            registry,
            "в пути есть «..» — назови файл полным путём, без сокращений",
        );
    }

    let file = std::path::Path::new(&path);
    if !file.is_file() {
        return StepResult::failed(registry, format!("это не файл: {path}"));
    }

    let extension = file
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if LAUNCH_EXTENSIONS.contains(&extension.as_str()) {
        return StepResult::failed(
            registry,
            format!(
                "«.{extension}» — это запуск программы, а не открытие файла: для запуска есть apps-windows|запустить|программу со своим подтверждением"
            ),
        );
    }

    let mut result = run_script(
        registry,
        OPEN_FILE,
        &[("PATH", &path)],
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
        .find_map(|word| word.strip_prefix("handler="))
        .unwrap_or("связь не назвалась");

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = format!(
        "файл передан системе ({handler}): {path} — что он открылся, отсюда не проверить, это видно на экране"
    );
    result
}

/// Расширения, которые не «открываются», а запускаются. Список нарочно с запасом:
/// лучше отказать лишний раз, чем один раз запустить чужой файл без подтверждения.
const LAUNCH_EXTENSIONS: &[&str] = &[
    "exe", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "msi",
    "msp", "scr", "lnk", "url", "reg", "hta", "cpl", "jar",
];

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

    let mut result = run_script(
        registry,
        MOVE_ITEM,
        &[("FROM", &from), ("TO", &to)],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(120),
        cancel,
    );

    // Запись об откате — только после проверенного успеха: обещать вернуть то, что не
    // переехало, значит врать в отчёте. Не записалось — так и сказано в причине.
    if result.ok {
        if let Some(note) = remember(crate::undo::Kind::Move, &from, &to) {
            result.reason = format!("{}; {note}", result.reason);
        }
    }
    result
}

/// Убрать путь в корзину — так откат убирает то, что сам создал.
///
/// Идёт через ту же руку, что и «удалить в корзину»: одно место, одна проверка. Не
/// получилось — причина возвращается наружу, а не превращается в «наверное, убралось».
pub fn recycle_path(path: &str) -> Result<(), String> {
    let mut params = BTreeMap::new();
    params.insert("path".to_string(), path.to_string());
    let result = recycle("files|удалить|в корзину", &params, &AtomicBool::new(false));
    if result.ok {
        Ok(())
    } else {
        Err(result.reason)
    }
}

/// Записать дело в журнал отката. `Some(причина)` — не записалось.
///
/// Журнал может быть не открыт (тесты, утилиты) — тогда молчим: «записать некуда» в
/// причине шага выглядело бы поломкой. А вот отказ уже открытого журнала — это факт,
/// о котором человек должен знать: откат про это дело не узнает.
fn remember(kind: crate::undo::Kind, from: &str, to: &str) -> Option<String> {
    let journal = crate::undo::current()?;
    journal.record(kind, from, to).err().map(|error| {
        format!("в журнал отката не записалось ({error}) — вернуть автоматически не смогу")
    })
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

const EXPLAIN_PROCESS: &str = r#"$ErrorActionPreference = 'Stop'
$name = $env:ZS_NAME
$found = 0
foreach ($proc in @(Get-Process -Name $name -ErrorAction SilentlyContinue | Select-Object -First 3)) {
  $found += 1
  $path = ''
  try { $path = $proc.Path } catch { }
  $signature = 'путь недоступен'
  if ($path) {
    $check = Get-AuthenticodeSignature -FilePath $path -ErrorAction SilentlyContinue
    if ($check) { $signature = $check.Status }
  }
  $started = 'неизвестно'
  try { $started = $proc.StartTime.ToString('yyyy-MM-dd HH:mm') } catch { }
  Write-Output ('процесс: {0} (pid {1}), памяти {2} МБ, запущен {3}' -f $proc.ProcessName, $proc.Id, [int]($proc.WorkingSet64 / 1MB), $started)
  Write-Output ('  файл: {0}' -f $path)
  Write-Output ('  подпись: {0}' -f $signature)
}
foreach ($service in @(Get-Service -Name $name -ErrorAction SilentlyContinue)) {
  $found += 1
  Write-Output ('служба: {0} — {1}, состояние {2}' -f $service.Name, $service.DisplayName, $service.Status)
}
if ($found -eq 0) {
  Write-Output ('ZSHELPER-NOTFOUND: ни процесса, ни службы с таким именем: ' + $name)
  exit 4
}
Write-Output ('ZSHELPER-OK found={0}' -f $found)"#;

const TEMPERATURES: &str = r#"$ErrorActionPreference = 'Stop'
$rows = @()
try {
  $zones = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop)
  foreach ($zone in $zones) {
    $celsius = [math]::Round(($zone.CurrentTemperature / 10 - 273.15), 1)
    $rows += ('зона {0}: {1} °C' -f $zone.InstanceName, $celsius)
  }
} catch { }
try {
  foreach ($disk in @(Get-PhysicalDisk -ErrorAction Stop)) {
    $counter = $disk | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
    if ($null -ne $counter -and $null -ne $counter.Temperature -and $counter.Temperature -gt 0) {
      $rows += ('диск {0}: {1} °C' -f $disk.FriendlyName, $counter.Temperature)
    }
  }
} catch { }
Write-Output ('ZSHELPER-OK sensors={0}' -f $rows.Count)
if ($rows.Count -eq 0) {
  Write-Output 'эта машина не сообщает температуру: датчиков нет или нужны права администратора'
} else {
  $rows | ForEach-Object { Write-Output $_ }
}"#;
const SUSPICIOUS_PROCESSES: &str = r#"$ErrorActionPreference = 'Stop'
$signed = @{}
$rows = @()
$checked = 0
foreach ($proc in @(Get-Process -ErrorAction SilentlyContinue)) {
  if ($checked -ge 50) { break }
  $path = ''
  try { $path = $proc.Path } catch { }
  if (-not $path) { continue }
  if (-not $signed.ContainsKey($path)) {
    $status = 'неизвестно'
    try {
      $signature = Get-AuthenticodeSignature -FilePath $path -ErrorAction SilentlyContinue
      if ($signature) { $status = [string]$signature.Status }
    } catch { }
    $signed[$path] = $status
  }
  $checked += 1
  $why = @()
  if ($path -like '*\Temp\*' -or $path -like '*\Downloads\*') {
    $why += 'файл лежит во временной папке или в загрузках'
  }
  $status = $signed[$path]
  if ($status -eq 'NotSigned' -or $status -eq 'HashMismatch' -or $status -eq 'UnknownError') {
    $why += ('подпись: ' + $status)
  }
  if ($why.Count -gt 0) {
    $rows += ('{0} (pid {1}): {2} — {3}' -f $proc.ProcessName, $proc.Id, $path, ($why -join '; '))
  }
}
Write-Output ('ZSHELPER-OK checked={0} suspicious={1}' -f $checked, $rows.Count)
if ($rows.Count -eq 0) {
  Write-Output 'ничего явно странного не видно: у проверенных процессов файл на месте и подпись не вызывает вопросов'
} else {
  $rows | Select-Object -First 10 | ForEach-Object { Write-Output $_ }
}"#;

const DISK_HEALTH: &str = r#"$ErrorActionPreference = 'Stop'
$rows = @()
try {
  foreach ($disk in @(Get-PhysicalDisk -ErrorAction Stop)) {
    $counter = $disk | Get-StorageReliabilityCounter -ErrorAction SilentlyContinue
    $wear = 'не сообщает'
    $hours = 'не сообщает'
    if ($counter) {
      if ($null -ne $counter.Wear) { $wear = ('{0}%' -f $counter.Wear) }
      if ($null -ne $counter.PowerOnHours) { $hours = ('{0} ч' -f $counter.PowerOnHours) }
    }
    $rows += ('{0}: состояние {1}, износ {2}, наработка {3}, размер {4} ГБ' -f $disk.FriendlyName, $disk.HealthStatus, $wear, $hours, [math]::Round($disk.Size / 1GB))
  }
} catch { }
Write-Output ('ZSHELPER-OK disks={0}' -f $rows.Count)
if ($rows.Count -eq 0) {
  Write-Output 'эта машина не отдаёт сведения о накопителях — проверить здоровье нечем'
} else {
  $rows | Select-Object -First 10 | ForEach-Object { Write-Output $_ }
}"#;
const RUN_TESTS: &str = r#"$ErrorActionPreference = 'Stop'
$path = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $path -PathType Container)) {
  Write-Output 'ZSHELPER-FAILED: такой папки нет — проверьте путь'
  exit 2
}
$kind = ''
$file = ''
$line = ''
if (Test-Path -LiteralPath (Join-Path $path 'package.json')) {
  $kind = 'npm'; $file = 'cmd.exe'; $line = '/c npm test --silent'
} elseif (Test-Path -LiteralPath (Join-Path $path 'Cargo.toml')) {
  $kind = 'cargo'; $file = 'cargo'; $line = 'test --quiet'
} elseif ((Test-Path -LiteralPath (Join-Path $path 'pyproject.toml')) -or (Test-Path -LiteralPath (Join-Path $path 'pytest.ini')) -or (Test-Path -LiteralPath (Join-Path $path 'setup.py'))) {
  $kind = 'pytest'; $file = 'python'; $line = '-m pytest -q'
} elseif (Test-Path -LiteralPath (Join-Path $path 'go.mod')) {
  $kind = 'go'; $file = 'go'; $line = 'test ./...'
} else {
  Write-Output 'ZSHELPER-FAILED: не вижу, чем здесь запускаются тесты — нужен package.json, Cargo.toml, pyproject.toml или go.mod'
  exit 3
}
# Запуск без временных файлов: оба потока читаются задачами, поэтому прогон,
# который пишет много, не застрянет на заполненном буфере.
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.WorkingDirectory = $path
$psi.FileName = $file
$psi.Arguments = $line
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$code = -1
$timedOut = 0
$outText = ''
$errText = ''
try {
  [void]$proc.Start()
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()
  if ($proc.WaitForExit(330000)) {
    $code = $proc.ExitCode
  } else {
    $timedOut = 1
    try { $proc.Kill() } catch { }
  }
  if ($outTask.Wait(10000)) { $outText = $outTask.Result }
  if ($errTask.Wait(10000)) { $errText = $errTask.Result }
} catch {
  Write-Output ('ZSHELPER-FAILED: не удалось запустить ' + $kind + ' — ' + $_.Exception.Message)
  exit 4
}
Write-Output ('ZSHELPER-OK tool={0} exit={1} timedout={2}' -f $kind, $code, $timedOut)
$lines = @()
$lines += @($outText -split "`r?`n" | Where-Object { $_ -ne '' })
$lines += @($errText -split "`r?`n" | Where-Object { $_ -ne '' })
if ($lines.Count -eq 0) {
  Write-Output 'вывод пуст — ни одной строки'
} else {
  $lines | Select-Object -Last 15 | ForEach-Object { Write-Output $_ }
}"#;
const FIND_IN_CODE: &str = r#"$ErrorActionPreference = 'Stop'
$path = $env:ZS_PATH
$text = $env:ZS_TEXT
if (-not (Test-Path -LiteralPath $path -PathType Container)) {
  Write-Output 'ZSHELPER-FAILED: такой папки нет — проверьте путь'
  exit 2
}
$skip = '(\\|/)(node_modules|\.git|target|dist|build|bin|obj|vendor|\.next)(\\|/)'
$code = @('.rs','.ts','.tsx','.js','.jsx','.py','.go','.java','.kt','.cs','.cpp','.cc','.c','.h','.hpp','.swift','.rb','.php','.sql','.sh','.ps1','.toml','.yml','.yaml')
$files = @(Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
  $code -contains $_.Extension.ToLower() -and $_.Length -lt 2MB -and ($_.FullName -notmatch $skip)
})
$tooMany = 0
if ($files.Count -gt 20000) {
  $tooMany = $files.Count - 20000
  $files = @($files | Select-Object -First 20000)
}
$found = @()
$hitFiles = 0
foreach ($file in $files) {
  $relative = $file.FullName
  if ($relative.StartsWith($path)) {
    $relative = ($relative.Substring($path.Length) -replace '^[\\/]+', '')
  }
  $lines = @(Select-String -LiteralPath $file.FullName -Pattern $text -SimpleMatch -ErrorAction SilentlyContinue)
  if ($lines.Count -gt 0) {
    $hitFiles += 1
    foreach ($line in $lines) {
      $found += ('{0}:{1}: {2}' -f $relative, $line.LineNumber, $line.Line.Trim())
    }
  }
}
Write-Output ('ZSHELPER-OK matches={0} files={1} scanned={2} skipped={3}' -f $found.Count, $hitFiles, $files.Count, $tooMany)
if ($found.Count -eq 0) {
  Write-Output ('«{0}» в коде не нашлось — просмотрено файлов: {1}' -f $text, $files.Count)
} else {
  $found | Select-Object -First 20 | ForEach-Object { Write-Output $_ }
}"#;
const COMPRESS_VIDEO: &str = r#"$ErrorActionPreference = 'Stop'
$path = $env:ZS_PATH
$target = $env:ZS_TARGET
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
  Write-Output 'ZSHELPER-FAILED: такого файла нет — проверьте путь'
  exit 2
}
$tool = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $tool) {
  Write-Output 'ZSHELPER-FAILED: ffmpeg не установлен — сжимает видео он; поставьте его (winget install Gyan.FFmpeg) и повторите; сам ставить не буду'
  exit 3
}
$source = Get-Item -LiteralPath $path
$outName = [System.IO.Path]::GetFileNameWithoutExtension($source.Name) + ' (сжатое).mp4'
$outPath = Join-Path $source.DirectoryName $outName
if (Test-Path -LiteralPath $outPath) {
  Write-Output ('ZSHELPER-FAILED: рядом уже есть «' + $outName + '» — уберите его или переименуйте исходник; молча перезаписывать не буду')
  exit 4
}
$options = @('-hide_banner', '-loglevel', 'error', '-y', '-i', $source.FullName, '-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k')
$limited = 0
if ($target) {
  $megabytes = 0.0
  if (-not [double]::TryParse($target, [ref]$megabytes) -or $megabytes -le 0) {
    Write-Output 'ZSHELPER-FAILED: цель — это число мегабайт, например 25'
    exit 5
  }
  $limited = 1
  $options += @('-fs', [string]([int64]($megabytes * 1024 * 1024)))
}
$options += $outPath
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.WorkingDirectory = $source.DirectoryName
$psi.FileName = $tool.Source
$psi.Arguments = ($options -join ' ')
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$code = -1
$timedOut = 0
$err = ''
try {
  [void]$proc.Start()
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()
  if ($proc.WaitForExit(900000)) {
    $code = $proc.ExitCode
  } else {
    $timedOut = 1
    try { $proc.Kill() } catch { }
  }
  if ($errTask.Wait(10000)) { $err = $errTask.Result }
  if ($outTask.Wait(10000)) { [void]$outTask.Result }
} catch {
  Write-Output ('ZSHELPER-FAILED: не удалось запустить ffmpeg — ' + $_.Exception.Message)
  exit 6
}
if ($timedOut -eq 1) {
  Write-Output 'ZSHELPER-FAILED: пятнадцати минут не хватило — прогон остановлен, файл мог остаться недописанным'
  exit 7
}
if ($code -ne 0) {
  $tail = @($err -split "`r?`n" | Where-Object { $_ -ne '' } | Select-Object -Last 3) -join ' | '
  Write-Output ('ZSHELPER-FAILED: ffmpeg вернул код ' + $code + ' — ' + $tail)
  exit 8
}
$after = Get-Item -LiteralPath $outPath -ErrorAction SilentlyContinue
if (-not $after) {
  Write-Output 'ZSHELPER-FAILED: ffmpeg не оставил файла — смотрите вывод, запись не состоялась'
  exit 9
}
$before = $source.Length
$saved = [int][math]::Round((1 - ($after.Length / [double]$before)) * 100)
if ($saved -lt 0) { $saved = 0 }
Write-Output ('ZSHELPER-OK file=' + $outName + ' before=' + $before + ' after=' + $after.Length + ' saved=' + $saved + ' limited=' + $limited)
if ($saved -eq 0) {
  Write-Output ('сжатие не уменьшило файл: было ' + $before + ' байт, стало ' + $after.Length)
} else {
  Write-Output ('было ' + $before + ' байт, стало ' + $after.Length + ' — легче на ' + $saved + '%')
}"#;
const SEND_TO_SERVER: &str = r#"$ErrorActionPreference = 'Stop'
$path = $env:ZS_PATH
$hostName = $env:ZS_HOST
$remote = $env:ZS_REMOTE
if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
  Write-Output 'ZSHELPER-FAILED: такого файла нет — проверьте путь'
  exit 2
}
$scp = Get-Command scp -ErrorAction SilentlyContinue
if (-not $scp) {
  Write-Output 'ZSHELPER-FAILED: scp не установлен — на Windows это «Дополнительные компоненты → Клиент OpenSSH»; сам ставить не буду'
  exit 3
}
$source = Get-Item -LiteralPath $path
$folder = $remote.TrimEnd('/')
$target = $hostName + ':' + $folder + '/' + $source.Name
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.FileName = $scp.Source
$psi.Arguments = (@('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15', ('"' + $source.FullName + '"'), ('"' + $target + '"')) -join ' ')
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$timedOut = 0
try {
  [void]$proc.Start()
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()
  if (-not $proc.WaitForExit(300000)) {
    $timedOut = 1
    try { $proc.Kill() } catch { }
  }
  $outText = ''
  $errText = ''
  if ($outTask.Wait(10000)) { $outText = $outTask.Result }
  if ($errTask.Wait(10000)) { $errText = $errTask.Result }
} catch {
  Write-Output ('ZSHELPER-FAILED: не удалось запустить scp — ' + $_.Exception.Message)
  exit 4
}
if ($timedOut -eq 1) {
  Write-Output 'ZSHELPER-FAILED: пять минут без ответа — отправка остановлена; дошёл файл или нет, отсюда не видно'
  exit 5
}
if ($proc.ExitCode -ne 0) {
  $tail = @((@($outText, $errText) -join "`n") -split "`r?`n" | Where-Object { $_ -ne '' } | Select-Object -Last 2) -join ' | '
  Write-Output ('ZSHELPER-FAILED: scp не смог отправить (код ' + $proc.ExitCode + ') — ' + $tail)
  exit 6
}
$local = $source.Length
$remoteBytes = 0
$verified = 0
$ssh = Get-Command ssh -ErrorAction SilentlyContinue
if ($ssh) {
  $command = "wc -c < '" + $folder + '/' + $source.Name + "'"
  $checkPsi = New-Object System.Diagnostics.ProcessStartInfo
  $checkPsi.UseShellExecute = $false
  $checkPsi.RedirectStandardOutput = $true
  $checkPsi.RedirectStandardError = $true
  $checkPsi.FileName = $ssh.Source
  $checkPsi.Arguments = (@('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', $hostName, ('"' + $command + '"')) -join ' ')
  $check = New-Object System.Diagnostics.Process
  $check.StartInfo = $checkPsi
  try {
    [void]$check.Start()
    $checkOut = $check.StandardOutput.ReadToEndAsync()
    $checkErr = $check.StandardError.ReadToEndAsync()
    if ($check.WaitForExit(60000)) {
      $text = ''
      if ($checkOut.Wait(5000)) { $text = $checkOut.Result }
      if ($checkErr.Wait(5000)) { [void]$checkErr.Result }
      $trimmed = $text.Trim()
      if ($check.ExitCode -eq 0 -and $trimmed -match '^\d+$') {
        $remoteBytes = [int64]$trimmed
        $verified = 1
      }
    } else {
      try { $check.Kill() } catch { }
    }
  } catch { }
}
Write-Output ('ZSHELPER-OK file=' + $source.Name + ' local=' + $local + ' remote=' + $remoteBytes + ' verified=' + $verified)
if ($verified -eq 1 -and $remoteBytes -eq $local) {
  Write-Output ('размер на той стороне совпал: ' + $local + ' байт')
} elseif ($verified -eq 1) {
  Write-Output ('размер на той стороне другой: здесь ' + $local + ', там ' + $remoteBytes)
} else {
  Write-Output 'размер на той стороне сверить не удалось — единственное подтверждение это код 0 у scp'
}"#;

const PING_HOST: &str = r#"$ErrorActionPreference = 'Stop'const PING_HOST: &str = r#"$ErrorActionPreference = 'Stop'
$node = $env:ZS_HOST
$answers = @(Test-Connection -ComputerName $node -Count 4 -ErrorAction SilentlyContinue)
if ($answers.Count -eq 0) {
  Write-Output 'ZSHELPER-FAILED: узел не ответил ни разу'
  exit 3
}
$times = @($answers | ForEach-Object {
  if ($null -ne $_.ResponseTime) { $_.ResponseTime } else { $_.Latency }
})
$avg = [int]($times | Measure-Object -Average).Average
$min = [int]($times | Measure-Object -Minimum).Minimum
$max = [int]($times | Measure-Object -Maximum).Maximum
Write-Output ('ZSHELPER-OK replies={0} avg={1} min={2} max={3}' -f $answers.Count, $avg, $min, $max)"#;

const LIST_ARCHIVE: &str = r#"$ErrorActionPreference = 'Stop'
$archive = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) {
  Write-Output 'ZSHELPER-MISSING: архива нет'
  exit 3
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
try {
  $entries = @($zip.Entries)
  $total = ($entries | Measure-Object -Property Length -Sum).Sum
  if ($null -eq $total) { $total = 0 }
  $danger = @($entries | Where-Object {
    $_.FullName.StartsWith('/') -or $_.FullName.StartsWith('\') -or
    $_.FullName.Contains('../') -or $_.FullName.Contains('..\') -or
    $_.FullName.Contains(':')
  })
  Write-Output ('ZSHELPER-OK entries={0} bytes={1} danger={2}' -f $entries.Count, [int64]$total, $danger.Count)
  Write-Output ('файлов: {0}, после распаковки: {1} МБ' -f $entries.Count, [math]::Round($total / 1MB, 1))
  $entries | Sort-Object -Property Length -Descending | Select-Object -First 10 | ForEach-Object {
    Write-Output ('{0} — {1} КБ' -f $_.FullName, [int]($_.Length / 1KB))
  }
  if ($danger.Count -gt 0) {
    Write-Output 'ВНИМАНИЕ: такие пути нельзя распаковывать в общую папку:'
    $danger | Select-Object -First 5 | ForEach-Object { Write-Output ('  ' + $_.FullName) }
  }
} finally {
  $zip.Dispose()
}"#;

const OPEN_FILE: &str = r#"$ErrorActionPreference = 'Stop'
$file = $env:ZS_PATH
if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
  Write-Output 'ZSHELPER-MISSING: файла нет'
  exit 3
}
$extension = [System.IO.Path]::GetExtension($file)
$handler = 'связь не назвалась'
if ($extension) {
  $progId = (Get-ItemProperty ('Registry::HKEY_CLASSES_ROOT\' + $extension) -ErrorAction SilentlyContinue).'(default)'
  if ($progId) { $handler = $progId }
}
try {
  Start-Process -FilePath $file -ErrorAction Stop
} catch {
  Write-Output ('ZSHELPER-FAILED: ' + $_.Exception.Message)
  exit 4
}
Write-Output ('ZSHELPER-OK handler={0}' -f $handler)"#;

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

const SNAPSHOT: &str = r#"$ErrorActionPreference = 'Stop'
$hours = 24
$parsed = 0
if ([int]::TryParse($env:ZS_HOURS, [ref]$parsed) -and $parsed -gt 0) {
  if ($parsed -gt 168) { $parsed = 168 }
  $hours = $parsed
}
$top = 3
$parsedTop = 0
if ([int]::TryParse($env:ZS_TOP, [ref]$parsedTop) -and $parsedTop -gt 0) {
  if ($parsedTop -gt 10) { $parsedTop = 10 }
  $top = $parsedTop
}
# Только чтение: ни служб, ни автозапуска, ни файлов эта рука не меняет.
$procs = @(Get-Process -ErrorAction SilentlyContinue)
$procs = @($procs | Where-Object { $_.Id -ne 0 })
$byCpu = @($procs | Where-Object { $null -ne $_.CPU } | Sort-Object CPU -Descending | Select-Object -First $top)
$byRam = @($procs | Where-Object { $null -ne $_.WorkingSet64 } | Sort-Object WorkingSet64 -Descending | Select-Object -First $top)
$cpuTop = (@($byCpu | ForEach-Object { $_.ProcessName + ':' + [int]$_.CPU }) -join ',')
$ramTop = (@($byRam | ForEach-Object { $_.ProcessName + ':' + [int]($_.WorkingSet64 / 1MB) }) -join ',')
$cpu = ''
try {
  $load = @(Get-CimInstance Win32_Processor -ErrorAction Stop | Where-Object { $null -ne $_.LoadPercentage })
  if ($load.Count -gt 0) {
    $average = [int][math]::Round((($load | Measure-Object -Property LoadPercentage -Average).Average))
    $cpu = [string]$average
  }
} catch { $cpu = '' }
$ramUsed = ''
$ramTotal = ''
$uptime = ''
try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  if ($null -ne $os) {
    $ramUsed = [string][math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1048576, 1)
    $ramTotal = [string][math]::Round($os.TotalVisibleMemorySize / 1048576, 1)
    $span = (Get-Date) - $os.LastBootUpTime
    $uptime = [string][int][math]::Floor($span.TotalHours)
  }
} catch { }
$running = 0
$total = 0
$autoStopped = 0
try {
  $services = @(Get-CimInstance Win32_Service -ErrorAction Stop)
  $total = $services.Count
  $running = @($services | Where-Object { $_.State -eq 'Running' }).Count
  $autoStopped = @($services | Where-Object { $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' }).Count
} catch { }
$autostart = 0
try { $autostart = @(Get-CimInstance Win32_StartupCommand -ErrorAction Stop).Count } catch { $autostart = -1 }
$diskFree = ''
$diskTotal = ''
try {
  $letter = $env:SystemDrive
  if (-not $letter) { $letter = 'C:' }
  $drive = Get-PSDrive -Name $letter.TrimEnd(':') -ErrorAction Stop
  $diskFree = [string][math]::Round($drive.Free / 1GB, 1)
  $diskTotal = [string][math]::Round(($drive.Used + $drive.Free) / 1GB, 1)
} catch { }
$netUp = -1
try { $netUp = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' }).Count } catch { $netUp = -1 }
# -1 значит «не прочиталось»: ноль ошибок и «журнал не открылся» — разные вещи.
$events = -1
$since = (Get-Date).AddHours(-$hours)
try {
  $found = @(Get-WinEvent -FilterHashtable @{LogName = 'System'; Level = 1, 2; StartTime = $since} -MaxEvents 200 -ErrorAction Stop)
  $events = $found.Count
} catch {
  if ($_.Exception.Message -like '*No events were found*' -or $_.FullyQualifiedErrorId -like '*NoMatchingEventsFound*') {
    $events = 0
  } else {
    $events = -1
  }
}
$line = 'ZSHELPER-OK procs=' + $procs.Count + ' cpu=' + $cpu + ' ram_used=' + $ramUsed + ' ram_total=' + $ramTotal
$line = $line + ' top_cpu=' + $cpuTop + ' top_ram=' + $ramTop
$line = $line + ' services=' + $running + '/' + $total + ' auto_stopped=' + $autoStopped + ' autostart=' + $autostart
$line = $line + ' disk_free=' + $diskFree + ' disk_total=' + $diskTotal + ' net_up=' + $netUp
$line = $line + ' events=' + $events + ' hours=' + $hours + ' uptime_h=' + $uptime
Write-Output $line
"#;

/// Снимок производительности: процессы, службы, автозапуск, диск, сеть и журнал.
///
/// Что здесь важно:
///
///  * **только чтение.** Рука ничего не останавливает и не выключает — иначе «снимок» был бы
///    действием, а действию нужен план и откат;
///  * **`-1` это «не прочиталось»**, а не ноль. «Ошибок в журнале нет» и «журнал не открылся» —
///    разные утверждения, и путать их в отчёте значит врать;
///  * **потолки названы числом**: окно журнала до 168 часов (неделя), процессов в списке до 10,
///    событий читается не больше 200 — «не меньше 200» так и говорится.
fn find_slowdown(
    registry: &str,
    params: &BTreeMap<String, String>,
    cancel: &AtomicBool,
) -> StepResult {
    let started = Instant::now();
    let raw_hours = param(params, "hours").trim().to_string();
    let raw_top = param(params, "top").trim().to_string();
    let mut hours = 24u64;
    if !raw_hours.is_empty() {
        match raw_hours.parse::<u64>() {
            Ok(value) if (1..=168).contains(&value) => hours = value,
            _ => {
                return StepResult::failed(
                    registry,
                    "окно журнала — это часы от 1 до 168 (неделя); больше недели журнал не отдаю — слишком много шума",
                )
            }
        }
    }
    let mut top = 3u64;
    if !raw_top.is_empty() {
        match raw_top.parse::<u64>() {
            Ok(value) if (1..=10).contains(&value) => top = value,
            _ => {
                return StepResult::failed(
                    registry,
                    "сколько процессов показывать — это число от 1 до 10; больше десяти в снимке не читается",
                )
            }
        }
    }

    let mut result = run_script(
        registry,
        SNAPSHOT,
        &[("HOURS", &hours.to_string()), ("TOP", &top.to_string())],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(120),
        cancel,
    );
    if !result.ok {
        if let Some(line) = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-FAILED"))
        {
            result.reason = line.replace("ZSHELPER-FAILED:", "").trim().to_string();
        }
        return result;
    }

    let line = match result
        .stdout_tail
        .lines()
        .find(|line| line.contains("ZSHELPER-OK"))
    {
        Some(line) => line.to_string(),
        None => {
            result.ok = false;
            result.reason =
                "снимок собрался, но строки с числами в выводе нет — смотрите полный вывод"
                    .to_string();
            return result;
        }
    };
    match parse_snapshot(&line) {
        Some(snapshot) => {
            result.reason = format!(
                "{}; {}",
                snapshot_verdict(&snapshot),
                snapshot_reason(&snapshot)
            );
            // Маркер уже проверен, но пусть в доказательстве будет сама строка с числами.
            result.evidence = Evidence::StdoutMarker {
                marker: "ZSHELPER-OK".to_string(),
                found: true,
            };
        }
        None => {
            result.ok = false;
            result.reason =
                "снимок собрался, но разобрать его не вышло — смотрите полный вывод".to_string();
        }
    }
    result.duration_ms = started.elapsed().as_millis() as u64;
    result
}

const OPEN_DAW: &str = r#"$ErrorActionPreference = 'Stop'
$wanted = $env:ZS_PROGRAM
$project = $env:ZS_PROJECT
if ($project -and -not (Test-Path -LiteralPath $project -PathType Leaf)) {
  Write-Output 'ZSHELPER-FAILED: такого проекта нет — проверьте путь до запуска, чтобы не открывать пустоту'
  exit 2
}
$known = @(
  @{ name = 'FL Studio'; pattern = 'FL*.exe'; install = '*FL Studio*' },
  @{ name = 'REAPER'; pattern = 'reaper.exe'; install = '*REAPER*' },
  @{ name = 'Ableton Live'; pattern = 'Ableton Live*.exe'; install = '*Ableton Live*' },
  @{ name = 'Cubase'; pattern = 'Cubase*.exe'; install = '*Cubase*' },
  @{ name = 'Nuendo'; pattern = 'Nuendo*.exe'; install = '*Nuendo*' },
  @{ name = 'Studio One'; pattern = 'Studio One.exe'; install = '*Studio One*' },
  @{ name = 'Bitwig Studio'; pattern = 'Bitwig Studio.exe'; install = '*Bitwig*' },
  @{ name = 'Reason'; pattern = 'Reason.exe'; install = '*Reason*' },
  @{ name = 'Renoise'; pattern = 'Renoise.exe'; install = '*Renoise*' },
  @{ name = 'LMMS'; pattern = 'lmms.exe'; install = '*LMMS*' }
)
$appPaths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths'
)
$uninstall = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
)
function Find-InAppPaths([string]$pattern) {
  foreach ($root in $appPaths) {
    try { $keys = @(Get-ChildItem -Path $root -ErrorAction Stop | Where-Object { $_.PSChildName -like $pattern }) } catch { continue }
    foreach ($key in $keys) {
      try { $props = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction Stop } catch { continue }
      $path = $props.'(default)'
      if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) { return [string]$path }
    }
  }
  return $null
}
function Find-InInstall([string]$installPattern, [string]$exePattern) {
  foreach ($root in $uninstall) {
    try { $apps = @(Get-ChildItem -Path $root -ErrorAction Stop) } catch { continue }
    foreach ($app in $apps) {
      try { $props = Get-ItemProperty -LiteralPath $app.PSPath -ErrorAction Stop } catch { continue }
      if (-not $props.DisplayName) { continue }
      if ($props.DisplayName -notlike $installPattern) { continue }
      if (-not $props.InstallLocation) { continue }
      if (-not (Test-Path -LiteralPath $props.InstallLocation)) { continue }
      try { $hit = @(Get-ChildItem -LiteralPath $props.InstallLocation -Filter '*.exe' -ErrorAction Stop | Where-Object { $_.Name -like $exePattern } | Select-Object -First 1) } catch { continue }
      if ($hit.Count -gt 0) { return [string]$hit[0].FullName }
    }
  }
  return $null
}
$found = $null
$foundName = ''
$chosen = @($known)
if ($wanted) {
  $chosen = @($known | Where-Object { $_.name -like ('*' + $wanted + '*') })
  if ($chosen.Count -eq 0) {
    Write-Output ('ZSHELPER-FAILED: «' + $wanted + '» нет в списке известных — я знаю: ' + (($known | ForEach-Object { $_.name }) -join ', '))
    exit 3
  }
}
foreach ($daw in $chosen) {
  $exe = Find-InAppPaths $daw.pattern
  if (-not $exe) { $exe = Find-InInstall $daw.install $daw.pattern }
  if ($exe) { $found = $exe; $foundName = $daw.name; break }
}
if (-not $found) {
  Write-Output ('ZSHELPER-FAILED: ни одна DAW не найдена — проверил известных: ' + $known.Count + ' (' + (($known | ForEach-Object { $_.name }) -join ', ') + '); открывать нечего, и ставить сам не буду')
  exit 4
}
$arguments = @()
if ($project) { $arguments = @('"' + $project + '"') }
$started = Get-Date
try {
  [void](Start-Process -FilePath $found -ArgumentList $arguments -PassThru -ErrorAction Stop)
} catch {
  Write-Output ('ZSHELPER-FAILED: не удалось запустить «' + $foundName + '» — ' + $_.Exception.Message)
  exit 5
}
$processName = [System.IO.Path]::GetFileNameWithoutExtension($found)
$alive = 0
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  if (Get-Process -Name $processName -ErrorAction SilentlyContinue) { $alive = 1; break }
}
$millis = [int](((Get-Date) - $started).TotalMilliseconds)
if ($alive -eq 0) {
  Write-Output ('ZSHELPER-FAILED: «' + $foundName + '» запущен, но процесс ' + $processName + ' не поднялся за 10 секунд — смотрите, не ругается ли он сам')
  exit 6
}
Write-Output ('ZSHELPER-OK found=1 checked=' + $known.Count + ' alive=' + $alive + ' millis=' + $millis)
Write-Output ('ZSHELPER-DAW name=' + $foundName)
Write-Output ('ZSHELPER-DAW exe=' + $found)
if ($project) { Write-Output ('ZSHELPER-DAW project=' + $project) }
"#;

/// Открыть проект в DAW: найти установленную программу и запустить её.
///
/// Почему так, а не «нажать кнопку в интерфейсе»:
///
///  * **поиск честный и названный.** Рука смотрит App Paths и записи установки и говорит,
///    сколько известных DAW проверила; не нашлась — отказ с числом, а не пустое «не вышло»;
///  * **проверка после запуска — процесс**, а не код возврата `Start-Process`: «запуск удался»,
///    а процесса нет — так бывает, и отчёт это не скрывает;
///  * **проект проверяется до запуска.** Открыть пустоту вместо проекта — худший вид «успеха»;
///  * **ничего не устанавливает и не сохраняет**: открыть — не значит перезаписать проект.
fn open_daw(registry: &str, params: &BTreeMap<String, String>, cancel: &AtomicBool) -> StepResult {
    let started = Instant::now();
    let program = param(params, "program").trim().to_string();
    let project = clean_path(param(params, "project"));

    if !project.is_empty() && !std::path::Path::new(&project).is_file() {
        return StepResult::failed(
            registry,
            format!(
                "такого проекта нет: {project} — проверьте путь до запуска, чтобы не открывать пустоту"
            ),
        );
    }

    let mut result = run_script(
        registry,
        OPEN_DAW,
        &[("PROGRAM", program.as_str()), ("PROJECT", project.as_str())],
        Expectation::StdoutMarker("ZSHELPER-OK"),
        Duration::from_secs(120),
        cancel,
    );
    if !result.ok {
        if let Some(line) = result
            .stdout_tail
            .lines()
            .find(|line| line.contains("ZSHELPER-FAILED"))
        {
            result.reason = line.replace("ZSHELPER-FAILED:", "").trim().to_string();
        }
        return result;
    }

    let numbers = |name: &str| -> Option<u64> {
        result
            .stdout_tail
            .split_whitespace()
            .find_map(|word| word.strip_prefix(name))
            .and_then(|value| value.parse::<u64>().ok())
    };
    // Значения с пробелами берутся целиком из строки — разбор по словам их бы разрезал.
    let value = |prefix: &str| -> Option<String> {
        result.stdout_tail.lines().find_map(|line| {
            line.trim()
                .strip_prefix(prefix)
                .map(|rest| rest.trim().to_string())
                .filter(|rest| !rest.is_empty())
        })
    };
    let checked = numbers("checked=").unwrap_or_default();
    let millis = numbers("millis=").unwrap_or_default();
    let seconds = format!("{:.1}", millis as f64 / 1000.0);
    let name = value("ZSHELPER-DAW name=").unwrap_or_else(|| "DAW".to_string());
    let exe = value("ZSHELPER-DAW exe=").unwrap_or_default();

    result.duration_ms = started.elapsed().as_millis() as u64;
    result.reason = if project.is_empty() {
        format!(
            "открыт {name}: {exe} — процесс поднялся за {seconds} с; известных DAW проверено: {checked}, проект не передавался"
        )
    } else {
        let file = std::path::Path::new(&project)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| project.clone());
        format!(
            "открыт {name}: {exe} — процесс поднялся за {seconds} с, проект «{file}» передан; известных DAW проверено: {checked}"
        )
    };
    result
}

/// Снимок, разобранный в числа. `Option` — потому что «не прочиталось» это не ноль.
#[derive(Debug, Default, PartialEq, Eq)]
struct Snapshot {
    procs: u64,
    cpu: Option<u64>,
    ram_used: Option<String>,
    ram_total: Option<String>,
    top_cpu: Vec<String>,
    top_ram: Vec<String>,
    services_running: Option<u64>,
    services_total: Option<u64>,
    auto_stopped: Option<u64>,
    autostart: Option<u64>,
    disk_free: Option<String>,
    disk_total: Option<String>,
    net_up: Option<u64>,
    events: Option<u64>,
    hours: u64,
    uptime_h: Option<u64>,
}

/// Разобрать строку маркера. `None` — если в строке нет самого маркера.
fn parse_snapshot(line: &str) -> Option<Snapshot> {
    if !line.contains("ZSHELPER-OK") {
        return None;
    }
    let field = |name: &str| -> Option<&str> {
        line.split_whitespace()
            .find_map(|word| word.strip_prefix(name))
    };
    // `-1` не разбирается как `u64` и честно даёт `None` — «не прочиталось», а не «ноль».
    let number = |name: &str| -> Option<u64> { field(name).and_then(|v| v.parse::<u64>().ok()) };
    let text = |name: &str| -> Option<String> {
        field(name)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    };
    let list = |name: &str| -> Vec<String> {
        field(name)
            .map(|value| {
                value
                    .split(',')
                    .filter(|item| !item.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    };
    let services = field("services=").and_then(|value| {
        let (running, total) = value.split_once('/')?;
        Some((running.parse::<u64>().ok()?, total.parse::<u64>().ok()?))
    });
    Some(Snapshot {
        procs: number("procs=").unwrap_or_default(),
        cpu: number("cpu="),
        ram_used: text("ram_used="),
        ram_total: text("ram_total="),
        top_cpu: list("top_cpu="),
        top_ram: list("top_ram="),
        services_running: services.map(|pair| pair.0),
        services_total: services.map(|pair| pair.1),
        auto_stopped: number("auto_stopped="),
        autostart: number("autostart="),
        disk_free: text("disk_free="),
        disk_total: text("disk_total="),
        net_up: number("net_up="),
        events: number("events="),
        hours: number("hours=").unwrap_or(24),
        uptime_h: number("uptime_h="),
    })
}

/// Гипотеза о причине: сверка чисел между собой. Не диагноз — говорит, на что смотреть.
///
/// Пороги названы числом, а не «сильно загружен»: 80% процессора, 85% памяти, и `count > 0`
/// ошибок в журнале. Иначе вердикт нельзя ни проверить, ни оспорить.
fn snapshot_verdict(snapshot: &Snapshot) -> String {
    let mut verdicts: Vec<String> = Vec::new();
    if let Some(cpu) = snapshot.cpu {
        if cpu >= 80 {
            verdicts.push(format!("процессор занят на {cpu}% — упирается в процессор"));
        }
    }
    let ram_share = match (&snapshot.ram_used, &snapshot.ram_total) {
        (Some(used), Some(total)) => match (used.parse::<f64>(), total.parse::<f64>()) {
            (Ok(used), Ok(total)) if total > 0.0 => Some((used, total, used / total)),
            _ => None,
        },
        _ => None,
    };
    if let Some((used, total, share)) = ram_share {
        if share >= 0.85 {
            push_ram_share(used, total, share, &mut verdicts);
        }
    }
    // Один и тот же процесс в обоих списках — самый заметный подозреваемый.
    let heavy: Vec<&String> = snapshot
        .top_ram
        .iter()
        .filter(|entry| {
            let name = entry.split(':').next().unwrap_or(entry);
            snapshot
                .top_cpu
                .iter()
                .any(|other| other.split(':').next().unwrap_or(other) == name)
        })
        .collect();
    if let Some(entry) = heavy.first() {
        let name = entry.split(':').next().unwrap_or(entry);
        let megabytes = entry.split(':').nth(1).unwrap_or("");
        verdicts.push(format!(
            "{name} — и по памяти, и по процессору впереди: {megabytes} МБ"
        ));
    }
    if let Some(events) = snapshot.events {
        if events > 0 {
            verdicts.push(format!(
                "ошибок в журнале системы за {} ч: {events} — что-то падает и перезапускается",
                snapshot.hours
            ));
        }
    }
    if verdicts.is_empty() {
        let cpu = match snapshot.cpu {
            Some(cpu) => format!("процессор {cpu}%"),
            None => "процессор не прочитался".to_string(),
        };
        let ram = match &ram_share {
            Some((used, total, _)) => format!("память {used} из {total} ГБ"),
            None => "память не прочиталась".to_string(),
        };
        return format!(
            "явной перегрузки не видно: {cpu}, {ram} — тормоза не в этих числах, смотрите диск и сеть"
        );
    }
    format!(
        "{}; это гипотеза по числам, а не диагноз",
        verdicts.join("; ")
    )
}

fn push_ram_share(used: f64, total: f64, share: f64, into: &mut Vec<String>) {
    into.push(format!(
        "память занята на {}% ({used} из {total} ГБ)",
        (share * 100.0).round() as u64
    ));
}

/// Причина шага: числа и что из них следует. Всё, что не прочиталось, названо словами.
fn snapshot_reason(snapshot: &Snapshot) -> String {
    let mut parts = vec![format!("процессов: {}", snapshot.procs)];
    match snapshot.cpu {
        Some(cpu) => parts.push(format!("процессор занят на {cpu}%")),
        None => parts.push("нагрузку процессора прочитать не удалось".to_string()),
    }
    if let (Some(used), Some(total)) = (&snapshot.ram_used, &snapshot.ram_total) {
        let mut ram = format!("память: {used} из {total} ГБ");
        if let Some(heavy) = snapshot.top_ram.first() {
            let name = heavy.split(':').next().unwrap_or(heavy);
            let megabytes = heavy.split(':').nth(1).unwrap_or("");
            ram.push_str(&format!(", больше всех {name} — {megabytes} МБ"));
        }
        parts.push(ram);
    } else {
        parts.push("память прочитать не удалось".to_string());
    }
    if !snapshot.top_cpu.is_empty() {
        let list: Vec<String> = snapshot
            .top_cpu
            .iter()
            .map(|entry| {
                let mut halves = entry.splitn(2, ':');
                let name = halves.next().unwrap_or(entry);
                let seconds = halves.next().unwrap_or("");
                format!("{name} — {seconds} с")
            })
            .collect();
        parts.push(format!("дольше всех работают: {}", list.join(", ")));
    }
    if let (Some(running), Some(total)) = (snapshot.services_running, snapshot.services_total) {
        let mut services = format!("службы: {running} из {total} работают");
        if let Some(stopped) = snapshot.auto_stopped {
            services.push_str(&format!(", автоматических стоят: {stopped}"));
        }
        parts.push(services);
    } else {
        parts.push("службы прочитать не удалось".to_string());
    }
    match snapshot.autostart {
        Some(count) => parts.push(format!("в автозапуске записей: {count}")),
        None => parts.push("автозапуск прочитать не удалось".to_string()),
    }
    if let (Some(free), Some(total)) = (&snapshot.disk_free, &snapshot.disk_total) {
        parts.push(format!("системный диск: свободно {free} из {total} ГБ"));
    }
    match snapshot.net_up {
        Some(up) => parts.push(format!("сетевых адаптеров поднято: {up}")),
        None => parts.push("сетевые адаптеры прочитать не удалось".to_string()),
    }
    match snapshot.events {
        Some(0) => parts.push(format!(
            "ошибок в журнале системы за {} ч: ни одной",
            snapshot.hours
        )),
        Some(count) if count >= 200 => parts.push(format!(
            "ошибок в журнале за {} ч: не меньше 200 (читаю не больше двухсот)",
            snapshot.hours
        )),
        Some(count) => parts.push(format!(
            "ошибок в журнале системы за {} ч: {count}",
            snapshot.hours
        )),
        None => parts.push(format!(
            "журнал системы за {} ч прочитать не удалось — это не «ошибок нет», а «не видно»",
            snapshot.hours
        )),
    }
    if let Some(uptime) = snapshot.uptime_h {
        parts.push(format!("машина работает {uptime} ч"));
    }
    format!(
        "снимок: {}; только чтение — ничего не менялось",
        parts.join("; ")
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
        ("files|открыть|файл в программе", OPEN_FILE),
        ("files|открыть|архив без распаковки", LIST_ARCHIVE),
        ("network|замерить|задержку до узла", PING_HOST),
        (
            "processes-services|объяснить|службу/процесс",
            EXPLAIN_PROCESS,
        ),
        ("hardware-diag|проверить|температуры", TEMPERATURES),
        (
            "processes-services|найти|подозрительный процесс",
            SUSPICIOUS_PROCESSES,
        ),
        ("hardware-diag|проверить|здоровье диска", DISK_HEALTH),
        ("dev-code|запустить|тесты", RUN_TESTS),
        ("dev-code|найти|в коде", FIND_IN_CODE),
        ("video|сжать|размер", COMPRESS_VIDEO),
        (
            "virtualization-remote|передать|файл на сервер",
            SEND_TO_SERVER,
        ),
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
        ("monitoring-triage|найти|причину тормозов", SNAPSHOT),
        ("music-production|открыть|проект в DAW", OPEN_DAW),
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

    /// Корзина на живой Windows: файл уходит с диска, а не остаётся «наверное удалённым».
    ///
    /// Проверяется именно механизм, которым откат убирает копии и сжатые файлы: если он
    /// не работает, откат не должен делать вид, что убрал.
    #[cfg(windows)]
    #[test]
    fn a_file_leaves_the_disk_through_the_recycle_bin() {
        let dir = std::env::temp_dir().join(format!("zshelper-recycle-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка");
        let file = dir.join("ненужное.txt");
        std::fs::write(&file, "мусор").expect("файл");

        let outcome = recycle_path(&file.to_string_lossy());

        assert!(outcome.is_ok(), "корзина должна принять файл: {outcome:?}");
        assert!(!file.exists(), "файл ушёл с диска");

        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Перенос, сделанный рукой, попадает в журнал отката и возвращается обратно.
    ///
    /// Журнал приложения открывается один раз на процесс, поэтому этот тест открывает его
    /// сам. Откатывается только своя запись: чужие дела принадлежат другим тестам, которые
    /// работают прямо сейчас, и трогать их нельзя.
    #[cfg(windows)]
    #[test]
    fn a_move_is_written_into_the_undo_journal_and_comes_back() {
        let dir = std::env::temp_dir().join(format!("zshelper-undo-{}-e2e", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("архив")).expect("папка");
        // Папку не убираем: журнал открыт на процесс, и другие тесты могут в него писать.
        crate::undo::init(dir.join("undo.jsonl"));

        let source = dir.join("документ.txt");
        let target = dir.join("архив").join("документ.txt");
        std::fs::write(&source, "важное").expect("файл");

        let mut params = BTreeMap::new();
        params.insert("from".to_string(), source.to_string_lossy().to_string());
        params.insert("to".to_string(), target.to_string_lossy().to_string());

        let moved = run(
            "files|переместить|файлы/папки",
            &params,
            &AtomicBool::new(false),
        );
        assert!(moved.ok, "{}", moved.reason);
        assert!(
            !moved.reason.contains("в журнал отката не записалось"),
            "{}",
            moved.reason
        );

        let journal = crate::undo::current().expect("журнал открыт этим тестом");
        let wanted = target.to_string_lossy().to_string();
        let entry = journal
            .undoable()
            .into_iter()
            .find(|entry| entry.to == wanted)
            .expect("запись об откате появилась");

        let steps = vec![crate::undo::Step {
            entry,
            refusal: None,
        }];
        let report = crate::undo::apply(
            &steps,
            |path| std::path::Path::new(path).exists(),
            |from, to| std::fs::rename(from, to).map_err(|error| error.to_string()),
            recycle_path,
        );

        assert_eq!(report.undone, 1, "{report:?}");
        assert!(source.exists(), "файл вернулся на старое место");
        assert!(!target.exists(), "и там его больше нет");
        assert_eq!(std::fs::read_to_string(&source).expect("текст"), "важное");
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
    fn searching_text_names_what_it_found_and_what_it_skipped() {
        let root = temp_target("search")
            .parent()
            .expect("папка")
            .join("search");
        std::fs::create_dir_all(root.join("вложенная")).expect("папка");
        std::fs::write(root.join("счёт.txt"), "ИНН 7701 и ещё раз ИНН 7701").expect("файл");
        std::fs::write(root.join("вложенная/договор.txt"), "тут только ИНН 7701").expect("файл");
        std::fs::write(root.join("прочее.txt"), "ничего интересного").expect("файл");
        // Двоичный файл пропускается и считается пропущенным, а не выдаётся за проверенный.
        std::fs::write(root.join("картинка.bin"), [0u8, 159, 146, 150]).expect("файл");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), root.to_string_lossy().to_string());
        params.insert("query".to_string(), "инн 7701".to_string());

        let found = run(
            "files|найти|по содержимому",
            &params,
            &AtomicBool::new(false),
        );
        assert!(found.ok, "{}", found.reason);
        assert_eq!(found.evidence.kind(), "search");
        // Считаются строки, а не вхождения внутри строки: в «счёт.txt» их две, но строка одна.
        assert!(
            found.reason.contains("строк с совпадением: 2"),
            "{}",
            found.reason
        );
        assert!(found.reason.contains("в файлах: 2"), "{}", found.reason);
        assert!(found.reason.contains("пропущено 1"), "{}", found.reason);
        // Показываем, где именно: файл и номер строки.
        assert!(
            found.stdout_tail.contains("счёт.txt:1"),
            "{}",
            found.stdout_tail
        );

        // Нигде не встречается — честный ответ, а не ошибка и не повод повторять.
        params.insert("query".to_string(), "такого текста нет".to_string());
        let nothing = run(
            "files|найти|по содержимому",
            &params,
            &AtomicBool::new(false),
        );
        assert!(nothing.ok, "{}", nothing.reason);
        assert!(
            nothing.reason.contains("нигде не встречается"),
            "{}",
            nothing.reason
        );

        // Пустой запрос есть в любом файле, поэтому он не принимается вовсе — и отказывает
        // ещё проверка параметров, до чтения диска.
        params.insert("query".to_string(), "   ".to_string());
        let empty = run(
            "files|найти|по содержимому",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!empty.ok);
        assert!(
            empty.reason.contains("не задан параметр"),
            "{}",
            empty.reason
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn opening_a_file_refuses_to_launch_programs_instead_of_opening_them() {
        let root = temp_target("open").parent().expect("папка").join("open");
        std::fs::create_dir_all(&root).expect("папка");
        std::fs::write(root.join("отчёт.exe"), "расширение решает, а не содержимое").expect("файл");

        let mut params = BTreeMap::new();
        params.insert(
            "path".to_string(),
            root.join("отчёт.exe").to_string_lossy().to_string(),
        );
        let refused = run(
            "files|открыть|файл в программе",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(
            refused.reason.contains("запуск программы"),
            "{}",
            refused.reason
        );

        // Папка — не файл: у папки своё действие, эта рука её не открывает.
        params.insert("path".to_string(), root.to_string_lossy().to_string());
        let folder = run(
            "files|открыть|файл в программе",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!folder.ok);
        assert!(folder.reason.contains("не файл"), "{}", folder.reason);

        // Несуществующий файл — тоже отказ, а не «открыл в никуда».
        params.insert(
            "path".to_string(),
            root.join("нет.pdf").to_string_lossy().to_string(),
        );
        let missing = run(
            "files|открыть|файл в программе",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!missing.ok);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn listing_an_archive_shows_what_is_inside_without_unpacking() {
        let root = temp_target("list").parent().expect("папка").join("list");
        std::fs::create_dir_all(root.join("проект")).expect("папка");
        std::fs::write(root.join("проект/раз.txt"), "раз").expect("файл");
        std::fs::write(root.join("проект/два.txt"), "два-два").expect("файл");

        let mut pack = BTreeMap::new();
        pack.insert(
            "path".to_string(),
            root.join("проект").to_string_lossy().to_string(),
        );
        pack.insert(
            "to".to_string(),
            root.join("проект.zip").to_string_lossy().to_string(),
        );
        let made = run("files|сжать|в архив", &pack, &AtomicBool::new(false));
        assert!(made.ok, "{}", made.reason);

        let before = std::fs::read_dir(&root).expect("папка").count();
        let mut params = BTreeMap::new();
        params.insert(
            "path".to_string(),
            root.join("проект.zip").to_string_lossy().to_string(),
        );
        let listed = run(
            "files|открыть|архив без распаковки",
            &params,
            &AtomicBool::new(false),
        );
        assert!(listed.ok, "{}", listed.reason);
        assert!(listed.reason.contains("файлов: 2"), "{}", listed.reason);
        assert!(
            listed.reason.contains("распаковки не было"),
            "{}",
            listed.reason
        );
        // Просмотр ничего не распаковал: рядом не появилось ни одного нового элемента.
        let after = std::fs::read_dir(&root).expect("папка").count();
        assert_eq!(
            before, after,
            "просмотр архива не должен ничего распаковывать"
        );

        // rar эта рука не читает и говорит это до запуска, а не после падения.
        std::fs::write(root.join("архив.rar"), "не zip").expect("файл");
        params.insert(
            "path".to_string(),
            root.join("архив.rar").to_string_lossy().to_string(),
        );
        let rar = run(
            "files|открыть|архив без распаковки",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!rar.ok);
        assert!(rar.reason.contains("только zip"), "{}", rar.reason);

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn saving_a_note_goes_into_the_local_base_and_never_twice() {
        let path = knowledge_file();
        let before = std::fs::read_to_string(&path).ok();
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|passed| passed.as_millis())
            .unwrap_or_default();
        let text = format!("заметка из теста {stamp}");

        let mut params = BTreeMap::new();
        params.insert("text".to_string(), text.clone());
        let saved = run(
            "learning-research|сохранить|закладку в базу знаний",
            &params,
            &AtomicBool::new(false),
        );
        assert!(saved.ok, "{}", saved.reason);
        assert_eq!(saved.evidence.kind(), "file_text");
        assert!(saved.reason.contains("сохранено"), "{}", saved.reason);

        let base = std::fs::read_to_string(&path).expect("база есть");
        assert!(base.contains(&text), "сохранённой строки нет в базе");

        // Второй раз то же самое не сохраняется: база без копий полезнее базы с ними.
        let again = run(
            "learning-research|сохранить|закладку в базу знаний",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!again.ok);
        assert!(again.reason.contains("уже есть"), "{}", again.reason);

        // Пустое не сохраняется вовсе — и это отказ проверки параметров.
        let mut empty = BTreeMap::new();
        empty.insert("text".to_string(), "   ".to_string());
        let nothing = run(
            "learning-research|сохранить|закладку в базу знаний",
            &empty,
            &AtomicBool::new(false),
        );
        assert!(!nothing.ok);

        // За собой убираем: база знаний — данные человека, а не тестовая свалка.
        match before {
            Some(original) => std::fs::write(&path, original).expect("вернуть базу"),
            None => {
                let _ = std::fs::remove_file(&path);
            }
        }
    }

    #[test]
    fn comparing_two_folders_names_all_four_numbers() {
        let root = temp_target("compare")
            .parent()
            .expect("папка")
            .join("compare");
        std::fs::create_dir_all(root.join("вчера/вложенная")).expect("папка");
        std::fs::create_dir_all(root.join("сегодня/вложенная")).expect("папка");
        std::fs::write(root.join("вчера/общий.txt"), "один").expect("файл");
        std::fs::write(root.join("сегодня/общий.txt"), "один").expect("файл");
        std::fs::write(root.join("вчера/изменён.txt"), "коротко").expect("файл");
        std::fs::write(root.join("сегодня/изменён.txt"), "гораздо длиннее").expect("файл");
        std::fs::write(root.join("вчера/вложенная/слева.txt"), "x").expect("файл");
        std::fs::write(root.join("сегодня/справа.txt"), "y").expect("файл");

        let mut params = BTreeMap::new();
        params.insert(
            "from".to_string(),
            root.join("вчера").to_string_lossy().to_string(),
        );
        params.insert(
            "to".to_string(),
            root.join("сегодня").to_string_lossy().to_string(),
        );

        let compared = run("files|сравнить|две папки", &params, &AtomicBool::new(false));
        assert!(compared.ok, "{}", compared.reason);
        assert_eq!(compared.evidence.kind(), "compared");
        assert!(
            compared.reason.contains("совпало: 1"),
            "{}",
            compared.reason
        );
        assert!(
            compared.reason.contains("отличается: 1"),
            "{}",
            compared.reason
        );
        assert!(
            compared.reason.contains("только в первой: 1"),
            "{}",
            compared.reason
        );
        assert!(
            compared.reason.contains("только во второй: 1"),
            "{}",
            compared.reason
        );
        // Граница названа: по имени и размеру, а не по содержимому.
        assert!(
            compared.reason.contains("не по содержимому"),
            "{}",
            compared.reason
        );
        assert!(
            compared
                .stdout_tail
                .contains("только во второй: справа.txt"),
            "{}",
            compared.stdout_tail
        );

        // Папку с собой сравнивать нечего: ноль отличий у неё — тавтология.
        params.insert(
            "to".to_string(),
            root.join("вчера").to_string_lossy().to_string(),
        );
        let itself = run("files|сравнить|две папки", &params, &AtomicBool::new(false));
        assert!(!itself.ok);
        assert!(
            itself.reason.contains("одна и та же папка"),
            "{}",
            itself.reason
        );

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn pinging_refuses_names_that_are_not_hosts() {
        let mut params = BTreeMap::new();
        params.insert("host".to_string(), "1.1.1.1; и ещё кто-то".to_string());
        let refused = run(
            "network|замерить|задержку до узла",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(
            refused.reason.contains("посторонние символы"),
            "{}",
            refused.reason
        );

        // Без узла рука не гадает, что пинговать.
        let empty = run(
            "network|замерить|задержку до узла",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );
        assert!(!empty.ok);
    }

    #[test]
    fn explaining_a_process_uses_its_own_table_and_admits_the_gaps() {
        // Таблица не выдумывает: известное объясняется, неизвестное признаётся.
        assert!(process_note("SVCHOST").is_some());
        assert!(process_note("Explorer").is_some());
        assert!(process_note("майнкрафт").is_none());

        // Живой факт: служба есть на любой машине с Windows, и она не процесс.
        let mut params = BTreeMap::new();
        params.insert("name".to_string(), "Dnscache".to_string());
        let found = run(
            "processes-services|объяснить|службу/процесс",
            &params,
            &AtomicBool::new(false),
        );
        assert!(found.ok, "{}", found.reason);
        assert!(
            found.stdout_tail.contains("служба: Dnscache"),
            "{}",
            found.stdout_tail
        );
        // Имени нет в таблице — так и сказано, без догадок «это безопасно».
        assert!(
            found.reason.contains("в моей таблице нет"),
            "{}",
            found.reason
        );

        // Несуществующее имя — отказ с причиной, а не пустой ответ.
        params.insert("name".to_string(), "zshelper-такого-нет".to_string());
        let missing = run(
            "processes-services|объяснить|службу/процесс",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!missing.ok);
        assert!(
            missing.reason.contains("ни процесса, ни службы"),
            "{}",
            missing.reason
        );
    }

    #[test]
    fn temperatures_say_when_the_machine_does_not_report_them() {
        // Значения зависят от машины, поведение — нет: либо числа, либо честное
        // «не сообщает». Ноль градусов и провал вместо этого были бы враньём.
        let outcome = run(
            "hardware-diag|проверить|температуры",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );
        assert!(outcome.ok, "{}", outcome.reason);
        let honest =
            outcome.reason.contains("датчиков ответило") || outcome.reason.contains("не сообщает");
        assert!(honest, "{}", outcome.reason);
    }

    #[test]
    fn the_process_script_looks_at_both_a_process_and_a_service() {
        assert!(EXPLAIN_PROCESS.contains("$env:ZS_NAME"));
        assert!(EXPLAIN_PROCESS.contains("Get-Service"));
        assert!(EXPLAIN_PROCESS.contains("ZSHELPER-NOTFOUND"));
        assert!(TEMPERATURES.contains("MSAcpi_ThermalZoneTemperature"));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "processes-services|объяснить|службу/процесс"));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "hardware-diag|проверить|температуры"));
    }

    #[test]
    fn the_ping_script_counts_answers_instead_of_pretending_to_know_the_quality() {
        assert!(PING_HOST.contains("$env:ZS_HOST"));
        assert!(PING_HOST.contains("Test-Connection"));
        assert!(PING_HOST.contains("ZSHELPER-FAILED"));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "network|замерить|задержку до узла"));
        // Сравнение папок — своя рука: внешней программы у неё нет.
        assert!(!scripts()
            .iter()
            .any(|(registry, _)| *registry == "files|сравнить|две папки"));
    }

    #[test]
    fn the_archive_listing_script_warns_about_paths_outside_the_folder() {
        assert!(LIST_ARCHIVE.contains("$env:ZS_PATH"));
        assert!(LIST_ARCHIVE.contains("ZipFile"));
        assert!(LIST_ARCHIVE.contains("danger="));
        assert!(LIST_ARCHIVE.contains("Contains('../')"));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "files|открыть|архив без распаковки"));
        // База знаний — своя рука: внешней программы у неё нет.
        assert!(!scripts().iter().any(|(registry, _)| {
            *registry == "learning-research|сохранить|закладку в базу знаний"
        }));
    }

    #[test]
    fn the_open_file_script_asks_the_registry_for_the_handler() {
        assert!(OPEN_FILE.contains("$env:ZS_PATH"));
        assert!(OPEN_FILE.contains("HKEY_CLASSES_ROOT"));
        assert!(OPEN_FILE.contains("handler="));
        assert!(scripts()
            .iter()
            .any(|(registry, _)| *registry == "files|открыть|файл в программе"));
        // Поиск по содержимому — своя рука: внешней программы у неё нет.
        assert!(!scripts()
            .iter()
            .any(|(registry, _)| *registry == "files|найти|по содержимому"));
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
    fn looking_for_suspicious_processes_names_the_reason_not_a_verdict() {
        let found = run(
            "processes-services|найти|подозрительный процесс",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );

        assert!(found.ok, "{}", found.reason);
        // Отвечает фактом: сколько проверил и что нашёл.
        assert!(
            found.reason.contains("проверено процессов:"),
            "{}",
            found.reason
        );
        // И честно: либо «ничего не видно» (без обещания чистоты),
        // либо список на заметку — но не приговор.
        let honest =
            found.reason.contains("ничего явно странного") || found.reason.contains("на заметку");
        assert!(honest, "{}", found.reason);
        assert!(!found.reason.contains("компьютер чист"), "{}", found.reason);
    }

    #[test]
    fn disk_health_says_when_the_machine_does_not_report_it() {
        let health = run(
            "hardware-diag|проверить|здоровье диска",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );

        assert!(health.ok, "{}", health.reason);
        let honest =
            health.reason.contains("дисков:") || health.reason.contains("не отдаёт сведения");
        assert!(honest, "{}", health.reason);
        // Прогноза нет не случайно: рука не обещает предсказать смерть диска.
        assert!(
            !health.reason.contains("скоро сломается"),
            "{}",
            health.reason
        );
    }

    #[test]
    fn the_process_scan_checks_signatures_and_temporary_folders() {
        assert!(SUSPICIOUS_PROCESSES.contains("Get-AuthenticodeSignature"));
        assert!(SUSPICIOUS_PROCESSES.contains("Downloads"));
        assert!(SUSPICIOUS_PROCESSES.contains("checked="));
        assert!(DISK_HEALTH.contains("Get-StorageReliabilityCounter"));
        assert!(DISK_HEALTH.contains("HealthStatus"));

        let registries: Vec<&str> = scripts().iter().map(|(registry, _)| *registry).collect();
        assert!(registries.contains(&"processes-services|найти|подозрительный процесс"));
        assert!(registries.contains(&"hardware-diag|проверить|здоровье диска"));
        // Счётчики в выводе есть у обоих скриптов — по ним рука и отвечает.
        assert!(SUSPICIOUS_PROCESSES.contains("suspicious="));
        assert!(DISK_HEALTH.contains("disks="));
    }

    /// Папка проекта с манифестом: npm и скрипт `test` из одной строки.
    ///
    /// Манифест собирается `serde_json`, а не склейкой строк: одна лишняя кавычка
    /// превращает его в «не разобрал JSON», и тест тогда проверял бы не руку, а свою опечатку.
    fn project_with_npm_test(name: &str, js: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zshelper-tests-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка проекта");
        let manifest = serde_json::json!({
            "name": "probe",
            "version": "1.0.0",
            "private": true,
            "scripts": { "test": format!("node -e \"{js}\"") },
        });
        std::fs::write(dir.join("package.json"), manifest.to_string()).expect("манифест");
        dir
    }

    #[test]
    fn running_tests_without_a_folder_is_refused() {
        let refused = run(
            "dev-code|запустить|тесты",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        // Отказ называет параметр, которого не хватает, — и делает это до запуска.
        assert!(
            refused.reason.to_lowercase().contains("папка проекта"),
            "{}",
            refused.reason
        );
    }

    #[test]
    fn tests_are_not_run_where_there_is_nothing_to_run() {
        let dir = std::env::temp_dir().join(format!("zshelper-empty-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("пустая папка");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), dir.to_string_lossy().to_string());

        let refused = run("dev-code|запустить|тесты", &params, &AtomicBool::new(false));
        assert!(!refused.ok, "запускать нечего — это отказ");
        // Отказ перечисляет, что искали, а не «что-то пошло не так».
        assert!(
            refused.reason.contains("не вижу, чем"),
            "{}",
            refused.reason
        );
        assert!(
            refused.reason.contains("package.json"),
            "{}",
            refused.reason
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_passing_test_run_is_reported_with_its_own_word() {
        let dir = project_with_npm_test("pass", "console.log('1 passed')");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), dir.to_string_lossy().to_string());

        let done = run("dev-code|запустить|тесты", &params, &AtomicBool::new(false));

        let shown = format!("{} / вывод: {}", done.reason, done.stdout_tail);
        assert!(done.ok, "{shown}");
        assert!(done.reason.contains("тесты прошли"), "{shown}");
        assert!(done.reason.contains("npm"), "{shown}");
        assert_eq!(done.exit_code, Some(0), "{shown}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn failing_tests_make_the_step_fail_but_say_it_was_a_run() {
        let dir = project_with_npm_test("fail", "process.exit(3)");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), dir.to_string_lossy().to_string());

        let done = run("dev-code|запустить|тесты", &params, &AtomicBool::new(false));

        let shown = format!("{} / вывод: {}", done.reason, done.stdout_tail);
        // Красный прогон — не сбой руки, но и не успех шага.
        assert!(!done.ok, "красные тесты — не «сделано»: {shown}");
        assert!(done.reason.contains("тесты провалились"), "{shown}");
        assert!(done.reason.contains("код 3"), "{shown}");
        assert!(done.reason.contains("не сбой руки"), "{shown}");
        assert_eq!(done.exit_code, Some(3), "{shown}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_test_script_knows_four_kinds_of_projects() {
        assert!(RUN_TESTS.contains("package.json"));
        assert!(RUN_TESTS.contains("Cargo.toml"));
        assert!(RUN_TESTS.contains("pyproject.toml"));
        assert!(RUN_TESTS.contains("go.mod"));
        // Потолок по времени назван числом, а не «когда-нибудь».
        assert!(RUN_TESTS.contains("WaitForExit(330000)"));
        // Своих временных файлов рука не оставляет и ничего не удаляет.
        assert!(!RUN_TESTS.to_lowercase().contains("remove-item"));
        assert!(RUN_TESTS.contains("ReadToEndAsync"));

        let registries: Vec<&str> = scripts().iter().map(|(registry, _)| *registry).collect();
        assert!(registries.contains(&"dev-code|запустить|тесты"));
    }

    /// Папка проекта с кодом: слово есть в одном файле и нет в другом.
    fn project_with_code(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zshelper-search-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("node_modules")).expect("служебная папка");
        std::fs::write(
            dir.join("main.rs"),
            "fn main() {\n    handle_submit();\n}\n",
        )
        .expect("код");
        std::fs::write(dir.join("app.ts"), "const other = 1;\n").expect("код");
        // Чужой код в служебной папке: он не должен попасть в ответ.
        std::fs::write(
            dir.join("node_modules").join("left.rs"),
            "handle_submit();\n",
        )
        .expect("чужой код");
        dir
    }

    #[test]
    fn searching_the_code_shows_the_file_and_the_line() {
        let dir = project_with_code("hit");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), dir.to_string_lossy().to_string());
        params.insert("text".to_string(), "handle_submit".to_string());

        let found = run("dev-code|найти|в коде", &params, &AtomicBool::new(false));

        assert!(found.ok, "{}", found.reason);
        assert!(found.reason.contains("упоминаний 1"), "{}", found.reason);
        // Находка названа файлом и строкой, а не «есть совпадения».
        assert!(
            found.stdout_tail.contains("main.rs:2"),
            "{}",
            found.stdout_tail
        );
        // Служебная папка пропущена — иначе ответ утонул бы в чужом коде.
        assert!(
            !found.stdout_tail.contains("left.rs"),
            "{}",
            found.stdout_tail
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_word_that_is_not_in_the_code_is_an_answer_not_a_failure() {
        let dir = project_with_code("miss");
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), dir.to_string_lossy().to_string());
        params.insert("text".to_string(), "такого-слова-нет".to_string());

        let found = run("dev-code|найти|в коде", &params, &AtomicBool::new(false));

        assert!(found.ok, "ноль находок — не сбой: {}", found.reason);
        assert!(found.reason.contains("не нашлось"), "{}", found.reason);
        // Рядом сказано, сколько смотрели: иначе не отличить «нет» от «не искал».
        assert!(
            found.reason.contains("просмотрено файлов"),
            "{}",
            found.reason
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_code_search_without_a_word_is_refused() {
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), "C:\\tmp\\проект".to_string());

        let refused = run("dev-code|найти|в коде", &params, &AtomicBool::new(false));

        assert!(!refused.ok);
        assert!(
            refused.reason.to_lowercase().contains("что искать"),
            "{}",
            refused.reason
        );
    }

    #[test]
    fn the_code_search_is_literal_and_skips_service_folders() {
        for folder in ["node_modules", ".git", "target", "dist", "vendor"] {
            assert!(FIND_IN_CODE.contains(folder), "нет «{folder}» в пропуске");
        }
        // Слово берётся буквально: иначе точка в запросе стала бы шаблоном.
        assert!(FIND_IN_CODE.contains("-SimpleMatch"));
        assert!(FIND_IN_CODE.contains("20000"));
        assert!(FIND_IN_CODE.contains("scanned="));

        let registries: Vec<&str> = scripts().iter().map(|(registry, _)| *registry).collect();
        assert!(registries.contains(&"dev-code|найти|в коде"));
    }

    #[test]
    fn compressing_a_file_that_is_not_there_is_refused() {
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), "C:\\нет-такого\\видео.mp4".to_string());

        let refused = run("video|сжать|размер", &params, &AtomicBool::new(false));

        assert!(!refused.ok);
        assert!(
            refused.reason.contains("такого файла нет"),
            "{}",
            refused.reason
        );
    }

    #[test]
    fn a_bad_target_size_is_refused_before_anything_runs() {
        let dir =
            std::env::temp_dir().join(format!("zshelper-video-{}-target", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка");
        let file = dir.join("фильм.mp4");
        std::fs::write(&file, "не видео").expect("файл");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), file.to_string_lossy().to_string());
        params.insert("target".to_string(), "много".to_string());

        let refused = run("video|сжать|размер", &params, &AtomicBool::new(false));

        assert!(!refused.ok);
        assert!(
            refused.reason.contains("число мегабайт"),
            "{}",
            refused.reason
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn without_ffmpeg_or_a_real_video_the_hand_says_which_it_is() {
        let dir = std::env::temp_dir().join(format!("zshelper-video-{}-junk", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка");
        let file = dir.join("битый.mp4");
        std::fs::write(&file, "это не видео, а строка").expect("файл");

        let mut params = BTreeMap::new();
        params.insert("path".to_string(), file.to_string_lossy().to_string());

        let failed = run("video|сжать|размер", &params, &AtomicBool::new(false));

        // Два честных исхода: ffmpeg не установлен или он не смог разобрать файл.
        // Оба обязаны назвать причину, а не «что-то пошло не так».
        assert!(!failed.ok, "сжимать нечего: {}", failed.reason);
        assert!(
            failed.reason.to_lowercase().contains("ffmpeg"),
            "{}",
            failed.reason
        );
        // Исходник не тронут: рука пишет рядом, а не поверх.
        assert_eq!(
            std::fs::read_to_string(&file).expect("исходник на месте"),
            "это не видео, а строка"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn compression_never_overwrites_the_source() {
        // Исходник остаётся исходником: результат — отдельный файл с другим именем.
        assert!(COMPRESS_VIDEO.contains("(сжатое).mp4"));
        assert!(COMPRESS_VIDEO.contains("молча перезаписывать не буду"));
        assert!(COMPRESS_VIDEO.contains("-crf"));
        assert!(COMPRESS_VIDEO.contains("libx264"));
        // Проверка результата — по байтам, а не по слову «готово».
        assert!(COMPRESS_VIDEO.contains("before="));
        assert!(COMPRESS_VIDEO.contains("saved="));
        // ffmpeg приложение не ставит само.
        assert!(COMPRESS_VIDEO.contains("сам ставить не буду"));

        let registries: Vec<&str> = scripts().iter().map(|(registry, _)| *registry).collect();
        assert!(registries.contains(&"video|сжать|размер"));
    }

    fn send_params(path: &str, host: &str, remote: &str) -> BTreeMap<String, String> {
        let mut params = BTreeMap::new();
        params.insert("path".to_string(), path.to_string());
        params.insert("host".to_string(), host.to_string());
        params.insert("remote".to_string(), remote.to_string());
        params
    }

    #[test]
    fn sending_to_a_server_without_a_file_is_refused() {
        let refused = run(
            "virtualization-remote|передать|файл на сервер",
            &send_params("", "user@example.com", "/home/user"),
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        // Файл — обязательный параметр, и отказ называет его до запуска.
        assert!(
            refused.reason.to_lowercase().contains("файл"),
            "{}",
            refused.reason
        );
    }

    #[test]
    fn a_server_name_with_spaces_is_refused_before_any_network() {
        let refused = run(
            "virtualization-remote|передать|файл на сервер",
            &send_params("C:\\tmp\\файл.zip", "мой сервер", "/home/user"),
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        assert!(
            refused.reason.contains("посторонние символы"),
            "{}",
            refused.reason
        );
    }

    #[test]
    fn a_remote_path_that_could_be_a_command_is_refused() {
        let refused = run(
            "virtualization-remote|передать|файл на сервер",
            &send_params("C:\\tmp\\файл.zip", "user@example.com", "/home/u; rm -rf /"),
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        assert!(
            refused.reason.contains("посторонние символы"),
            "{}",
            refused.reason
        );
    }

    #[test]
    fn the_transfer_asks_nobody_for_a_password_and_leaves_the_file_alone() {
        let dir = std::env::temp_dir().join(format!("zshelper-send-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка");
        let file = dir.join("архив.txt");
        std::fs::write(&file, "содержимое").expect("файл");

        let failed = run(
            "virtualization-remote|передать|файл на сервер",
            &send_params(&file.to_string_lossy(), "127.0.0.1", "/tmp"),
            &AtomicBool::new(false),
        );

        // Сервера на этой машине нет — и это честный отказ, а не «отправлено».
        assert!(!failed.ok, "{}", failed.reason);
        // Причина называет scp: не установлен или не смог. Ждать пароля рука не станет.
        assert!(failed.reason.contains("scp"), "{}", failed.reason);
        assert_eq!(
            std::fs::read_to_string(&file).expect("файл цел"),
            "содержимое"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_transfer_never_weakens_host_keys() {
        assert!(SEND_TO_SERVER.contains("BatchMode=yes"));
        assert!(SEND_TO_SERVER.contains("ConnectTimeout=10"));
        // Чужой ключ молча не принимается: это была бы подмена сервера.
        assert!(!SEND_TO_SERVER.contains("StrictHostKeyChecking=no"));
        assert!(!SEND_TO_SERVER.contains("accept-new"));
        assert!(SEND_TO_SERVER.contains("сам ставить не буду"));
        // Проверка результата — размер на той стороне.
        assert!(SEND_TO_SERVER.contains("verified="));

        let registries: Vec<&str> = scripts().iter().map(|(registry, _)| *registry).collect();
        assert!(registries.contains(&"virtualization-remote|передать|файл на сервер"));
    }

    /// Причина запуска DAW называет программу, путь и время подъёма процесса.
    #[test]
    fn the_daw_reason_names_the_program_and_the_process() {
        // Строка, которую отдаёт скрипт: имя с пробелом и путь с пробелами.
        let output = "ZSHELPER-OK found=1 checked=10 alive=1 millis=1500\n\
ZSHELPER-DAW name=Ableton Live\n\
ZSHELPER-DAW exe=C:\\Program Files\\Ableton\\Live 11\\Ableton Live 11 Suite.exe\n\
ZSHELPER-DAW project=C:\\Users\\Имя\\Music\\трек.als";

        let value = |prefix: &str| -> Option<String> {
            output.lines().find_map(|line| {
                line.trim()
                    .strip_prefix(prefix)
                    .map(|rest| rest.trim().to_string())
                    .filter(|rest| !rest.is_empty())
            })
        };
        let numbers = |name: &str| -> Option<u64> {
            output
                .split_whitespace()
                .find_map(|word| word.strip_prefix(name))
                .and_then(|value| value.parse::<u64>().ok())
        };

        // Имя и путь берутся целиком: разбор по словам разрезал бы их.
        assert_eq!(value("ZSHELPER-DAW name=").as_deref(), Some("Ableton Live"));
        assert_eq!(
            value("ZSHELPER-DAW exe=").as_deref(),
            Some("C:\\Program Files\\Ableton\\Live 11\\Ableton Live 11 Suite.exe")
        );
        assert_eq!(numbers("checked="), Some(10));
        assert_eq!(numbers("millis="), Some(1500));
    }

    /// Проект проверяется до запуска: открывать пустоту рука не станет.
    #[test]
    fn a_missing_project_is_refused_before_launch() {
        let mut params = BTreeMap::new();
        params.insert(
            "project".to_string(),
            "C:\\нет такого\\трек.flp".to_string(),
        );

        let refused = run(
            "music-production|открыть|проект в DAW",
            &params,
            &AtomicBool::new(false),
        );

        assert!(!refused.ok);
        assert!(
            refused.reason.contains("такого проекта нет"),
            "{}",
            refused.reason
        );
        assert!(
            refused.reason.contains("не открывать пустоту"),
            "{}",
            refused.reason
        );
    }

    /// Живой запуск без DAW: отказ с числом проверенных, а не молчание и не «не вышло».
    ///
    /// На сборочной машине студий нет — здесь проверяется именно честность отказа.
    #[cfg(windows)]
    #[test]
    fn opening_a_daw_says_how_many_were_checked() {
        let result = run(
            "music-production|открыть|проект в DAW",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );

        if result.ok {
            // На машине разработчика студия может быть — тогда причина называет программу.
            assert!(
                result.reason.contains("процесс поднялся"),
                "{}",
                result.reason
            );
            assert!(
                result.reason.contains("известных DAW проверено: 10"),
                "{}",
                result.reason
            );
        } else {
            assert!(
                result.reason.contains("проверил известных: 10"),
                "отказ обязан называть число проверенных: {}",
                result.reason
            );
        }
    }

    /// Вердикт опирается на названные пороги, и его можно оспорить числами.
    #[test]
    fn the_verdict_uses_named_thresholds() {
        let overloaded = parse_snapshot(
            "ZSHELPER-OK procs=200 cpu=94 ram_used=15.4 ram_total=16.0 top_cpu=chrome:412 \
top_ram=chrome:14000 events=3 hours=24",
        )
        .expect("строка");
        let verdict = snapshot_verdict(&overloaded);
        assert!(verdict.contains("94%"), "{verdict}");
        assert!(verdict.contains("память занята на 96%"), "{verdict}");
        assert!(
            verdict.contains("chrome — и по памяти, и по процессору"),
            "{verdict}"
        );
        assert!(
            verdict.contains("ошибок в журнале системы за 24 ч: 3"),
            "{verdict}"
        );
        assert!(verdict.contains("не диагноз"), "{verdict}");

        let calm = parse_snapshot(
            "ZSHELPER-OK procs=120 cpu=7 ram_used=4.0 ram_total=16.0 top_ram=code:400 events=0 hours=24",
        )
        .expect("строка");
        let verdict = snapshot_verdict(&calm);
        assert!(verdict.contains("явной перегрузки не видно"), "{verdict}");
        assert!(verdict.contains("процессор 7%"), "{verdict}");
    }

    /// Строка снимка разбирается в числа: имена процессов, службы, диск, события.
    #[test]
    fn a_snapshot_line_is_parsed_into_numbers() {
        let line = "ZSHELPER-OK procs=180 cpu=23 ram_used=8.2 ram_total=16.0 \
top_cpu=chrome:412,code:88 top_ram=chrome:1200,code:800 services=120/200 auto_stopped=3 \
autostart=12 disk_free=120.4 disk_total=476.1 net_up=3 events=7 hours=24 uptime_h=53";

        let snapshot = parse_snapshot(line).expect("строка разбирается");

        assert_eq!(snapshot.procs, 180);
        assert_eq!(snapshot.cpu, Some(23));
        assert_eq!(snapshot.ram_used.as_deref(), Some("8.2"));
        assert_eq!(snapshot.top_cpu, vec!["chrome:412", "code:88"]);
        assert_eq!(snapshot.services_running, Some(120));
        assert_eq!(snapshot.services_total, Some(200));
        assert_eq!(snapshot.events, Some(7));
        assert_eq!(snapshot.hours, 24);
        assert_eq!(snapshot.uptime_h, Some(53));

        let reason = snapshot_reason(&snapshot);
        for expected in [
            "процессов: 180",
            "23%",
            "chrome — 1200 МБ",
            "120 из 200",
            "за 24 ч: 7",
        ] {
            assert!(reason.contains(expected), "{reason}");
        }
        // Рука только читает — и говорит это, чтобы её не боялись.
        assert!(reason.contains("только чтение"), "{reason}");
    }

    /// `-1` из скрипта значит «не прочиталось», и это не то же самое, что ноль событий.
    #[test]
    fn an_unreadable_journal_is_not_zero_errors() {
        let line = "ZSHELPER-OK procs=100 events=-1 hours=24 net_up=-1 autostart=-1";

        let snapshot = parse_snapshot(line).expect("строка разбирается");

        assert_eq!(snapshot.events, None, "-1 это не ноль");
        let reason = snapshot_reason(&snapshot);
        assert!(reason.contains("прочитать не удалось"), "{reason}");
        assert!(
            !reason.contains("ошибок в журнале системы за 24 ч:"),
            "ноль не выдаётся за пустой журнал: {reason}"
        );
    }

    /// Чего в строке нет, то названо словами, а не нарисовано нулём.
    #[test]
    fn missing_pieces_are_named_instead_of_shown_as_zero() {
        let line = "ZSHELPER-OK procs=42";

        let snapshot = parse_snapshot(line).expect("строка разбирается");
        let reason = snapshot_reason(&snapshot);

        assert_eq!(snapshot.procs, 42);
        assert!(reason.contains("процессор"), "{reason}");
        assert!(reason.contains("службы прочитать не удалось"), "{reason}");
        assert!(
            reason.contains("автозапуск прочитать не удалось"),
            "{reason}"
        );
    }

    /// Строка без маркера — это не снимок: молча не гадаем.
    #[test]
    fn a_line_without_the_marker_is_not_a_snapshot() {
        assert!(parse_snapshot("Get-Process: доступ запрещён").is_none());
    }

    /// Потолки названы числом, и выход за них — отказ до запуска.
    #[test]
    fn snapshot_ceilings_are_named_numbers() {
        let mut params = BTreeMap::new();
        params.insert("hours".to_string(), "1000".to_string());
        let refused = run(
            "monitoring-triage|найти|причину тормозов",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(refused.reason.contains("168"), "{}", refused.reason);

        params.insert("hours".to_string(), "24".to_string());
        params.insert("top".to_string(), "99".to_string());
        let refused = run(
            "monitoring-triage|найти|причину тормозов",
            &params,
            &AtomicBool::new(false),
        );
        assert!(!refused.ok);
        assert!(refused.reason.contains("10"), "{}", refused.reason);
    }

    /// Живой снимок: числа приходят с этой машины, а не из примера в коде.
    #[cfg(windows)]
    #[test]
    fn a_live_snapshot_counts_this_machine() {
        let result = run(
            "monitoring-triage|найти|причину тормозов",
            &BTreeMap::new(),
            &AtomicBool::new(false),
        );

        assert!(result.ok, "{}", result.reason);
        assert!(result.reason.contains("процессов: "), "{}", result.reason);
        let snapshot = parse_snapshot(
            result
                .stdout_tail
                .lines()
                .find(|line| line.contains("ZSHELPER-OK"))
                .expect("строка с числами"),
        )
        .expect("строка разбирается");
        assert!(snapshot.procs > 0, "процессов не может быть ноль");
        assert!(
            snapshot.services_total.unwrap_or(0) > 0,
            "службы на Windows есть всегда"
        );
    }

    /// Путь чистится от кавычек и пробелов — так его вставляют из проводника.
    #[test]
    fn clean_path_strips_quotes_and_spaces() {
        assert_eq!(clean_path("  \"C:\\tmp\"  "), "C:\\tmp");
    }
}
