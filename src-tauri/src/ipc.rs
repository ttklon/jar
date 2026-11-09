//! Команды, которые фронтенд вызывает через `invoke`.
//!
//! Тонкий слой: выдать данные, проверить политику, запустить инструмент, записать
//! журнал. Логика риска — в `policy`, исполнение — в `tools`, проверка — в
//! `verifier`. Формат ответов совпадает с `src/ipc/types.ts`.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::audit::{now_ms, Audit, AuditEvent, AuditKind};
use crate::download::{self, Downloaded};
use crate::flows::{self, FlowInput, FlowSpec, FlowStep};
use crate::memory::{Memory, RunRecord};
use crate::models::{self, ModelFile};
use crate::planner::{self, PlanItem};
use crate::policy::{self, Decision, PolicyState, TOKEN_TTL};
use crate::profiles::{self, ProfileOperation, ProfileSpec};
use crate::registry::{Action, Registry, RegistrySnapshot};
use crate::step::StepResult;
use crate::tools::{self, ParamSpec, ToolSpec};

/// Всё, что нужно командам. Один `Arc`, чтобы клонировать в фоновый поток.
pub struct Inner {
    pub registry: Registry,
    pub audit: Audit,
    pub memory: Memory,
    /// Папка моделей: модели весят гигабайты, поэтому путь явный, а не «где-то рядом».
    pub models_dir: std::path::PathBuf,
    pub policy: PolicyState,
    pub cancel: AtomicBool,
}

pub struct AppState {
    pub inner: Arc<Inner>,
    pub log_file: String,
}

#[derive(Debug, Serialize)]
pub struct AppStatus {
    pub version: &'static str,
    pub actions: usize,
    pub domains: usize,
    pub data_loaded: bool,
    pub log_file: String,
    pub audit_file: String,
    pub tools: usize,
    pub flows: usize,
    pub profiles: usize,
}

/// Инструмент для экрана «Руки»: строка реестра + параметры + решение политики.
#[derive(Debug, Serialize)]
pub struct ToolView {
    pub registry: &'static str,
    pub title: &'static str,
    pub summary: &'static str,
    pub implementation: &'static str,
    pub params: &'static [ParamSpec],
    pub risk: String,
    pub risk_needs_human: bool,
    pub decision: String,
    pub decision_reason: String,
    pub needs_token: bool,
    /// Параметры прошлого удачного запуска: интерфейс подставляет их, а не заставляет
    /// каждый раз вводить один и тот же путь.
    pub last_params: Option<BTreeMap<String, String>>,
}

/// Операция профиля: ссылка на реестр, риск и решение политики.
#[derive(Debug, Serialize)]
pub struct ProfileOpView {
    pub name: String,
    pub registry: String,
    /// Фактический ключ строки реестра (ссылка профиля может быть короткой).
    pub resolved: String,
    pub risk: String,
    pub decision: String,
    pub decision_reason: String,
    pub needs_token: bool,
    /// Есть ли уже инструмент, который это выполняет.
    pub has_tool: bool,
}

/// Профиль приложения для экрана «Приложения».
#[derive(Debug, Serialize)]
pub struct ProfileView {
    pub slug: String,
    pub app: String,
    pub kind: String,
    pub exe: Vec<String>,
    pub ui_stack: String,
    pub version_seen: String,
    pub verified_at: String,
    pub anchors: usize,
    /// Сколько операций уже можно выполнить инструментом.
    pub executable: usize,
    pub operations: Vec<ProfileOpView>,
}

/// Шаг сценария с уже известным решением политики: интерфейс не считает риск сам.
#[derive(Debug, Serialize)]
pub struct FlowStepView {
    pub tool: String,
    pub title: String,
    pub note: String,
    pub params: BTreeMap<String, String>,
    pub risk: String,
    pub decision: String,
    pub decision_reason: String,
    pub needs_token: bool,
}

/// Сценарий для экрана «Сценарии»: шаги, входы и риск самого опасного шага.
#[derive(Debug, Serialize)]
pub struct FlowView {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub registry: String,
    pub risk: String,
    pub decision: String,
    pub decision_reason: String,
    pub needs_token: bool,
    pub inputs: Vec<FlowInput>,
    pub steps: Vec<FlowStepView>,
}

#[derive(Debug, Serialize)]
pub struct PolicyView {
    pub registry: String,
    pub risk: String,
    pub decision: String,
    pub reason: String,
    pub needs_token: bool,
}

#[derive(Debug, Serialize)]
pub struct ConfirmToken {
    pub token: u64,
    pub ttl_sec: u64,
}

fn action_for<'a>(registry: &'a Registry, key: &str) -> Option<&'a Action> {
    registry.by_key(key)
}

fn decision_of(inner: &Inner, key: &str) -> (Decision, String) {
    match action_for(&inner.registry, key) {
        Some(action) => (policy::decide(action), risk_label(action)),
        None => (
            Decision::Deny("такого действия нет в реестре"),
            "unknown".into(),
        ),
    }
}

fn risk_label(action: &Action) -> String {
    action.risk.as_str().to_string()
}

fn view(inner: &Inner, spec: &'static ToolSpec) -> ToolView {
    let (decision, risk) = decision_of(inner, &spec.registry);
    let needs_human = action_for(&inner.registry, &spec.registry)
        .map(|action| action.risk.needs_human())
        .unwrap_or(true);

    ToolView {
        registry: spec.registry.as_str(),
        title: spec.title.as_str(),
        summary: spec.summary.as_str(),
        implementation: spec.implementation.as_str(),
        params: spec.params.as_slice(),
        risk,
        risk_needs_human: needs_human,
        decision: decision.as_str().to_string(),
        decision_reason: decision.reason().to_string(),
        needs_token: decision.needs_token(),
        last_params: inner.memory.last_params(&spec.registry),
    }
}

fn profile_op_view(inner: &Inner, operation: &ProfileOperation) -> ProfileOpView {
    match profiles::resolve(&inner.registry, &operation.registry) {
        Some(action) => {
            let decision = policy::decide(action);
            let resolved = action.key();
            ProfileOpView {
                name: operation.name.clone(),
                registry: operation.registry.clone(),
                has_tool: tools::spec(&resolved).is_some(),
                resolved,
                risk: risk_label(action),
                decision: decision.as_str().to_string(),
                decision_reason: decision.reason().to_string(),
                needs_token: decision.needs_token(),
            }
        }
        // Данные разъехались — показываем это честно, а не делаем вид, что всё хорошо.
        None => ProfileOpView {
            name: operation.name.clone(),
            registry: operation.registry.clone(),
            resolved: String::new(),
            risk: "unknown".into(),
            decision: Decision::Deny("в реестре нет такой строки")
                .as_str()
                .to_string(),
            decision_reason: "в реестре нет такой строки".into(),
            needs_token: false,
            has_tool: false,
        },
    }
}

fn profile_view(inner: &Inner, profile: &ProfileSpec) -> ProfileView {
    let operations: Vec<ProfileOpView> = profile
        .operations
        .iter()
        .map(|operation| profile_op_view(inner, operation))
        .collect();

    ProfileView {
        slug: profile.slug.clone(),
        app: profile.app.clone(),
        kind: profile.kind.clone(),
        exe: profile.exe.clone(),
        ui_stack: profile.ui_stack.clone(),
        version_seen: profile.version_seen.clone(),
        verified_at: profile.verified_at.clone(),
        anchors: profile.anchors,
        executable: operations.iter().filter(|view| view.has_tool).count(),
        operations,
    }
}

fn step_view(inner: &Inner, step: &FlowStep) -> FlowStepView {
    let (decision, risk) = decision_of(inner, &step.tool);
    let title = tools::spec(&step.tool)
        .map(|spec| spec.title.clone())
        .unwrap_or_else(|| step.tool.clone());

    FlowStepView {
        tool: step.tool.clone(),
        title,
        note: step.note.clone(),
        params: step.params.clone(),
        risk,
        decision: decision.as_str().to_string(),
        decision_reason: decision.reason().to_string(),
        needs_token: decision.needs_token(),
    }
}

fn flow_view(inner: &Inner, flow: &FlowSpec) -> FlowView {
    let (decision, risk) = decision_of(inner, &flow.registry);

    FlowView {
        id: flow.id.clone(),
        title: flow.title.clone(),
        summary: flow.summary.clone(),
        registry: flow.registry.clone(),
        risk,
        decision: decision.as_str().to_string(),
        decision_reason: decision.reason().to_string(),
        needs_token: decision.needs_token(),
        inputs: flow.inputs.clone(),
        steps: flow
            .steps
            .iter()
            .map(|step| step_view(inner, step))
            .collect(),
    }
}

/// Одно событие журнала. Структура вместо восьми аргументов: порядок «риск,
/// решение, отпечаток, итог» слишком легко перепутать местами.
struct Entry<'a> {
    kind: AuditKind,
    subject: &'a str,
    risk: &'a str,
    decision: &'a str,
    fingerprint: &'a str,
    outcome: &'a str,
    duration_ms: u64,
}

fn audit(inner: &Inner, entry: Entry<'_>) {
    inner.audit.write(AuditEvent {
        at_ms: now_ms(),
        kind: entry.kind,
        subject: entry.subject.to_string(),
        risk: entry.risk.to_string(),
        decision: entry.decision.to_string(),
        args_fingerprint: entry.fingerprint.to_string(),
        outcome: entry.outcome.to_string(),
        duration_ms: entry.duration_ms,
    });
}

/// Полный каталог действий. Вызывается один раз при старте UI.
#[tauri::command]
pub fn registry_snapshot(state: State<'_, AppState>) -> RegistrySnapshot {
    state.inner.registry.snapshot()
}

#[tauri::command]
pub fn app_status(state: State<'_, AppState>) -> AppStatus {
    AppStatus {
        version: env!("CARGO_PKG_VERSION"),
        actions: state.inner.registry.len(),
        domains: state.inner.registry.stats().domains,
        data_loaded: !state.inner.registry.is_empty(),
        log_file: state.log_file.clone(),
        audit_file: state.inner.audit.path().display().to_string(),
        tools: tools::all().len(),
        flows: flows::all().len(),
        profiles: profiles::all().len(),
    }
}

/// Инструменты, которые уже умеют работать (список — в `data/tools.json`).
#[tauri::command]
pub fn list_tools(state: State<'_, AppState>) -> Vec<ToolView> {
    tools::all()
        .iter()
        .map(|spec| view(&state.inner, spec))
        .collect()
}

/// Поиск по реестру: что приложение может сделать по этой фразе.
///
/// Модели здесь нет — только сопоставление слов (`planner`). Ответ честный: у каждого
/// найденного действия видно решение политики и то, есть ли уже инструмент.
#[tauri::command]
pub fn plan_for(state: State<'_, AppState>, query: String, limit: usize) -> Vec<PlanItem> {
    planner::plan(&state.inner.registry, &query, limit.clamp(1, 50))
}

/// Что лежит в папке моделей.
///
/// `error` заполняется, если папку не прочитать: «моделей нет» и «папки нет» — разные
/// вещи, и интерфейс обязан их различать, а не показывать пустой список в обоих случаях.
#[derive(Debug, Serialize)]
pub struct ModelsView {
    pub dir: String,
    pub items: Vec<ModelFile>,
    pub error: Option<String>,
    /// Сколько всего занимают модели в папке.
    pub total_bytes: u64,
    /// Свободно на этом диске. `None` — спросить не удалось; выдумывать число нельзя.
    pub free_bytes: Option<u64>,
}

/// Список `.gguf` в папке моделей. Ничего не скачивает и не запускает — только читает
/// заголовки, поэтому вызывать можно сколько угодно.
#[tauri::command]
pub fn list_models(state: State<'_, AppState>) -> ModelsView {
    let dir = &state.inner.models_dir;
    match models::scan(dir) {
        Ok(mut items) => {
            // Известный хеш берётся из памяти: чтение папки про память ничего не знает.
            for item in &mut items {
                item.hash = state.inner.memory.fact(&models::hash_key(&item.name));
            }
            ModelsView {
                dir: dir.display().to_string(),
                total_bytes: models::total_bytes(&items),
                free_bytes: models::free_space(dir),
                items,
                error: None,
            }
        }
        Err(error) => ModelsView {
            dir: dir.display().to_string(),
            items: Vec::new(),
            total_bytes: 0,
            free_bytes: models::free_space(dir),
            error: Some(error),
        },
    }
}

/// Сверяет хеш файла модели с тем, что помнит приложение.
///
/// Чтение гигабайтного файла идёт в отдельном потоке: интерфейс не должен
/// замирать на несколько секунд из-за проверки.
#[tauri::command]
pub async fn verify_model(
    state: State<'_, AppState>,
    name: String,
) -> Result<models::HashCheck, String> {
    let inner = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        models::verify(&inner.models_dir, &name, &inner.memory)
    })
    .await
    .map_err(|error| format!("проверка не выполнилась: {error}"))?
}

/// Скачивает файл модели по ссылке: `.part` → sha256 → переименование.
///
/// Ссылку даёт человек, а не приложение: выдуманный адрес — это не «удобство», а
/// скачанный мусор с правильным именем. `sha256` необязателен; если он задан и не
/// сошёлся, файл не появится вовсе.
#[tauri::command]
pub async fn download_model(
    state: State<'_, AppState>,
    url: String,
    name: String,
    sha256: Option<String>,
) -> Result<Downloaded, String> {
    let inner = state.inner.clone();
    let run = inner.memory.start_run("download", &name).ok();

    let result = tauri::async_runtime::spawn_blocking(move || {
        download::download(
            &inner.models_dir,
            &name,
            &url,
            sha256.as_deref(),
            &inner.memory,
        )
    })
    .await
    .map_err(|error| format!("скачивание не выполнилось: {error}"))?;

    if let Some(run) = run {
        let outcome = if result.is_ok() { "ok" } else { "failed" };
        let _ = state.inner.memory.finish_run(run, outcome);
    }

    result
}

/// Удаляет файл модели.
///
/// Необратимо, поэтому подтверждение спрашивает интерфейс, а команда только делает
/// то, о чём уже договорились. Хеш из памяти убирается вместе с файлом.
#[tauri::command]
pub fn remove_model(state: State<'_, AppState>, name: String) -> Result<(), String> {
    models::remove(&state.inner.models_dir, &name, &state.inner.memory)
}

/// Последние запуски из памяти (SQLite), новые сверху. В отличие от журнала это
/// структура: запуск, шаг, итог — то, что нужно планировщику и экрану истории.
#[tauri::command]
pub fn memory_runs(state: State<'_, AppState>, limit: usize) -> Vec<RunRecord> {
    state
        .inner
        .memory
        .recent_runs(limit.clamp(1, 200))
        .unwrap_or_default()
}

/// Профили приложений: что описано и что из этого уже исполняется.
#[tauri::command]
pub fn list_profiles(state: State<'_, AppState>) -> Vec<ProfileView> {
    profiles::all()
        .iter()
        .map(|profile| profile_view(&state.inner, profile))
        .collect()
}

/// Последние события журнала — новые сверху. Экран «Журнал» читает только это:
/// сам файл остаётся источником истины, команда ничего не меняет.
#[tauri::command]
pub fn audit_tail(state: State<'_, AppState>, limit: usize) -> Vec<AuditEvent> {
    state.inner.audit.recent(limit.clamp(1, 500))
}

/// Сценарии: план из шагов. Исполняет каждый шаг интерфейс, через `run_tool` —
/// со своей политикой и своим доказательством.
#[tauri::command]
pub fn list_flows(state: State<'_, AppState>) -> Vec<FlowView> {
    flows::all()
        .iter()
        .map(|flow| flow_view(&state.inner, flow))
        .collect()
}

/// Что политика скажет про действие — без выполнения.
#[tauri::command]
pub fn policy_for(state: State<'_, AppState>, registry: String) -> PolicyView {
    let (decision, risk) = decision_of(&state.inner, &registry);
    PolicyView {
        registry,
        risk,
        decision: decision.as_str().to_string(),
        reason: decision.reason().to_string(),
        needs_token: decision.needs_token(),
    }
}

/// Подтверждение человеком: выдаёт одноразовый токен под конкретные аргументы.
#[tauri::command]
pub fn confirm_tool(
    state: State<'_, AppState>,
    registry: String,
    params: BTreeMap<String, String>,
) -> Result<ConfirmToken, String> {
    let inner = &state.inner;
    let (decision, risk) = decision_of(inner, &registry);

    match decision {
        Decision::Confirm => {
            inner.policy.prune();
            let args: Vec<(String, String)> = params.into_iter().collect();
            let token = inner.policy.issue(&registry, &args);
            let fingerprint = format!("{:016x}", policy::fingerprint(&registry, &args));
            audit(
                inner,
                Entry {
                    kind: AuditKind::Confirmed,
                    subject: &registry,
                    risk: &risk,
                    decision: decision.as_str(),
                    fingerprint: &fingerprint,
                    outcome: "confirmed",
                    duration_ms: 0,
                },
            );
            Ok(ConfirmToken {
                token,
                ttl_sec: TOKEN_TTL.as_secs(),
            })
        }
        Decision::Deny(_) => Err(decision.reason().to_string()),
        _ => Err("это действие не требует подтверждения".to_string()),
    }
}

/// Запуск инструмента. Для риска выше `read` нужен токен из `confirm_tool`.
#[tauri::command]
pub async fn run_tool(
    state: State<'_, AppState>,
    registry: String,
    params: BTreeMap<String, String>,
    token: Option<u64>,
) -> Result<StepResult, String> {
    let inner = Arc::clone(&state.inner);
    let args: Vec<(String, String)> = params.clone().into_iter().collect();
    let fingerprint = format!("{:016x}", policy::fingerprint(&registry, &args));
    let (decision, risk) = decision_of(&inner, &registry);

    match decision {
        Decision::Deny(reason) => {
            audit(
                &inner,
                Entry {
                    kind: AuditKind::Denied,
                    subject: &registry,
                    risk: &risk,
                    decision: "deny",
                    fingerprint: &fingerprint,
                    outcome: reason,
                    duration_ms: 0,
                },
            );
            return Ok(StepResult::failed(&registry, reason));
        }
        Decision::Confirm => {
            let token = match token {
                Some(token) => token,
                None => {
                    let reason = "нужно подтверждение человеком";
                    audit(
                        &inner,
                        Entry {
                            kind: AuditKind::Denied,
                            subject: &registry,
                            risk: &risk,
                            decision: "confirm",
                            fingerprint: &fingerprint,
                            outcome: reason,
                            duration_ms: 0,
                        },
                    );
                    return Ok(StepResult::failed(&registry, reason));
                }
            };
            if let Err(error) = inner.policy.consume(token, &registry, &args) {
                audit(
                    &inner,
                    Entry {
                        kind: AuditKind::Denied,
                        subject: &registry,
                        risk: &risk,
                        decision: "confirm",
                        fingerprint: &fingerprint,
                        outcome: error.as_str(),
                        duration_ms: 0,
                    },
                );
                return Ok(StepResult::failed(&registry, error.as_str()));
            }
        }
        Decision::Allow | Decision::AllowWithNotice => {}
    }

    if tools::spec(&registry).is_none() {
        return Ok(StepResult::failed(&registry, "такого инструмента ещё нет"));
    }

    inner.cancel.store(false, Ordering::Relaxed);
    audit(
        &inner,
        Entry {
            kind: AuditKind::Requested,
            subject: &registry,
            risk: &risk,
            decision: decision.as_str(),
            fingerprint: &fingerprint,
            outcome: "requested",
            duration_ms: 0,
        },
    );

    // Память пишется до запуска и после него: если приложение упадёт посреди работы,
    // в базе останется запуск со статусом `running` — это видно, а не потеряно.
    let run_id = inner.memory.start_run("tool", &registry).ok();

    let worker = Arc::clone(&inner);
    let key = registry.clone();
    // Копия нужна, потому что `params` уезжает в фоновый поток: память должна хранить
    // именно те значения, с которыми инструмент действительно работал.
    let remembered = params.clone();
    let outcome =
        tauri::async_runtime::spawn_blocking(move || tools::run(&key, &params, &worker.cancel))
            .await
            .map_err(|error| format!("исполнение прервано: {error}"))?;

    if let Some(run_id) = run_id {
        let summary = if outcome.cancelled {
            "cancelled"
        } else if outcome.ok {
            "ok"
        } else {
            "failed"
        };
        let _ = inner.memory.add_step(
            run_id,
            0,
            &registry,
            outcome.ok,
            &outcome.reason,
            outcome.evidence.kind(),
        );
        let _ = inner.memory.finish_run(run_id, summary);
    }

    // Запоминаем параметры только у удачного запуска: неудачный ввод подставлять нельзя.
    if outcome.ok && !remembered.is_empty() {
        let _ = inner.memory.remember_params(&registry, &remembered);
    }

    let summary = if outcome.ok { "ok" } else { "failed" };
    audit(
        &inner,
        Entry {
            kind: AuditKind::Finished,
            subject: &registry,
            risk: &risk,
            decision: decision.as_str(),
            fingerprint: &fingerprint,
            outcome: summary,
            duration_ms: outcome.duration_ms,
        },
    );

    Ok(outcome)
}

/// Отмена текущего запуска: флаг выставляет исполнитель, процесс убивается в `executor`.
#[tauri::command]
pub fn cancel_tool(state: State<'_, AppState>) {
    state.inner.cancel.store(true, Ordering::Relaxed);
    tracing::info!("запрошена отмена текущего шага");
}
