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
use crate::container;
use crate::custom;
use crate::download::{self, Downloaded};
use crate::flows::{self, FlowInput, FlowSpec, FlowStep};
use crate::hand;
use crate::intent;
use crate::isolation;
use crate::learn::{self, Learning};
use crate::llama;
use crate::llm;
use crate::memory::{Episode, Memory, RunRecord};
use crate::models::{self, ModelFile};
use crate::plan::{self, Answer, Plan, Problem, Question, StepGate};
use crate::planner::{self, PlanItem};
use crate::policy::{self, Decision, PolicyState, TOKEN_TTL};
use crate::profiles::{self, ProfileOperation, ProfileSpec};
use crate::registry::{Action, Registry, RegistrySnapshot};
use crate::restricted;
use crate::roles;
use crate::sandbox::{self, Verdict};
use crate::server::{self, Server};
use crate::step::StepResult;
use crate::stt;
use crate::tools::{self, ParamSpec, ToolSpec};
use crate::trial;
use crate::window;

/// Всё, что нужно командам. Один `Arc`, чтобы клонировать в фоновый поток.
pub struct Inner {
    pub registry: Registry,
    pub audit: Audit,
    pub memory: Memory,
    /// Папка моделей: модели весят гигабайты, поэтому путь явный, а не «где-то рядом».
    pub models_dir: std::path::PathBuf,
    /// Рядом с этим каталогом лежат данные приложения, логи и `sidecars/`.
    pub base_dir: std::path::PathBuf,
    /// Запущенный движок. Один: две модели на одной видеокарте — это не «параллельно»,
    /// это «обе тормозят».
    pub engine: std::sync::Mutex<Option<Server>>,
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
    /// Что даст проверка перед запуском. `None` — у этой руки нет текста команды
    /// (например, она работает системными вызовами), и тогда проверять нечего.
    pub screening: Option<Verdict>,
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

/// Проверка перед запуском для руки: текст её команды против правил `sandbox`.
/// Нет текста — нечего проверять, и это честнее, чем зелёная галочка на пустом месте.
fn screening_for(registry: &str) -> Option<Verdict> {
    tools::scripts()
        .into_iter()
        .find(|(key, _)| *key == registry)
        .map(|(_, script)| sandbox::screen_script(script))
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
        screening: screening_for(&spec.registry),
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

/// Просьба написать черновик новой руки для строки реестра `key`.
///
/// Черновик — это **текст**. Он сохраняется, показывается человеку и не исполняется: у него
/// нет пути к запуску ни в плане, ни в руках. Фильтр отсеивает очевидно недопустимое, но
/// безопасность он не гарантирует, и притворяться иначе было бы худшим из обманов.
#[tauri::command]
pub async fn draft_hand(state: State<'_, AppState>, key: String) -> Result<hand::Draft, String> {
    let inner = state.inner.clone();

    let action = inner
        .registry
        .by_key(&key)
        .ok_or_else(|| format!("такой строки нет в реестре: {key}"))?;
    let example = action.example.clone();
    let implementation = action.implementation.join(", ");

    let port = match inner.engine.lock() {
        Ok(guard) => match guard.as_ref() {
            Some(server) => server.port(),
            None => {
                return Err("движок не запущен: откройте «Модели» и запустите модель".to_string())
            }
        },
        Err(_) => return Err("движок не под контролем приложения: перезапустите его".to_string()),
    };

    let prompt = hand::prompt(&example, &example, &implementation);
    let body = llm::chat_body(&prompt, "local");
    let answered =
        tauri::async_runtime::spawn_blocking(move || llm::ask(port, &body, llm::TIMEOUT))
            .await
            .map_err(|error| format!("разговор с моделью не выполнился: {error}"))??;

    // Рука не в реестре — значит `call` тут невозможен; принимаем только `hand`.
    match intent::parse(&answered, &[]) {
        Ok(intent::Proposal::Hand { goal, code, why }) => {
            let draft = hand::accept(&key, &goal, &code, &why, now_ms() as u64)?;
            hand::save(&inner.memory, &draft)?;
            Ok(draft)
        }
        Ok(intent::Proposal::Refuse { reason }) => Err(format!("модель отказалась: {reason}")),
        Ok(other) => Err(format!(
            "ожидался черновик руки, а пришло другое: {other:?}"
        )),
        Err(_) => Err(format!(
            "ответ модели не разобрался: {}",
            truncate_words(&answered)
        )),
    }
}

/// Проба черновика в клетке: запустить и показать отчёт.
///
/// Проба **не делает черновик умением**: она только отвечает на вопрос «что он делает».
/// Если клетка не открылась, отчёт говорит это прямо, и запуска не будет: чужой текст без
/// забора не исполняется — ровно для этого клетка и писалась.
#[tauri::command]
pub async fn trial_hand(state: State<'_, AppState>, key: String) -> Result<trial::Report, String> {
    let inner = state.inner.clone();
    let draft = hand::get(&inner.memory, &key)
        .ok_or_else(|| format!("черновика для этой строки нет: {key}"))?;

    let dir = inner.base_dir.join("trial");
    std::fs::create_dir_all(&dir).map_err(|error| format!("папка пробы: {error}"))?;

    let started = now_ms() as u64;
    let code = draft.code.clone();
    let report =
        tauri::async_runtime::spawn_blocking(move || trial::run(&key, &code, &dir, started))
            .await
            .map_err(|error| format!("проба не выполнилась: {error}"))?;

    trial::save(&inner.memory, &report)?;
    Ok(report)
}

/// Принять проверенный черновик в привнесённые руки.
///
/// Это явное действие человека: черновик уже прочитан, проба пройдена. Привнесённая рука
/// **отделена** от встроенных и **не исполняется**: у неё нет пути в реестр, план или
/// `tools::spec`. Исполнение таких рук — отдельный шаг с отдельными правилами.
#[tauri::command]
pub fn adopt_hand(
    state: State<'_, AppState>,
    key: String,
    title: String,
) -> Result<custom::CustomHand, String> {
    let risk = state
        .inner
        .registry
        .by_key(&key)
        .map(|action| action.risk.as_str().to_string())
        .ok_or_else(|| format!("такой строки нет в реестре: {key}"))?;

    custom::adopt(&state.inner.memory, &key, &title, &risk, now_ms() as u64)
}

/// Привнесённые руки: добавленные человеком на его машине, отдельно от встроенных.
#[tauri::command]
pub fn custom_hands(state: State<'_, AppState>) -> Vec<custom::CustomHand> {
    custom::all(&state.inner.memory)
}

/// Убрать привнесённую руку.
#[tauri::command]
pub fn remove_custom_hand(state: State<'_, AppState>, key: String) -> Result<(), String> {
    custom::forget(&state.inner.memory, key.trim())
}

/// Последний отчёт о пробе для этой строки. Есть — значит, уже пробовали.
#[tauri::command]
pub fn trial_report(state: State<'_, AppState>, key: String) -> Option<trial::Report> {
    trial::get(&state.inner.memory, &key)
}

/// Черновики рук, свежие сверху. Ничего не запускают.
#[tauri::command]
pub fn hand_drafts(state: State<'_, AppState>) -> Vec<hand::Draft> {
    hand::all(&state.inner.memory)
}

/// Забыть черновик: человек прочитал и не хочет его держать.
#[tauri::command]
pub fn forget_hand(state: State<'_, AppState>, key: String) -> Result<(), String> {
    hand::forget(&state.inner.memory, key.trim())
}

/// Первые слова ответа модели — чтобы ошибка что-то объясняла, а не была пустой.
fn truncate_words(text: &str) -> String {
    let clean = text.replace(['\n', '\r'], " ");
    let trimmed = clean.trim();
    let cut: String = trimmed.chars().take(200).collect();
    if trimmed.chars().count() > 200 {
        format!("{cut}…")
    } else {
        cut
    }
}

/// Что модель предлагает сделать. Не выполнено и не подтверждено: решает человек.
#[derive(Debug, Serialize)]
pub struct Thought {
    /// Вопрос, который ушёл модели. Показывается целиком — без «доверьтесь нам».
    pub prompt: String,
    /// Что она ответила словами, до разбора. Видно, если разбор не удался.
    pub answer: String,
    /// Разобранное предложение. `None` — ответ не разобрался, и тогда `problem` говорит почему.
    pub proposal: Option<intent::Proposal>,
    /// План из предложения `call`, уже проведённый через политику, вопросы и подтверждения.
    /// `None` — плана нет: рука только описана, либо модель выбрала не то.
    pub plan: Option<PlanCheck>,
    /// Задача на обучение из предложения `learn`: записана в память и переживёт перезапуск.
    /// `None` — учиться не по чему (цель уже умеем или её нет в реестре).
    pub learning: Option<Learning>,
    pub problem: Option<String>,
}

/// Спросить модель, что делать. Ничего не выполняет.
///
/// Ошибки разделены: «движок не запущен» (надо запустить), «движок не отвечает» (умер),
/// «ответ не разобрался» (модель сказала ерунду). Смешивать их в одно «не получилось»
/// значит отнять у человека единственную подсказку.
#[tauri::command]
pub async fn think(
    state: State<'_, AppState>,
    query: String,
    around: Option<intent::Around>,
) -> Result<Thought, String> {
    let inner = state.inner.clone();

    let port = match inner.engine.lock() {
        Ok(guard) => match guard.as_ref() {
            Some(server) => server.port(),
            None => {
                return Err("движок не запущен: откройте «Модели» и запустите модель".to_string())
            }
        },
        Err(_) => return Err("движок не под контролем приложения: перезапустите его".to_string()),
    };

    let found = planner::plan(&inner.registry, &query, intent::MAX_CANDIDATES);
    let facts = inner
        .memory
        .facts_with_prefix("вопрос:")
        .into_iter()
        .take(intent::MAX_FACTS)
        .collect::<Vec<_>>();
    let prompt = intent::prompt(&query, around.as_ref(), &facts, &intent::candidates(&found));

    // Разговор блокирующий: ждать модель надо вне потока интерфейса, иначе окно замрёт.
    let body = llm::chat_body(&prompt, "local");
    let answered =
        tauri::async_runtime::spawn_blocking(move || llm::ask(port, &body, llm::TIMEOUT))
            .await
            .map_err(|error| format!("разговор с моделью не выполнился: {error}"))??;

    let known = found
        .iter()
        .map(|item| item.key.clone())
        .collect::<Vec<_>>();

    Ok(match intent::parse(&answered, &known) {
        Ok(proposal) => {
            // Выбор модели не идёт в обход: тот же план, те же проверки, те же вопросы и
            // то же подтверждение, что и у найденного по словам.
            let plan = match &proposal {
                intent::Proposal::Call {
                    registry,
                    params,
                    why,
                } => plan::chosen(&query, registry, params.clone(), &inner.registry, why).map(
                    |plan| PlanCheck {
                        problems: plan::check(&plan, &inner.registry),
                        gates: plan::gate_plan(&plan, &inner.registry, &[]),
                        questions: plan::questions(&plan, &inner.registry),
                        plan: Some(plan),
                    },
                ),
                _ => None,
            };

            // «Надо научиться» — это не фраза в воздух: просьба записывается так же, как
            // любая другая, и повтор поднимает её в очереди.
            let learning = match &proposal {
                intent::Proposal::Learn { goal, .. } => learn::request_for_goal(
                    &inner.memory,
                    &inner.registry,
                    goal,
                    &query,
                    now_ms() as u64,
                ),
                _ => None,
            };

            Thought {
                prompt,
                answer: answered,
                proposal: Some(proposal),
                plan,
                learning,
                problem: None,
            }
        }
        // Ответ есть, но не разобрался — это не ошибка команды: показать его человеку
        // полезнее, чем спрятать за «не получилось».
        Err(error) => Thought {
            prompt,
            answer: answered,
            proposal: None,
            plan: None,
            learning: None,
            problem: Some(error.to_string()),
        },
    })
}

/// Что мы спросим у модели по этой фразе.
///
/// Это не ответ модели и не выполнение: команда собирает вопрос — задачу, окно перед
/// человеком, память фактов и найденные руки. Нужна, чтобы разговор с моделью был виден
/// целиком, а не прятался в логах. Модели нет — вопрос всё равно есть.
#[tauri::command]
pub fn model_prompt(
    state: State<'_, AppState>,
    query: String,
    around: Option<intent::Around>,
) -> String {
    let inner = &state.inner;
    let found = planner::plan(&inner.registry, &query, intent::MAX_CANDIDATES);
    let facts = inner
        .memory
        .facts_with_prefix("вопрос:")
        .into_iter()
        .take(intent::MAX_FACTS)
        .collect::<Vec<_>>();

    intent::prompt(&query, around.as_ref(), &facts, &intent::candidates(&found))
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

/// Что известно о движке моделей.
#[derive(Debug, Serialize)]
pub struct EngineStatus {
    /// Найден ли `llama-server.exe` рядом с приложением или в `PATH`.
    pub found: bool,
    /// Полный путь к движку, если он найден.
    pub program: Option<String>,
    /// Где приложение его ищет — это нужно, чтобы человек знал, куда положить файл.
    pub search_dir: String,
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
}

fn read_engine_status(state: &AppState) -> EngineStatus {
    let program = llama::find_program(&state.inner.base_dir);

    let (running, port, pid) = match state.inner.engine.lock() {
        Ok(guard) => match guard.as_ref() {
            Some(server) => (true, Some(server.port()), Some(server.pid())),
            None => (false, None, None),
        },
        // Отравленный мьютекс: считаем, что движок не под нашим контролем.
        Err(_) => (false, None, None),
    };

    EngineStatus {
        found: program.is_some(),
        program: program.map(|path| path.display().to_string()),
        search_dir: state.inner.base_dir.join("sidecars").display().to_string(),
        running,
        port,
        pid,
    }
}

/// Состояние движка. Ничего не запускает — просто отвечает, что есть.
#[tauri::command]
pub fn engine_status(state: State<'_, AppState>) -> EngineStatus {
    read_engine_status(&state)
}

/// Запускает `llama-server` с файлом модели `name`.
///
/// Ошибки разные и говорят разное: «движка нет» (положите файл), «модели нет»
/// (скачайте) и «не ответил за 60 с» (смотрите лог). Смешивать их в одно «не удалось»
/// значит отнять у человека единственную подсказку.
#[tauri::command]
pub async fn start_engine(
    state: State<'_, AppState>,
    name: String,
) -> Result<EngineStatus, String> {
    if state
        .inner
        .engine
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
    {
        return Err("движок уже запущен — сначала остановите его".to_string());
    }

    let inner = state.inner.clone();
    let model = inner.models_dir.join(&name);
    if !model.is_file() {
        return Err(format!("файла модели нет: {name}"));
    }

    let program = llama::find_program(&inner.base_dir).ok_or_else(|| {
        format!(
            "движок не найден: положите llama-server.exe в {}",
            inner.base_dir.join("sidecars").display()
        )
    })?;

    let port = server::free_port()?;
    let log = inner.base_dir.join(format!("llama-server-{port}.log"));
    let spec = llama::spec(&program, &model, port);
    let run = inner.memory.start_run("server", &name).ok();

    let started = tauri::async_runtime::spawn_blocking(move || {
        Server::start(&spec, &log, std::time::Duration::from_secs(60))
    })
    .await
    .map_err(|error| format!("запуск не выполнился: {error}"))?;

    let result = match started {
        Ok(server) => {
            if let Ok(mut guard) = state.inner.engine.lock() {
                *guard = Some(server);
            }
            Ok(())
        }
        Err(error) => Err(error),
    };

    if let Some(run) = run {
        let outcome = if result.is_ok() { "ok" } else { "failed" };
        let _ = state.inner.memory.finish_run(run, outcome);
    }

    result.map(|()| read_engine_status(&state))
}

/// Останавливает движок. Не запущен — не ошибка: цель достигнута.
#[tauri::command]
pub fn stop_engine(state: State<'_, AppState>) -> EngineStatus {
    let taken = state
        .inner
        .engine
        .lock()
        .ok()
        .and_then(|mut guard| guard.take());

    if let Some(mut server) = taken {
        if let Err(error) = server.stop() {
            tracing::warn!(%error, "движок не остановился штатно");
        }
    }

    read_engine_status(&state)
}

/// Роль модели в интерфейсе: требование роли плюс то, что на неё назначено.
#[derive(Debug, Serialize)]
pub struct RoleView {
    pub id: String,
    pub title: String,
    pub purpose: String,
    pub max_bytes: u64,
    /// Назначенный файл (только имя, без пути).
    pub assigned: Option<String>,
    /// Размер назначенного файла, если его удалось узнать.
    pub assigned_bytes: Option<u64>,
    /// Влезает ли назначенный файл в потолок роли.
    pub fits: bool,
}

fn role_views(state: &AppState) -> Vec<RoleView> {
    let dir = &state.inner.models_dir;
    let files = models::scan(dir).unwrap_or_default();

    roles::all()
        .iter()
        .map(|role| {
            let assigned = roles::assigned(&state.inner.memory, &role.id);
            let size = assigned.as_ref().and_then(|name| {
                files
                    .iter()
                    .find(|file| &file.name == name)
                    .map(|file| file.size_bytes)
            });

            RoleView {
                id: role.id.clone(),
                title: role.title.clone(),
                purpose: role.purpose.clone(),
                max_bytes: role.max_bytes,
                fits: size.is_none_or(|bytes| roles::fits(role, bytes)),
                assigned,
                assigned_bytes: size,
            }
        })
        .collect()
}

/// Роли моделей: что от них требуется и какая модель на роль назначена.
#[tauri::command]
pub fn list_roles(state: State<'_, AppState>) -> Vec<RoleView> {
    role_views(&state)
}

/// Назначить файл на роль. Файл обязан существовать: роль, которая указывает в пустоту,
/// выглядит настроенной, но ею не является.
#[tauri::command]
pub fn assign_role(
    state: State<'_, AppState>,
    role: String,
    name: String,
) -> Result<Vec<RoleView>, String> {
    roles::assign(&state.inner.models_dir, &state.inner.memory, &role, &name)?;
    Ok(role_views(&state))
}

/// Снять назначение с роли.
#[tauri::command]
pub fn clear_role(state: State<'_, AppState>, role: String) -> Result<Vec<RoleView>, String> {
    roles::clear(&state.inner.memory, &role)?;
    Ok(role_views(&state))
}

/// Результат проверки плана: сам план (если разобрался) и список проблем.
#[derive(Debug, Serialize)]
pub struct PlanCheck {
    pub plan: Option<Plan>,
    /// Пусто — план исполним. Каждая проблема называет шаг и причину.
    pub problems: Vec<Problem>,
    /// Что можно сразу, а что человек должен разрешить. Считается без разрешений:
    /// интерфейс показывает галочки именно там, где они нужны.
    pub gates: Vec<StepGate>,
    /// Чего не хватает шагам. Спросить это — дело интерфейса; ответ вернётся в
    /// `fill_plan`, а не в свободный текст.
    pub questions: Vec<Question>,
}

/// Проверяет план из JSON. Ничего не исполняет: это ровно то, что должно случиться
/// до первого шага — иначе план из модели исполнялся бы «на доверии».
#[tauri::command]
pub fn check_plan(state: State<'_, AppState>, json: String) -> PlanCheck {
    match plan::parse(&json) {
        Err(error) => PlanCheck {
            plan: None,
            problems: vec![Problem {
                position: 0,
                registry: String::new(),
                problem: error,
            }],
            gates: Vec::new(),
            questions: Vec::new(),
        },
        Ok(parsed) => PlanCheck {
            problems: plan::check(&parsed, &state.inner.registry),
            gates: plan::gate_plan(&parsed, &state.inner.registry, &[]),
            questions: plan::questions(&parsed, &state.inner.registry),
            plan: Some(parsed),
        },
    }
}

/// Сохраняет проверенный план в памяти. Невалидный план не сохраняется: память не
/// должна помнить то, что нельзя исполнить.
#[tauri::command]
pub fn save_plan(state: State<'_, AppState>, json: String) -> Result<PlanCheck, String> {
    let parsed = plan::parse(&json)?;
    let problems = plan::check(&parsed, &state.inner.registry);
    let gates = plan::gate_plan(&parsed, &state.inner.registry, &[]);
    let questions = plan::questions(&parsed, &state.inner.registry);
    if !problems.is_empty() {
        return Ok(PlanCheck {
            plan: Some(parsed),
            problems,
            gates,
            questions,
        });
    }

    plan::remember(&state.inner.memory, &parsed)?;
    Ok(PlanCheck {
        plan: Some(parsed),
        problems: Vec::new(),
        gates,
        questions,
    })
}

/// Черновик плана из сказанного: один шаг, который приложение правда умеет.
///
/// Это запасной путь, а не замена модели: шаг берётся из реестра по совпадению слов, а
/// данные для него — из памяти прошлого удачного запуска. Ничего не выдумывается, и
/// если данных не хватает, `problems` скажет, каких именно.
#[tauri::command]
pub fn draft_plan(state: State<'_, AppState>, query: String) -> Option<PlanCheck> {
    let inner = &state.inner;

    // Сначала находим шаг, потом спрашиваем память по его ключу: параметры хранятся по
    // инструменту, а имя инструмента известно только после поиска.
    let found = plan::draft(&query, &inner.registry, None)?;
    let key = found.steps[0].registry.clone();
    let plan = match inner.memory.last_params(&key) {
        Some(params) => plan::draft(&query, &inner.registry, Some(params))?,
        None => found,
    };

    Some(PlanCheck {
        problems: plan::check(&plan, &inner.registry),
        gates: plan::gate_plan(&plan, &inner.registry, &[]),
        questions: plan::questions(&plan, &inner.registry),
        plan: Some(plan),
    })
}

/// Вписывает ответы человека в план и перепроверяет его.
///
/// Это и есть уточнение: приложение спросило — человек ответил — план стал исполнимым.
/// Ничего не запускается: запуск остаётся отдельным решением.
#[tauri::command]
pub fn fill_plan(
    state: State<'_, AppState>,
    json: String,
    answers: Vec<Answer>,
) -> Result<PlanCheck, String> {
    let mut parsed = plan::parse(&json)?;
    plan::fill(&mut parsed, &answers)?;

    let rechecked = serde_json::to_string(&parsed)
        .map_err(|error| format!("план не переписывается: {error}"))?;

    let _ = plan::remember(&state.inner.memory, &parsed);
    Ok(check_plan(state, rechecked))
}

/// Записать просьбу как задачу на обучение и рассказать, что для неё нужно.
///
/// Вызывается, когда приложение не нашло, чем выполнить сказанное. `None` означает
/// «учиться нечему»: либо это уже умеем, либо в реестре такого нет вовсе.
#[tauri::command]
pub fn request_learning(
    state: State<'_, AppState>,
    query: String,
) -> Result<Option<Learning>, String> {
    let inner = &state.inner;

    // Первая строка, которую человек имел в виду: если у неё уже есть рука — учиться
    // нечему, и молчать об этом честнее, чем записывать в список дел.
    let Some(item) = planner::plan(&inner.registry, &query, 8).into_iter().next() else {
        return Ok(None);
    };
    if item.tool.is_some() {
        return Ok(None);
    }

    let Some(action) = inner.registry.by_key(&item.key) else {
        return Ok(None);
    };

    // Журнал считает время в `u128`, память — в `u64`: просьбе хватает миллисекунд.
    learn::request(&inner.memory, action, &query, now_ms() as u64).map(Some)
}

/// Всё, чему приложение ещё не научилось, — самое просимое сверху.
#[tauri::command]
pub fn learning_requests(state: State<'_, AppState>) -> Vec<Learning> {
    learn::all(&state.inner.memory, &state.inner.registry)
}

/// Последний сохранённый план, если он был.
#[tauri::command]
pub fn last_plan(state: State<'_, AppState>) -> Option<Plan> {
    plan::last(&state.inner.memory)
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

/// Поиск по памяти: «что я делал с этой папкой?». Каждое слово запроса обязано
/// найтись, и ответ говорит, какие слова совпали — иначе поиск по памяти выглядит
/// как гадание.
#[tauri::command]
pub fn search_episodes(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Vec<Episode> {
    let limit = limit.unwrap_or(20).clamp(1, 100);
    state.inner.memory.search(&query, limit).unwrap_or_default()
}

/// Что известно о локальном распознавании речи.
#[derive(Debug, Serialize)]
pub struct SpeechStatus {
    /// Найден ли `whisper-server.exe` рядом с приложением или в `PATH`.
    pub found: bool,
    pub program: Option<String>,
    /// Файл модели распознавания, если он лежит в папке моделей.
    pub model: Option<String>,
    /// Куда положить движок и модель — чтобы человеку не гадать.
    pub search_dir: String,
    pub models_dir: String,
}

/// Модель распознавания: `ggml-*.bin` в папке моделей. Имя проверяется по смыслу,
/// потому что `.bin` бывает разный, а брать «первый попавшийся» — значит подсунуть
/// движку чужие веса и получить мусор вместо текста.
fn speech_model(inner: &Inner) -> Option<std::path::PathBuf> {
    let entries = std::fs::read_dir(&inner.models_dir).ok()?;
    let mut found: Vec<std::path::PathBuf> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path
                .file_name()
                .map(|name| name.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            path.is_file()
                && name.ends_with(".bin")
                && (name.contains("whisper") || name.starts_with("ggml-"))
        })
        .collect();
    found.sort();
    found.into_iter().next()
}

fn read_speech_status(state: &AppState) -> SpeechStatus {
    let inner = &state.inner;
    let program = stt::find_program(&inner.base_dir);
    let model = speech_model(inner);

    SpeechStatus {
        found: program.is_some(),
        program: program.map(|path| path.display().to_string()),
        model: model.map(|path| path.display().to_string()),
        search_dir: inner.base_dir.join("sidecars").display().to_string(),
        models_dir: inner.models_dir.display().to_string(),
    }
}

/// Факт, который человек уже говорил: «папка для отчётов — D:\\Отчёты».
#[derive(Debug, Serialize)]
pub struct Fact {
    pub key: String,
    pub value: String,
}

/// Что приложение уже знает. Пустая память — пустой список, а не ошибка.
#[tauri::command]
pub fn facts(state: State<'_, AppState>) -> Vec<Fact> {
    state
        .inner
        .memory
        .facts()
        .into_iter()
        .map(|(key, value)| Fact { key, value })
        .collect()
}

/// Запомнить сказанное, чтобы не спрашивать второй раз.
#[tauri::command]
pub fn remember_fact(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let key = key.trim();
    let value = value.trim();
    if key.is_empty() || value.is_empty() {
        return Err("нечего запоминать: нужен и вопрос, и ответ".to_string());
    }

    state
        .inner
        .memory
        .remember(key, value)
        .map_err(|error| format!("память не ответила: {error}"))
}

/// Забыть факт: человек имеет право на «я этого больше не говорил».
#[tauri::command]
pub fn forget_fact(state: State<'_, AppState>, key: String) -> Result<(), String> {
    state
        .inner
        .memory
        .forget(key.trim())
        .map_err(|error| format!("память не ответила: {error}"))
}

/// Что сейчас перед человеком. Только чтение: ни клика, ни переключения окон.
#[tauri::command]
pub fn foreground_window() -> Result<window::Foreground, String> {
    window::foreground().map_err(|reason| format!("{reason}. {}", window::note()))
}

/// Что известно о потолках запуска на этой машине.
#[derive(Debug, Serialize)]
pub struct IsolationStatus {
    /// Держит ли система потолки (job object — только Windows).
    pub available: bool,
    /// Потолки пробного запуска словами.
    pub summary: String,
    /// Что именно происходит — и чего не происходит.
    pub note: String,
}

/// Что за клетка у недоверенной команды: AppContainer или (если его нет) хотя бы
/// ограниченный токен.
fn shelter_note(inner: &Inner) -> String {
    if container::available() {
        // Проверяем на месте: система умеет, но профиль может не создаться (так бывает в
        // служебных сессиях), и тогда обещать забор нельзя.
        container::state_note(&inner.base_dir.join("sandbox-probe"))
    } else {
        restricted::note()
    }
}

/// Потолки для запуска: что есть на самом деле, а не что хотелось бы.
#[tauri::command]
pub fn isolation_status(state: State<'_, AppState>) -> IsolationStatus {
    IsolationStatus {
        available: isolation::available(),
        summary: isolation::Limits::trial().describe(),
        note: format!("{}. {}", isolation::note(), shelter_note(&state.inner)),
    }
}

/// Есть ли чем распознавать локально. Ничего не запускает.
#[tauri::command]
pub fn speech_status(state: State<'_, AppState>) -> SpeechStatus {
    read_speech_status(&state)
}

/// Распознаёт запись своим движком, не выпуская звук из компьютера.
///
/// Движок поднимается на один запрос и сразу останавливается: распознавание идёт
/// редко и короткими кусками, а висящий процесс — это утечка, о которой человек не
/// знает. Ошибки разные: нет движка, нет модели, не открыл порт, не разобрал.
#[tauri::command]
pub async fn transcribe_local(
    state: State<'_, AppState>,
    audio: Vec<u8>,
) -> Result<String, String> {
    let inner = state.inner.clone();
    let status = read_speech_status(&state);

    let program = stt::find_program(&inner.base_dir).ok_or_else(|| {
        format!(
            "локально распознавать нечем: положите whisper-server.exe в {}",
            status.search_dir
        )
    })?;
    let model = speech_model(&inner).ok_or_else(|| {
        format!(
            "нет модели распознавания: положите ggml-*.bin в {}",
            status.models_dir
        )
    })?;

    if audio.is_empty() {
        return Err("нечего распознавать: пустая запись".to_string());
    }

    let run = inner
        .memory
        .start_run("speech", "локальное распознавание")
        .ok();
    // Копия для записи итога: замыкание забирает свою.
    let memory_owner = inner.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let port = server::free_port()?;
        let log = inner.base_dir.join(format!("whisper-server-{port}.log"));
        let mut child = stt::start(
            &program,
            &model,
            port,
            &log,
            std::time::Duration::from_secs(60),
        )?;

        let text = stt::post(port, &audio, stt::TIMEOUT);

        // Останавливаем всегда, даже если распознавание не удалось: движок не должен
        // переживать запрос.
        let stopped = child.kill().and_then(|()| child.wait());
        if let Err(error) = stopped {
            tracing::warn!("движок распознавания не остановился: {error}");
        }

        text
    })
    .await
    .map_err(|error| format!("распознавание не выполнилось: {error}"))?;

    if let Some(run) = run {
        let outcome = if result.is_ok() { "ok" } else { "failed" };
        let _ = memory_owner.memory.finish_run(run, outcome);
    }

    result
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

/// Что произошло на одном шаге плана.
#[derive(Debug, Serialize)]
pub struct PlanStepRun {
    pub position: usize,
    pub registry: String,
    /// `ok`, `failed` или `cancelled`.
    pub status: String,
    pub reason: String,
    pub evidence: String,
    pub duration_ms: u64,
}

/// Отчёт о запуске плана. `stopped` пуст только если план прошёл целиком.
#[derive(Debug, Serialize)]
pub struct PlanReport {
    pub goal: String,
    pub steps: Vec<PlanStepRun>,
    pub stopped: Option<String>,
    pub run_id: Option<i64>,
}

/// Запускает план шаг за шагом. `approved` — номера шагов, которые человек разрешил
/// (с единицы): шаг с риском выше чтения без разрешения не запускается, и это
/// решается *до* первого шага, чтобы план не останавливался на середине.
///
/// Шаги идут по порядку и без параллельности: план — это последовательность, а не
/// набор. Ошибка шага останавливает план: продолжать после неудачи значит делать
/// следующий шаг на неверных данных.
#[tauri::command]
pub async fn run_plan(
    state: State<'_, AppState>,
    json: String,
    approved: Vec<usize>,
) -> Result<PlanReport, String> {
    let inner = Arc::clone(&state.inner);
    let plan = plan::parse(&json)?;

    let problems = plan::check(&plan, &inner.registry);
    if let Some(problem) = problems.first() {
        return Err(format!("план не запущен: {}", problem.problem));
    }

    let gates = plan::gate_plan(&plan, &inner.registry, &approved);
    if let Some(blocker) = plan::blocker(&gates) {
        return Err(format!("план не запущен: {blocker}"));
    }

    // План запоминается до первого шага: он уже проверен, а итог запуска — отдельная
    // история, которую ведёт журнал и память запусков.
    let _ = plan::remember(&inner.memory, &plan);

    let run_id = inner.memory.start_run("plan", &plan.goal).ok();
    inner.cancel.store(false, Ordering::Relaxed);

    let mut steps = Vec::new();
    let mut stopped: Option<String> = None;

    for (index, step) in plan.steps.iter().enumerate() {
        let position = index + 1;
        let key = step.registry.trim().to_string();
        let args: Vec<(String, String)> = step.params.clone().into_iter().collect();
        let fingerprint = format!("{:016x}", policy::fingerprint(&key, &args));
        let (decision, risk) = decision_of(&inner, &key);

        // Человек разрешил этот шаг в окне плана, поэтому токен выдаётся и сразу
        // тратится здесь: правило «один токен на одно действие» остаётся в силе, а
        // подтверждение остаётся подтверждением, просто данным заранее.
        if decision.needs_token() {
            let token = inner.policy.issue(&key, &args);
            audit(
                &inner,
                Entry {
                    kind: AuditKind::Confirmed,
                    subject: &key,
                    risk: &risk,
                    decision: decision.as_str(),
                    fingerprint: &fingerprint,
                    outcome: "approved in plan",
                    duration_ms: 0,
                },
            );
            if let Err(error) = inner.policy.consume(token, &key, &args) {
                stopped = Some(format!("шаг {position}: {}", error.as_str()));
                break;
            }
        }

        audit(
            &inner,
            Entry {
                kind: AuditKind::Requested,
                subject: &key,
                risk: &risk,
                decision: decision.as_str(),
                fingerprint: &fingerprint,
                outcome: "requested",
                duration_ms: 0,
            },
        );

        let worker = Arc::clone(&inner);
        let running = key.clone();
        let params = step.params.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            tools::run(&running, &params, &worker.cancel)
        })
        .await
        .map_err(|error| format!("исполнение прервано: {error}"))?;

        let status = if outcome.cancelled {
            "cancelled"
        } else if outcome.ok {
            "ok"
        } else {
            "failed"
        };

        audit(
            &inner,
            Entry {
                kind: AuditKind::Finished,
                subject: &key,
                risk: &risk,
                decision: decision.as_str(),
                fingerprint: &fingerprint,
                outcome: status,
                duration_ms: outcome.duration_ms,
            },
        );

        if let Some(run_id) = run_id {
            let _ = inner.memory.add_step(
                run_id,
                position as i64,
                &key,
                outcome.ok,
                &outcome.reason,
                outcome.evidence.kind(),
            );
        }

        steps.push(PlanStepRun {
            position,
            registry: key,
            status: status.to_string(),
            reason: outcome.reason.clone(),
            evidence: outcome.evidence.kind().to_string(),
            duration_ms: outcome.duration_ms,
        });

        if outcome.cancelled {
            stopped = Some("отменено человеком".to_string());
            break;
        }
        if !outcome.ok {
            stopped = Some(format!("шаг {position} не выполнен: {}", outcome.reason));
            break;
        }
    }

    if let Some(run_id) = run_id {
        let summary = if stopped.is_some() { "stopped" } else { "ok" };
        let _ = inner.memory.finish_run(run_id, summary);
    }

    Ok(PlanReport {
        goal: plan.goal.clone(),
        steps,
        stopped,
        run_id,
    })
}

/// Отмена текущего запуска: флаг выставляет исполнитель, процесс убивается в `executor`.
#[tauri::command]
pub fn cancel_tool(state: State<'_, AppState>) {
    state.inner.cancel.store(true, Ordering::Relaxed);
    tracing::info!("запрошена отмена текущего шага");
}
