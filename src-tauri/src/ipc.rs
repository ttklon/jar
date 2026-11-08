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
use crate::policy::{self, Decision, PolicyState, TOKEN_TTL};
use crate::registry::{Action, Registry, RegistrySnapshot};
use crate::step::StepResult;
use crate::tools::{self, ParamSpec, ToolSpec};

/// Всё, что нужно командам. Один `Arc`, чтобы клонировать в фоновый поток.
pub struct Inner {
    pub registry: Registry,
    pub audit: Audit,
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
    serde_json::to_value(action.risk)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .unwrap_or_else(|| "unknown".to_string())
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
    }
}

/// Десять инструментов, которые уже умеют работать.
#[tauri::command]
pub fn list_tools(state: State<'_, AppState>) -> Vec<ToolView> {
    tools::all()
        .iter()
        .map(|spec| view(&state.inner, spec))
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

    let worker = Arc::clone(&inner);
    let key = registry.clone();
    let outcome =
        tauri::async_runtime::spawn_blocking(move || tools::run(&key, &params, &worker.cancel))
            .await
            .map_err(|error| format!("исполнение прервано: {error}"))?;

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
