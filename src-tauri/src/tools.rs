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
use crate::step::{tail, StepResult};
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
pub fn validate(spec: &ToolSpec, params: &BTreeMap<String, String>) -> Result<(), String> {
    for param in spec.params.iter().filter(|param| param.required) {
        match params.get(&param.name) {
            Some(value) if !value.trim().is_empty() => {}
            _ => return Err(format!("не задан параметр «{}»", param.label)),
        }
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
            assert!(!result.reason.trim().is_empty(), "отказ обязан быть словами");
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

    #[test]
    fn clean_path_strips_quotes_and_spaces() {
        assert_eq!(clean_path("  \"C:\\tmp\"  "), "C:\\tmp");
    }
}
