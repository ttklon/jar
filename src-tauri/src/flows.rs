//! Сценарии: несколько «рук» подряд, как одна процедура.
//!
//! Сценарий — это **план**, а не исполнение. Ядро отдаёт шаги интерфейсу, а каждый
//! шаг идёт обычным путём `run_tool`: своя политика, свой журнал, своя проверка
//! результата. Поэтому сценарий не может обойти ограничения одиночного действия —
//! и опасный шаг внутри «безобидной» процедуры всё равно спросит человека.
//!
//! Описание лежит в данных (`data/flows.json`), его читают Rust, интерфейс и
//! валидатор `tools/flows.py`. Главное правило, которое проверяется и там, и здесь:
//! риск сценария не ниже риска самого опасного его шага.

use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::registry::Risk;

const FLOWS_JSON: &str = include_str!("../../data/flows.json");

/// Вход сценария: то, что человек вводит один раз на весь сценарий.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowInput {
    /// Латиницей: имя используется в шагах как `$имя`.
    pub name: String,
    pub label: String,
    pub placeholder: String,
    pub hint: String,
    pub required: bool,
}

/// Один шаг: инструмент и его параметры (значения или ссылки `$вход`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowStep {
    pub tool: String,
    /// Что произойдёт — человеческими словами, а не именем инструмента.
    pub note: String,
    #[serde(default)]
    pub params: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlowSpec {
    pub id: String,
    pub title: String,
    pub summary: String,
    /// Строка реестра, которую сценарий обещает выполнить.
    pub registry: String,
    pub risk: Risk,
    #[serde(default)]
    pub inputs: Vec<FlowInput>,
    pub steps: Vec<FlowStep>,
}

static FLOWS: OnceLock<Vec<FlowSpec>> = OnceLock::new();

/// Все сценарии. Состав проверяется в CI (`tools/flows.py`) и тестами ниже.
pub fn all() -> &'static [FlowSpec] {
    FLOWS.get_or_init(|| {
        serde_json::from_str(FLOWS_JSON).expect("data/flows.json обязан быть валидным (CI)")
    })
}

pub fn get(id: &str) -> Option<&'static FlowSpec> {
    all().iter().find(|flow| flow.id == id)
}

/// Подставляет значения входов в параметры шага.
///
/// `$имя` → значение входа. Неизвестный вход или пустое значение — ошибка: шаг с
/// пустым путём не должен уйти в PowerShell «на всякий случай».
pub fn resolve_step(
    step: &FlowStep,
    values: &BTreeMap<String, String>,
) -> Result<BTreeMap<String, String>, String> {
    let mut resolved = BTreeMap::new();

    for (name, raw) in &step.params {
        let value = match raw.strip_prefix('$') {
            Some(input) => match values.get(input) {
                Some(value) if !value.trim().is_empty() => value.clone(),
                _ => return Err(format!("не заполнен вход «{input}»")),
            },
            None => raw.clone(),
        };
        resolved.insert(name.clone(), value);
    }

    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::Registry;
    use crate::tools;

    fn registry() -> Registry {
        Registry::load().expect("реестр читается")
    }

    #[test]
    fn ids_are_slugs_and_unique() {
        let mut seen = std::collections::HashSet::new();
        for flow in all() {
            assert!(
                flow.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
                "id «{}» должен быть слагом",
                flow.id
            );
            assert!(seen.insert(&flow.id), "id «{}» повторяется", flow.id);
        }
    }

    #[test]
    fn every_step_points_at_a_known_tool() {
        for flow in all() {
            for step in &flow.steps {
                assert!(
                    tools::spec(&step.tool).is_some(),
                    "сценарий «{}» ссылается на несуществующий инструмент «{}»",
                    flow.id,
                    step.tool
                );
            }
        }
    }

    #[test]
    fn every_tool_and_flow_is_in_the_registry() {
        let registry = registry();
        for flow in all() {
            assert!(
                registry.by_key(&flow.registry).is_some(),
                "сценарий «{}» обещает «{}», которого нет в реестре",
                flow.id,
                flow.registry
            );
            for step in &flow.steps {
                assert!(
                    registry.by_key(&step.tool).is_some(),
                    "шаг «{}» сценария «{}» не имеет строки в реестре",
                    step.tool,
                    flow.id
                );
            }
        }
    }

    #[test]
    fn declared_risk_is_the_worst_step() {
        let registry = registry();
        for flow in all() {
            let worst = flow
                .steps
                .iter()
                .filter_map(|step| registry.by_key(&step.tool).map(|action| action.risk))
                .max()
                .unwrap_or(Risk::Read);
            assert_eq!(
                flow.risk, worst,
                "сценарий «{}» объявляет риск {:?}, а самый опасный шаг — {:?}",
                flow.id, flow.risk, worst
            );
            assert!(
                !flow.risk.is_forbidden_for_agent(),
                "сценарий «{}» обещает действие, которое система не выполняет",
                flow.id
            );
        }
    }

    #[test]
    fn placeholders_refer_to_declared_inputs() {
        for flow in all() {
            let declared: Vec<&str> = flow.inputs.iter().map(|input| input.name.as_str()).collect();
            for step in &flow.steps {
                for raw in step.params.values() {
                    if let Some(input) = raw.strip_prefix('$') {
                        assert!(
                            declared.contains(&input),
                            "сценарий «{}» использует вход «{input}», которого нет в объявлении",
                            flow.id
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn resolve_replaces_inputs_and_refuses_gaps() {
        let step = FlowStep {
            tool: "files|создать|папку".to_string(),
            note: "создать".to_string(),
            params: BTreeMap::from([("path".to_string(), "$folder".to_string())]),
        };

        let filled = BTreeMap::from([("folder".to_string(), "C:\\tmp".to_string())]);
        let resolved = resolve_step(&step, &filled).expect("вход заполнен");
        assert_eq!(resolved["path"], "C:\\tmp");

        let empty = BTreeMap::new();
        assert!(resolve_step(&step, &empty).is_err(), "пустой вход — это ошибка");
    }
}
