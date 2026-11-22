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

/// Почему этот шаг не начинать прямо сейчас. `None` — можно.
///
/// Долгий процесс внутри шага бросает сам исполнитель по тому же флагу. Но шаг без
/// процесса — папка, файл, буфер — проверял бы флаг только на входе, и нажатое между
/// шагами «стоп» прошло бы мимо: план сделал бы ещё одно действие уже после остановки.
/// Поэтому перед каждым шагом спрашиваем одно и то же место, а не надеемся на руку.
pub fn stopped_before(position: usize, cancelled: bool) -> Option<String> {
    if !cancelled {
        return None;
    }
    Some(format!("отменено человеком: шаг {position} не начинался"))
}

/// С какого шага продолжать после остановки — числом, а не догадкой.
///
/// Вход — статусы шагов этого запуска (`ok`, `failed`, `cancelled`, `skipped`) и
/// всего шагов в плане. Выход — номер шага, с которого продолжать, или `None`,
/// если продолжать нечего (всё сделано).
///
/// Почему отдельной функцией. Это единственное место, где решается «с чего
/// продолжить», и ошибка здесь стоит дорого: продолжить с начала — значит
/// второй раз создать папку или второй раз удалить файл; продолжить с шага
/// после неудачного — значит делать следующий шаг на неверных данных. Поэтому
/// правило записано и проверено само по себе, без ядра, окон и сети.
///
/// Правило:
///  * был шаг, который не сделался, — продолжаем **с него** (он не выполнен,
///    его надо повторить);
///  * не было такого (отмена пришла между шагами) — **со следующего** после
///    последнего сделанного;
///  * всё сделано — `None`: продолжать нечего, и притворяться иначе незачем.
///    `skipped` считается сделанным: это «сделано в прошлый раз».
pub fn resume_from(statuses: &[&str], total: usize) -> Option<usize> {
    if total == 0 {
        return None;
    }

    // Позиции считаются с единицы: так их видит человек и так их передают обратно.
    let broken = statuses
        .iter()
        .enumerate()
        .find(|(_, status)| **status != "ok" && **status != "skipped")
        .map(|(index, _)| index + 1);

    if let Some(position) = broken {
        return Some(position.min(total));
    }

    // Сделанным считается и `ok`, и `skipped`: второе значит «сделано в прошлый
    // раз». Считать его несделанным — значит предлагать повторить уже сделанное.
    let done = statuses
        .iter()
        .filter(|status| **status == "ok" || **status == "skipped")
        .count();
    if done >= total {
        return None;
    }

    Some((done + 1).min(total))
}

/// Как повторить шаг, который не сделался. Шаг 144.
///
/// `resume_from` (шаг 141) отвечает на вопрос «с какого шага продолжать». Этот —
/// на другой, и путать их дорого: продолжение с неудачного шага значит **сделать
/// его ещё раз**, а «ещё раз» для разных действий значит разное.
///
/// Правило, и почему именно такое:
///  * `read` — повторяется молча. Чтение дважды не меняет мир: худшее, что
///    случится, — файл прочитан два раза.
///  * `write-local` — спрашивает. Создать папку, которая уже есть, — ошибка;
///    записать файл поверх — потерять то, что в нём было. Человек один раз
///    подтвердил **одно** действие, а повтор — это второе действие, и решать
///    ему. Это не перестраховка: именно на повторе «создать папку» и падает
///    первый запуск.
///  * `destructive` — спрашивает, и вопрос другой. Двойное удаление хуже отказа:
///    после неудачи человек не знает, удалилось ли что-нибудь. Молчаливый повтор
///    мог бы унести то, чего он не собирался трогать (шаблон, совпавший шире).
///  * `external`, `identity`, `money` — спрашивает всегда: у них и первый-то раз
///    без человека не идёт (см. `policy::decide`), и повтор не исключение.
///
/// Почему не «повторять всё, кроме destructive». Так было бы соблазнительно, и
/// это ровно та ошибка, от которой шаг защищает: «создать папку» выглядит
/// безопасным, а второй раз не работает.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Repeat {
    /// Ничего не спрашивать: повторить.
    Quietly,
    /// Спросить человека перед повтором: причина — словами.
    Ask(&'static str),
}

/// Что делать с шагом, который не сделался, при продолжении дела.
///
/// `risk` — риск строки реестра (`read`, `write-local`, `external`,
/// `destructive`, `identity`, `money`); неизвестное считается опасным, как и в
/// `gate_plan`: строка, которой нет в реестре, не повторяется молча.
pub fn repeat_of(risk: &str) -> Repeat {
    match risk {
        "read" => Repeat::Quietly,
        "write-local" => Repeat::Ask("повтор изменит то, что уже на диске"),
        "destructive" => Repeat::Ask("повтор может удалить не то, что в прошлый раз"),
        "external" | "identity" | "money" => {
            Repeat::Ask("такое и в первый раз без человека не идёт")
        }
        _ => Repeat::Ask("риск действия неизвестен — повторять молча нельзя"),
    }
}

/// Номер шага, который при продолжении надо спросить, а не повторить молча.
///
/// Отдельно от `repeat_of`, потому что вопрос про весь план: продолжая с шага
/// `resume_at`, человек должен увидеть, что именно его ждёт вопрос, **до**
/// запуска, а не посередине. Иначе он нажимает «продолжить» и упирается в окно
/// на четвёртом шаге, не понимая, почему.
pub fn asked_on_resume(gates: &[StepGate], resume_at: usize) -> Option<usize> {
    gates
        .iter()
        .filter(|gate| gate.position >= resume_at)
        .find(|gate| repeat_of(&gate.risk) != Repeat::Quietly)
        .map(|gate| gate.position)
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
                // Незнакомый параметр — это не «не хватает данных»: лишнее в шаге так же
                // опасно, как недостающее, потому что подтверждение покажет его человеку.
                let text = if problem.starts_with("эта рука не понимает") {
                    format!("в шаге есть лишнее: {problem}")
                } else {
                    format!("шагу не хватает данных: {problem}")
                };
                problems.push(Problem::step(position, key, text));
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

/// План из выбора модели: одна рука, названная ею, с её параметрами.
///
/// Здесь модель ничего не решает окончательно. Её выбор проходит те же проверки, что и
/// найденное по словам: ключ обязан быть в реестре, рука обязана существовать, а
/// параметры — быть известными этой руке. Выдуманный параметр не «передастся как-нибудь»,
/// он отбрасывается: чужое имя в командной строке — это не мелочь.
///
/// `None` — брать нечего: ключа нет, руки нет (одно описание) или это не наша строка.
pub fn chosen(
    goal: &str,
    key: &str,
    params: BTreeMap<String, String>,
    registry: &Registry,
    why: &str,
) -> Option<Plan> {
    let action = registry.by_key(key)?;
    let spec = tools::spec(key)?;

    // Берём только те параметры, которые рука действительно принимает, и только
    // непустые: пустое значение — это «не задано», а не пустая строка в команде.
    let params = params
        .into_iter()
        .filter(|(name, value)| {
            !value.trim().is_empty() && spec.params.iter().any(|param| &param.name == name)
        })
        .collect::<BTreeMap<_, _>>();

    let why = if why.trim().is_empty() {
        format!("выбрано моделью: {}", action.example)
    } else {
        why.trim().to_string()
    };

    Some(Plan {
        goal: goal.to_string(),
        source: "model".to_string(),
        steps: vec![PlanStep {
            registry: key.to_string(),
            params,
            why,
        }],
    })
}

/// План из цепочки, предложенной моделью.
///
/// Собирается только целиком: если хотя бы у одного шага нет руки, плана нет. Half-chain
/// опаснее отказа — человек увидит «план из трёх шагов», а выполнится один, и непонятно
/// какой. Параметры каждого шага проходят ту же чистку, что и в одиночном вызове.
pub fn chain(
    goal: &str,
    steps: &[(String, BTreeMap<String, String>, String)],
    registry: &Registry,
    why: &str,
) -> Option<Plan> {
    if steps.is_empty() {
        return None;
    }

    let mut planned = Vec::with_capacity(steps.len());
    for (key, params, step_why) in steps {
        let action = registry.by_key(key)?;
        let spec = tools::spec(key)?;

        let params = params
            .iter()
            .filter(|(name, value)| {
                !value.trim().is_empty() && spec.params.iter().any(|param| &param.name == *name)
            })
            .map(|(name, value)| (name.clone(), value.clone()))
            .collect::<BTreeMap<_, _>>();

        let why = if step_why.trim().is_empty() {
            format!("шаг цепочки: {}", action.example)
        } else {
            step_why.trim().to_string()
        };

        planned.push(PlanStep {
            registry: key.clone(),
            params,
            why,
        });
    }

    // Обоснование модели сохраняем рядом с шагами: у цепочки оно объясняет, зачем нужен
    // весь путь, а не отдельное действие.
    let _ = why;
    Some(Plan {
        goal: goal.to_string(),
        source: "model-chain".to_string(),
        steps: planned,
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
    fn the_model_choice_becomes_a_plan_only_with_a_real_hand() {
        let registry = registry();
        let key = "storage-backup|проверить|свободное место";

        let plan = chosen(
            "что с диском",
            key,
            BTreeMap::new(),
            &registry,
            "просил про диск",
        )
        .expect("рука есть — план собирается");
        assert_eq!(plan.source, "model");
        assert_eq!(plan.steps[0].registry, key);
        assert_eq!(plan.steps[0].why, "просил про диск");

        assert!(
            chosen("что-то", "нет|такой|строки", BTreeMap::new(), &registry, "").is_none(),
            "выдуманного ключа в реестре нет"
        );
    }

    #[test]
    fn a_chain_is_built_whole_or_not_at_all() {
        let registry = registry();
        let steps = vec![
            (
                "files|создать|папку".to_string(),
                BTreeMap::new(),
                "нужна папка".to_string(),
            ),
            (
                "storage-backup|проверить|свободное место".to_string(),
                BTreeMap::new(),
                String::new(),
            ),
        ];

        let plan = chain("наведи порядок", &steps, &registry, "по шагам").expect("план");
        assert_eq!(plan.steps.len(), 2);
        assert_eq!(plan.source, "model-chain");
        assert!(plan.steps[1].why.contains("шаг цепочки"));

        // Один шаг без руки — и цепочки нет: половина цепочки хуже отказа.
        let broken = vec![
            (
                "files|создать|папку".to_string(),
                BTreeMap::new(),
                String::new(),
            ),
            ("нет|такой|руки".to_string(), BTreeMap::new(), String::new()),
        ];
        assert!(chain("наведи порядок", &broken, &registry, "").is_none());
        assert!(chain("пусто", &[], &registry, "").is_none());
    }

    #[test]
    fn parameters_the_hand_does_not_take_are_dropped() {
        let registry = registry();
        let key = "files|создать|папку";
        let spec = tools::spec(key).expect("рука есть");

        let mut params = BTreeMap::new();
        params.insert("путь".to_string(), "D:\\Отчёты".to_string());
        params.insert("выдуманный".to_string(), "что-то".to_string());
        params.insert(spec.params[0].name.clone(), String::new());

        let plan = chosen("создай папку", key, params, &registry, "").expect("план");
        let kept = &plan.steps[0].params;

        assert!(!kept.contains_key("выдуманный"), "чужое имя отбрасывается");
        assert!(
            !kept.contains_key(&spec.params[0].name),
            "пустое значение — это «не задано», а не пустая строка"
        );
        assert!(
            plan.steps[0].why.contains("выбрано моделью"),
            "без «зачем» план не собирается"
        );
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
        // Строку без руки ищем в самом реестре, а не держим ключ в тексте теста: иначе
        // каждый новый инструмент ломал бы этот тест, а его правка ничего бы не проверяла.
        let catalog = registry();
        let key = catalog
            .actions()
            .iter()
            .map(|action| action.key())
            .find(|key| crate::tools::spec(key).is_none())
            .expect("в реестре всегда есть строки без руки");

        let plan = Plan {
            goal: "сделай то, чего приложение пока не умеет".to_string(),
            source: "model".to_string(),
            steps: vec![step(&key)],
        };

        let problems = check(&plan, &catalog);
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
    fn a_stop_between_steps_means_the_next_step_does_not_start() {
        // Нажатое «стоп» — это не совет: следующий шаг не начинается и говорит, что его
        // не было, а не «выполнено».
        let reason = stopped_before(2, true).expect("отмена до шага — это остановка");
        assert!(reason.contains("шаг 2"), "{reason}");
        assert!(reason.contains("не начинался"), "{reason}");
        assert_eq!(stopped_before(2, false), None);
        // И до первого шага тоже: план, остановленный до старта, ничего не делает.
        assert!(stopped_before(1, true).is_some());
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

    #[test]
    fn resume_points_at_the_step_that_did_not_finish() {
        // Три шага, третий не сделался — продолжаем с третьего, а не с начала.
        assert_eq!(resume_from(&["ok", "ok", "failed"], 3), Some(3));
        // Первый не сделался — с первого.
        assert_eq!(resume_from(&["failed"], 1), Some(1));
        // Отмена между шагами: сделано два, продолжаем с третьего.
        assert_eq!(resume_from(&["ok", "ok"], 3), Some(3));
    }

    #[test]
    fn resume_is_none_only_when_there_is_nothing_left() {
        // Всё сделано — продолжать нечего. Выдумывать «ещё шаг» было бы работой ради отчёта.
        assert_eq!(resume_from(&["ok", "ok", "ok"], 3), None);
        // Пустой план — тоже нечего продолжать.
        assert_eq!(resume_from(&[], 0), None);
    }

    #[test]
    fn skipped_steps_do_not_count_as_unfinished() {
        // `skipped` — это «сделано в прошлый раз». Считать его провалом значило бы
        // вечно продолжать с одного и того же места.
        assert_eq!(resume_from(&["skipped", "skipped", "failed"], 3), Some(3));
        assert_eq!(resume_from(&["skipped", "ok", "ok"], 3), None);
    }

    #[test]
    fn resume_never_points_past_the_last_step() {
        // Отчёт может прийти короче плана (например, прервался посреди записи).
        // Указатель за последний шаг был бы отказом «продолжать не с чего».
        assert_eq!(resume_from(&["ok"], 3), Some(2));
        assert_eq!(resume_from(&["ok", "ok", "ok"], 5), Some(4));
    }

    /// Шаг 144. Главное: «безопасно повторить» — это не «выглядит безобидно».
    #[test]
    fn only_reading_repeats_without_asking() {
        assert_eq!(repeat_of("read"), Repeat::Quietly);
        // «Создать папку» выглядит безопасным, а второй раз не работает: папка
        // уже есть. Поэтому write-local спрашивает, а не повторяется молча.
        assert_ne!(repeat_of("write-local"), Repeat::Quietly);
    }

    /// Двойное удаление хуже отказа — значит, и вопрос про него отдельный: после
    /// неудачи человек не знает, удалилось ли что-нибудь, и молчаливый повтор мог
    /// бы унести лишнее.
    #[test]
    fn destructive_repeat_says_why_it_is_dangerous() {
        match repeat_of("destructive") {
            Repeat::Ask(why) => {
                assert!(why.contains("удалить"), "причина называет удаление: {why}")
            }
            Repeat::Quietly => panic!("удаление не повторяется молча"),
        }
    }

    /// Неизвестный риск — не «наверное, безопасно». Строка, которой нет в реестре,
    /// молча не повторяется: угадывать про неё нечем.
    #[test]
    fn an_unknown_risk_is_not_assumed_safe() {
        assert_ne!(repeat_of("unknown"), Repeat::Quietly);
        assert_ne!(repeat_of(""), Repeat::Quietly);
        assert_ne!(repeat_of("чтение"), Repeat::Quietly);
    }

    /// Вопрос о повторе виден **до** запуска, а не посередине: шаги до точки
    /// продолжения уже сделаны, и спрашивать про них нечего.
    #[test]
    fn the_question_is_about_the_step_we_will_really_repeat() {
        let gates = vec![
            StepGate {
                position: 1,
                registry: "folder.create".into(),
                decision: "confirm".into(),
                risk: "write-local".into(),
                wants_approval: false,
            },
            StepGate {
                position: 2,
                registry: "file.read".into(),
                decision: "allow".into(),
                risk: "read".into(),
                wants_approval: false,
            },
            StepGate {
                position: 3,
                registry: "clipboard.get".into(),
                decision: "allow".into(),
                risk: "read".into(),
                wants_approval: false,
            },
        ];

        // Продолжаем с шага 2: шаг 1 уже сделан, и его риск к повторам не относится.
        assert_eq!(asked_on_resume(&gates, 2), None);
        // А с самого начала — первый же шаг требует вопроса.
        assert_eq!(asked_on_resume(&gates, 1), Some(1));
    }
}
