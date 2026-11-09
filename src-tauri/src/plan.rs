//! План: несколько шагов как данные, а не как код.
//!
//! План — это то, что предложит модель (или человек напишет руками), и до исполнения
//! он обязан пройти проверку. Правила простые и жёсткие:
//!
//! * каждый шаг — строка реестра, а не свободный текст;
//! * у шага должна быть «рука», иначе план обещает то, чего приложение не умеет;
//! * политика не должна запрещать шаг (`deny` — это «не делаем никогда»);
//! * у шага есть объяснение: план без «зачем» неотличим от случайного списка.
//!
//! Плана из модели пока нет — сначала схема и валидатор, которые можно проверить без
//! неё. Хранится план в памяти как факт: он принадлежит запуску, а не файлу.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::memory::Memory;
use crate::planner;
use crate::policy;
use crate::registry::Registry;
use crate::tools;

/// Сколько шагов ещё считается планом. Длиннее — это уже сценарий, и его место в
/// `data/flows.json`, где шаги проверяются валидатором данных.
pub const MAX_STEPS: usize = 12;

/// Ключ факта, под которым лежит последний план.
pub const FACT_KEY: &str = "plan:last";

/// Один план.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    /// Что человек попросил — дословно, а не пересказ.
    pub goal: String,
    /// Откуда план: `model`, `human` или `flow`.
    #[serde(default)]
    pub source: String,
    pub steps: Vec<PlanStep>,
}

/// Шаг плана.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    /// Ключ реестра `domain|verb|object`.
    pub registry: String,
    #[serde(default)]
    pub params: BTreeMap<String, String>,
    /// Зачем этот шаг нужен в этом плане.
    #[serde(default)]
    pub why: String,
}

/// Что не так с планом: где, в каком шаге и что именно.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Problem {
    /// Ноль означает «проблема не в шаге, а в плане целиком».
    pub position: usize,
    pub registry: String,
    pub problem: String,
}

impl Problem {
    fn whole(problem: impl Into<String>) -> Self {
        Self {
            position: 0,
            registry: String::new(),
            problem: problem.into(),
        }
    }

    fn step(position: usize, registry: &str, problem: impl Into<String>) -> Self {
        Self {
            position: position + 1,
            registry: registry.to_string(),
            problem: problem.into(),
        }
    }
}

/// Чего не хватает шагу, чтобы он мог состояться. Спрашиваем ровно это и ничего
/// больше: лишний вопрос — это не забота, а недоверие.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Question {
    /// Номер шага, с единицы.
    pub position: usize,
    /// Имя параметра: по нему приходит ответ.
    pub name: String,
    /// Как спросить по-человечески.
    pub label: String,
    /// Подсказка: что именно вписать.
    pub hint: String,
}

/// Ответ человека на вопрос шага.
#[derive(Debug, Clone, Deserialize)]
pub struct Answer {
    pub position: usize,
    pub name: String,
    pub value: String,
}

/// Что надо спросить у человека до запуска.
pub fn questions(plan: &Plan, registry: &Registry) -> Vec<Question> {
    let mut asked = Vec::new();

    for (index, step) in plan.steps.iter().enumerate() {
        let Some(spec) = tools::spec(step.registry.trim()) else {
            continue;
        };
        // Неизвестная строка реестра — это проблема плана, а не вопрос человеку.
        if registry.by_key(step.registry.trim()).is_none() {
            continue;
        }

        for param in spec.params.iter().filter(|param| param.required) {
            if step
                .params
                .get(&param.name)
                .is_some_and(|value| !value.trim().is_empty())
            {
                continue;
            }
            asked.push(Question {
                position: index + 1,
                name: param.name.clone(),
                label: param.label.clone(),
                hint: param.hint.clone(),
            });
        }
    }

    asked
}

/// Вписывает ответы в шаги плана.
///
/// Отвечать можно только за параметр, который этот шаг действительно спрашивает:
/// иначе в плане оказалось бы поле, которого инструмент не понимает, и оно молча
/// уехало бы в запуск.
pub fn fill(plan: &mut Plan, answers: &[Answer]) -> Result<(), String> {
    for answer in answers {
        let value = answer.value.trim();
        if value.is_empty() {
            return Err(format!("пустой ответ на «{}»", answer.name));
        }

        let step = plan
            .steps
            .get_mut(answer.position.saturating_sub(1))
            .ok_or_else(|| format!("шага {} в плане нет", answer.position))?;

        let spec = tools::spec(step.registry.trim())
            .ok_or_else(|| format!("у шага {} нет инструмента", answer.position))?;
        if !spec.params.iter().any(|param| param.name == answer.name) {
            return Err(format!(
                "шаг {} не спрашивает «{}»",
                answer.position, answer.name
            ));
        }

        step.params.insert(answer.name.clone(), value.to_string());
    }

    Ok(())
}

/// Решение по одному шагу до запуска: что можно делать сразу, а что человек должен
/// разрешить. Заполняется целиком до первого шага — план либо начинается, либо нет.
#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct StepGate {
    /// Номер шага, начиная с единицы.
    pub position: usize,
    pub registry: String,
    /// `allow`, `allow_with_notice`, `confirm` или `deny`.
    pub decision: String,
    /// Риск строки реестра: `read`, `write-local`, `destructive`.
    pub risk: String,
    /// Шаг требует подтверждения и человек его не разрешил.
    pub wants_approval: bool,
}

/// Что можно из плана прямо сейчас. Отказ политики не спрашивает никого: такой шаг
/// не исполнится, даже если человек его разрешил.
pub fn gate_plan(plan: &Plan, registry: &Registry, approved: &[usize]) -> Vec<StepGate> {
    plan.steps
        .iter()
        .enumerate()
        .map(|(index, step)| {
            let key = step.registry.trim();
            let (decision, risk) = match registry.by_key(key) {
                Some(action) => {
                    let decision = policy::decide(action);
                    (decision.as_str(), action.risk.as_str())
                }
                // Строку проверяет `check`; здесь неизвестное не разрешается никогда.
                None => ("deny", "unknown"),
            };

            StepGate {
                position: index + 1,
                registry: key.to_string(),
                decision: decision.to_string(),
                risk: risk.to_string(),
                wants_approval: decision == "confirm" && !approved.contains(&(index + 1)),
            }
        })
        .collect()
}

/// Первое, что мешает запуску плана целиком: неодобренный шаг или запрет политики.
pub fn blocker(gates: &[StepGate]) -> Option<String> {
    for gate in gates {
        if gate.decision == "deny" {
            return Some(format!(
                "шаг {} ({}) политика запрещает: это не делает система",
                gate.position, gate.registry
            ));
        }
        if gate.wants_approval {
            return Some(format!(
                "шаг {} ({}) требует подтверждения человеком",
                gate.position, gate.registry
            ));
        }
    }
    None
}

/// Разбирает JSON плана. Ошибка — человеческая строка: её увидит и модель, и человек.
pub fn parse(json: &str) -> Result<Plan, String> {
    if json.trim().is_empty() {
        return Err("план пуст: нет JSON".to_string());
    }

    serde_json::from_str(json).map_err(|error| {
        format!("план не разбирается как JSON: {error} (нужны поля goal и steps[].registry)")
    })
}

/// Проверяет план против реестра и политики. Пустой список проблем — план исполним.
pub fn check(plan: &Plan, registry: &Registry) -> Vec<Problem> {
    let mut problems = Vec::new();

    if plan.goal.trim().is_empty() {
        problems.push(Problem::whole("у плана нет цели: непонятно, что проверять"));
    }

    if plan.steps.is_empty() {
        problems.push(Problem::whole("в плане нет шагов"));
        return problems;
    }

    if plan.steps.len() > MAX_STEPS {
        problems.push(Problem::whole(format!(
            "шагов {} — больше предела {MAX_STEPS}: это уже сценарий, а не план",
            plan.steps.len()
        )));
    }

    for (position, step) in plan.steps.iter().enumerate() {
        let key = step.registry.trim();

        if key.is_empty() {
            problems.push(Problem::step(position, key, "у шага нет строки реестра"));
            continue;
        }

        let Some(action) = registry.by_key(key) else {
            problems.push(Problem::step(
                position,
                key,
                "такой строки реестра нет: ключ пишется как domain|verb|object",
            ));
            continue;
        };

        // Отказ политики проверяется первым: «не делаем никогда» — более сильное
        // утверждение, чем «нет руки», и человеку важнее увидеть именно его.
        if let policy::Decision::Deny(_) = policy::decide(action) {
            problems.push(Problem::step(
                position,
                key,
                "политика это запрещает: деньги и учётные данные не делает система",
            ));
            continue;
        }

        if tools::spec(key).is_none() {
            problems.push(Problem::step(
                position,
                key,
                "у этого действия нет инструмента: строки реестра мало, нужна рука",
            ));
            continue;
        }

        // Параметры проверяются до запуска: «создай папку» без пути — это не шаг, а
        // намерение. Лучше сказать это здесь, чем упасть на первом же окне.
        if let Some(spec) = tools::spec(key) {
            if let Err(problem) = tools::validate(spec, &step.params) {
                problems.push(Problem::step(
                    position,
                    key,
                    format!("шагу не хватает данных: {problem}"),
                ));
                continue;
            }
        }

        if step.why.trim().is_empty() {
            problems.push(Problem::step(
                position,
                key,
                "шаг без объяснения: непонятно, зачем он в этом плане",
            ));
        }
    }

    problems
}

/// Черновик плана по сказанному: один шаг из реестра, который приложение умеет
/// выполнить, плюс параметры прошлого удачного запуска, если они были.
///
/// Почему один шаг: план из нескольких шагов требует понимания задачи, а понимает её
/// модель, которой пока нет. Один шаг собран из фактов — что нашлось в реестре и что
/// уже лежит в памяти — и поэтому не выдумывает лишнего. Когда появится модель, она
/// будет предлагать шаги, а этот путь останется как честный запасной.
pub fn draft(
    goal: &str,
    registry: &Registry,
    remembered: Option<BTreeMap<String, String>>,
) -> Option<Plan> {
    let item = planner::plan(registry, goal, 8)
        .into_iter()
        .find(|item| item.tool.is_some() && item.decision != "deny")?;

    let params = match (tools::spec(&item.key), remembered) {
        (Some(spec), Some(values)) => values
            .into_iter()
            .filter(|(name, _)| spec.params.iter().any(|param| param.name == *name))
            .collect(),
        _ => BTreeMap::new(),
    };

    Some(Plan {
        goal: goal.to_string(),
        source: "registry".to_string(),
        steps: vec![PlanStep {
            registry: item.key.clone(),
            params,
            why: format!(
                "единственное, что здесь умею и что подходит: {}",
                item.example
            ),
        }],
    })
}

/// Запоминает план (JSON как есть) и возвращает его разобранным.
pub fn remember(memory: &Memory, plan: &Plan) -> Result<(), String> {
    let json = serde_json::to_string(plan).map_err(|error| format!("план не пишется: {error}"))?;
    memory
        .remember(FACT_KEY, &json)
        .map_err(|error| format!("план не сохранился: {error}"))
}

/// Последний сохранённый план. Битый JSON — это «плана нет», а не паника.
pub fn last(memory: &Memory) -> Option<Plan> {
    memory
        .fact(FACT_KEY)
        .and_then(|json| serde_json::from_str(&json).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> Registry {
        Registry::load().expect("реестр читается")
    }

    fn step(registry: &str) -> PlanStep {
        PlanStep {
            registry: registry.to_string(),
            params: BTreeMap::new(),
            why: "нужно, чтобы двигаться дальше".to_string(),
        }
    }

    #[test]
    fn parse_reports_the_missing_fields_in_human_words() {
        let json = r#"{"goal":"наведи порядок","steps":[{"registry":"files|создать|папку"}]}"#;
        let plan = parse(json).expect("план разбирается");
        assert_eq!(plan.goal, "наведи порядок");
        assert_eq!(plan.steps[0].registry, "files|создать|папку");

        let error = parse("не json").expect_err("это не план");
        assert!(error.contains("не разбирается"), "{error}");

        let error = parse("   ").expect_err("пусто");
        assert!(error.contains("пуст"), "{error}");
    }

    #[test]
    fn a_plan_with_real_hands_has_no_problems() {
        let plan = Plan {
            goal: "посмотреть, что с диском".to_string(),
            source: "human".to_string(),
            steps: vec![
                // Шаги без обязательных данных: чистым считается план, у которого всё
                // нужное для запуска уже есть, а не тот, где данных «должно хватить».
                step("storage-backup|проверить|свободное место"),
                step("processes-services|показать|топ по нагрузке"),
            ],
        };

        assert_eq!(plan.steps.len(), 2);
        assert_eq!(
            check(&plan, &registry()),
            Vec::new(),
            "план должен быть чистым"
        );
    }

    #[test]
    fn a_step_without_a_hand_is_refused() {
        let plan = Plan {
            goal: "найди по содержимому".to_string(),
            source: "model".to_string(),
            steps: vec![step("files|найти|по содержимому")],
        };

        let problems = check(&plan, &registry());
        assert_eq!(problems.len(), 1);
        assert!(
            problems[0].problem.contains("нет инструмента"),
            "{problems:?}"
        );
    }

    #[test]
    fn unknown_registry_key_is_named_as_unknown() {
        let plan = Plan {
            goal: "что-нибудь".to_string(),
            source: "model".to_string(),
            steps: vec![step("files|телепортировать|файл")],
        };

        let problems = check(&plan, &registry());
        assert!(
            problems[0].problem.contains("строки реестра нет"),
            "{problems:?}"
        );
    }

    #[test]
    fn money_is_refused_by_policy_not_by_chance() {
        let plan = Plan {
            goal: "оплати счёт".to_string(),
            source: "model".to_string(),
            steps: vec![step("personal-finance|оплатить|счёт")],
        };

        let problems = check(&plan, &registry());
        assert!(problems[0].problem.contains("запрещает"), "{problems:?}");
    }

    #[test]
    fn a_step_without_reason_and_an_endless_plan_are_reported() {
        let mut bare = step("storage-backup|проверить|свободное место");
        bare.why.clear();
        let plan = Plan {
            goal: "место".to_string(),
            source: "model".to_string(),
            steps: vec![bare],
        };
        assert!(check(&plan, &registry())[0]
            .problem
            .contains("без объяснения"));

        let long = Plan {
            goal: "всё сразу".to_string(),
            source: "model".to_string(),
            steps: (0..MAX_STEPS + 1)
                .map(|_| step("files|проверить|размеры и место"))
                .collect(),
        };
        let problems = check(&long, &registry());
        assert!(
            problems
                .iter()
                .any(|problem| problem.problem.contains("сценарий")),
            "длинный план называется сценарием: {problems:?}"
        );
    }

    #[test]
    fn empty_plan_lists_no_steps() {
        let plan = Plan {
            goal: String::new(),
            source: "model".to_string(),
            steps: Vec::new(),
        };
        let problems = check(&plan, &registry());
        assert_eq!(problems.len(), 2, "нет цели и нет шагов: {problems:?}");
        assert!(problems
            .iter()
            .any(|problem| problem.problem.contains("нет цели")));
    }

    #[test]
    fn the_last_plan_survives_a_reopen() {
        let dir = std::env::temp_dir().join(format!("zshelper-plan-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка создаётся");
        let path = dir.join("memory.db");

        let plan = Plan {
            goal: "посмотреть диск".to_string(),
            source: "human".to_string(),
            steps: vec![step("storage-backup|проверить|свободное место")],
        };

        {
            let memory = Memory::open(path.clone()).expect("память открывается");
            assert!(last(&memory).is_none(), "до сохранения плана нет");
            remember(&memory, &plan).expect("план сохраняется");
        }

        let memory = Memory::open(path).expect("память открывается снова");
        let back = last(&memory).expect("план читается");
        assert_eq!(back.goal, plan.goal);
        assert_eq!(back.steps.len(), 1);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_destructive_step_waits_for_a_person_and_then_runs() {
        let plan = Plan {
            goal: "убери лишнее".to_string(),
            source: "model".to_string(),
            steps: vec![
                step("files|проверить|дубликаты по хэшу"),
                step("files|удалить|в корзину"),
            ],
        };
        let registry = registry();

        let gates = gate_plan(&plan, &registry, &[]);
        assert!(!gates[0].wants_approval, "чтение не спрашивает");
        assert!(gates[1].wants_approval, "удаление спрашивает");
        assert_eq!(gates[1].risk, "destructive");
        assert!(blocker(&gates).expect("блокер").contains("шаг 2"));

        let approved = gate_plan(&plan, &registry, &[2]);
        assert!(!approved[1].wants_approval, "одобренный шаг не ждёт");
        assert_eq!(blocker(&approved), None, "план можно запускать");
    }

    #[test]
    fn a_forbidden_step_is_not_unlocked_by_approval() {
        let plan = Plan {
            goal: "оплати счёт".to_string(),
            source: "model".to_string(),
            steps: vec![step("personal-finance|оплатить|счёт")],
        };

        // Даже если человек «одобрил»: отказ политики не спрашивает разрешения.
        let gates = gate_plan(&plan, &registry(), &[1]);
        assert_eq!(gates[0].decision, "deny");
        assert!(!gates[0].wants_approval);
        assert!(blocker(&gates).expect("блокер").contains("запрещает"));
    }

    #[test]
    fn unknown_step_is_a_denial_not_a_crash() {
        let plan = Plan {
            goal: "что-нибудь".to_string(),
            source: "model".to_string(),
            steps: vec![step("files|телепортировать|файл")],
        };

        let gates = gate_plan(&plan, &registry(), &[1]);
        assert_eq!(gates[0].decision, "deny");
        assert_eq!(gates[0].risk, "unknown");
        assert!(blocker(&gates).expect("блокер").contains("запрещает"));
    }

    #[test]
    fn a_plan_without_the_data_it_needs_says_which_data() {
        // «Создай папку» без пути — не шаг, а намерение.
        let plan = Plan {
            goal: "создай папку".to_string(),
            source: "registry".to_string(),
            steps: vec![step("files|создать|папку")],
        };

        let problems = check(&plan, &registry());
        assert!(
            problems
                .iter()
                .any(|problem| problem.problem.contains("не хватает данных")),
            "{problems:?}"
        );
    }

    #[test]
    fn a_draft_takes_the_step_it_can_actually_do() {
        let draft =
            draft("почисти диск от временных файлов", &registry(), None).expect("что-то найдётся");

        assert_eq!(draft.source, "registry");
        assert_eq!(draft.steps.len(), 1);
        assert!(
            tools::spec(&draft.steps[0].registry).is_some(),
            "шаг без руки не предлагаем"
        );
        assert!(!draft.steps[0].why.is_empty(), "объяснение обязательно");
    }

    #[test]
    fn a_draft_uses_only_the_parameters_the_tool_asks_for() {
        let plan = draft("создай папку", &registry(), None).expect("нашлось");
        let key = plan.steps[0].registry.clone();
        assert!(tools::spec(&key).is_some());

        // Память хранила лишнее: лишнее не должно попасть в шаг.
        let remembered = BTreeMap::from([
            ("path".to_string(), "C:\\tmp\\jar".to_string()),
            ("чужое".to_string(), "не наше".to_string()),
        ]);
        let with_params = draft("создай папку", &registry(), Some(remembered)).expect("нашлось");
        assert_eq!(
            with_params.steps[0].params.get("path").map(String::as_str),
            Some("C:\\tmp\\jar")
        );
        assert!(!with_params.steps[0].params.contains_key("чужое"));
    }

    #[test]
    fn money_never_becomes_a_draft() {
        // Даже если строка нашлась, `deny` — это отказ, а не черновик.
        assert!(draft("оплати счёт за интернет", &registry(), None).is_none());
    }

    #[test]
    fn questions_ask_only_for_what_is_missing_and_required() {
        let plan = Plan {
            goal: "создай папку".to_string(),
            source: "registry".to_string(),
            steps: vec![step("files|создать|папку")],
        };

        let asked = questions(&plan, &registry());
        assert_eq!(asked.len(), 1, "спрашиваем только путь: {asked:?}");
        assert_eq!(asked[0].position, 1);
        assert!(!asked[0].label.is_empty(), "вопрос задаётся по-человечески");

        // Строка без обязательных данных ничего не спрашивает.
        let disk = Plan {
            goal: "свободное место".to_string(),
            source: "registry".to_string(),
            steps: vec![step("storage-backup|проверить|свободное место")],
        };
        assert_eq!(questions(&disk, &registry()), Vec::new());
    }

    #[test]
    fn answers_are_written_into_the_step_and_make_it_ready() {
        let mut plan = Plan {
            goal: "создай папку".to_string(),
            source: "registry".to_string(),
            steps: vec![step("files|создать|папку")],
        };
        let registry = registry();

        let asked = questions(&plan, &registry);
        let name = asked[0].name.clone();
        fill(
            &mut plan,
            &[Answer {
                position: 1,
                name: name.clone(),
                value: "  C:\\tmp\\jar  ".to_string(),
            }],
        )
        .expect("ответ принят");

        assert_eq!(
            plan.steps[0].params.get(&name).map(String::as_str),
            Some("C:\\tmp\\jar")
        );
        assert_eq!(
            questions(&plan, &registry),
            Vec::new(),
            "больше спрашивать нечего"
        );
        assert_eq!(check(&plan, &registry), Vec::new(), "план готов к запуску");
    }

    #[test]
    fn a_stranger_field_is_refused_instead_of_quietly_appended() {
        let mut plan = Plan {
            goal: "создай папку".to_string(),
            source: "registry".to_string(),
            steps: vec![step("files|создать|папку")],
        };

        let error = fill(
            &mut plan,
            &[Answer {
                position: 1,
                name: "чужое".to_string(),
                value: "значение".to_string(),
            }],
        )
        .expect_err("такого параметра шаг не спрашивает");
        assert!(error.contains("не спрашивает"), "{error}");

        let error = fill(
            &mut plan,
            &[Answer {
                position: 5,
                name: "path".to_string(),
                value: "C:\\tmp".to_string(),
            }],
        )
        .expect_err("такого шага нет");
        assert!(error.contains("шага 5"), "{error}");

        let error = fill(
            &mut plan,
            &[Answer {
                position: 1,
                name: "path".to_string(),
                value: "   ".to_string(),
            }],
        )
        .expect_err("пустой ответ");
        assert!(error.contains("пустой"), "{error}");
    }
}
