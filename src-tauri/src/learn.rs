//! Чему приложение ещё не научилось — и что оно уже знает о том, как научиться.
//!
//! Замысел простой: если человек попросил то, чего приложение не умеет, оно не должно
//! отвечать «не могу» и забывать. Оно должно **записать просьбу как задачу на
//! обучение** и рассказать, что для этого нужно: чем это делается по реестру, какой
//! риск, каким примером проверять.
//!
//! Чего здесь сознательно нет: самопровозглашённого «я научился». Написать и
//! подключить новую руку — это изменение кода, и делать его без человека нельзя.
//! Поэтому шаги обучения — чек-лист с честными галочками, а не обещание.
//!
//! Просьбы хранятся в памяти как факты `learn:<ключ>`: повторная просьба увеличивает
//! счётчик, а не заводит вторую запись. Частота — единственный честный признак того,
//! чему учиться первым.

use serde::{Deserialize, Serialize};

use crate::memory::Memory;
use crate::planner;
use crate::registry::{Action, Registry};
use crate::tools;

/// Ключ факта для одной просьбы.
pub fn fact_key(registry: &str) -> String {
    format!("learn:{registry}")
}

/// Что хранится в памяти: сколько раз просили и чем именно.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Asked {
    times: u32,
    asked_ms: u64,
    query: String,
}

/// Один шаг обучения. `done` честно отражает, что уже сделано приложением.
#[derive(Debug, Clone, Serialize)]
pub struct Step {
    pub title: String,
    pub done: bool,
}

/// Задача на обучение: то, что человек попросил, и всё, что известно о том, как это
/// сделать.
#[derive(Debug, Clone, Serialize)]
pub struct Learning {
    pub registry: String,
    /// Фраза-пример из реестра: по ней проверяется, что научились.
    pub example: String,
    /// Как это попросили — дословно.
    pub query: String,
    /// Чем это делается по реестру (API, программы, приёмы).
    pub implementation: Vec<String>,
    pub risk: String,
    /// Что сказано в реестре про это действие.
    pub notes: String,
    pub asked_ms: u64,
    pub times: u32,
    pub steps: Vec<Step>,
}

/// Чек-лист обучения для строки реестра:
/// * что известно — уже собрано, поэтому первая галочка стоит сразу;
/// * чего нет — без галочки, чтобы не выдавать желаемое за сделанное.
fn steps_for(action: &Action) -> Vec<Step> {
    let how = if action.implementation.is_empty() {
        "чем это делается — пока неизвестно: искать документацию и способ".to_string()
    } else {
        format!("чем это делается: {}", action.implementation.join(", "))
    };

    vec![
        Step {
            title: format!("Найти, {how}"),
            done: !action.implementation.is_empty(),
        },
        Step {
            title: "Проверить, что нужное есть на этой машине (программа, доступ, права)"
                .to_string(),
            done: false,
        },
        Step {
            title: "Написать руку и подключить её к реестру".to_string(),
            done: false,
        },
        Step {
            title: format!("Проверить на живом примере: «{}»", action.example),
            done: false,
        },
    ]
}

fn asked_of(memory: &Memory, registry: &str) -> Option<Asked> {
    memory
        .fact(&fact_key(registry))
        .and_then(|value| serde_json::from_str(&value).ok())
}

/// Записывает просьбу и возвращает задачу на обучение.
///
/// Повторная просьба не заводит вторую задачу: она поднимает счётчик и обновляет
/// фразу. Так «чему учиться первым» решает человек своими повторениями, а не мы.
pub fn request(
    memory: &Memory,
    action: &Action,
    query: &str,
    now_ms: u64,
) -> Result<Learning, String> {
    let key = action.key();
    let times = asked_of(memory, &key)
        .map(|asked| asked.times + 1)
        .unwrap_or(1);

    let asked = Asked {
        times,
        asked_ms: now_ms,
        query: query.to_string(),
    };
    let json = serde_json::to_string(&asked)
        .map_err(|error| format!("просьба не записывается: {error}"))?;
    memory
        .remember(&fact_key(&key), &json)
        .map_err(|error| format!("просьба не сохранилась: {error}"))?;

    Ok(Learning {
        registry: key,
        example: action.example.clone(),
        query: asked.query,
        implementation: action.implementation.clone(),
        risk: action.risk.as_str().to_string(),
        notes: action.notes.clone(),
        asked_ms: asked.asked_ms,
        times: asked.times,
        steps: steps_for(action),
    })
}

/// Просьба, которую назвала модель: «надо научиться вот этому».
///
/// Модель не диктует урок — она называет цель. Строку реестра под цель ищет поиск: если
/// нашлась строка без руки, просьба записывается как обычная (и повтор поднимает счётчик).
///
/// `None` — учиться нечему или не по чему: цель уже умеем, либо в реестре нет такой
/// строки. Заводить «обучение» на пустом месте значит обещать урок, которого не будет.
pub fn request_for_goal(
    memory: &Memory,
    registry: &Registry,
    goal: &str,
    query: &str,
    now_ms: u64,
) -> Option<Learning> {
    let item = planner::plan(registry, goal, 8).into_iter().next()?;
    if item.tool.is_some() {
        return None;
    }

    let action = registry.by_key(&item.key)?;
    if !action.is_offerable() || tools::spec(&action.key()).is_some() {
        return None;
    }

    request(memory, action, query, now_ms).ok()
}

/// Все задачи на обучение, самые просимые сверху.
///
/// Строки, которых больше нет в реестре, пропускаются: учиться тому, чего нет,
/// невозможно, а показывать призрак — значит врать о списке дел.
pub fn all(memory: &Memory, registry: &Registry) -> Vec<Learning> {
    let mut learned: Vec<Learning> = memory
        .facts_with_prefix("learn:")
        .into_iter()
        .filter_map(|(key, value)| {
            let asked: Asked = serde_json::from_str(&value).ok()?;
            let action = registry.by_key(key.strip_prefix("learn:")?)?;

            Some(Learning {
                registry: action.key(),
                example: action.example.clone(),
                query: asked.query,
                implementation: action.implementation.clone(),
                risk: action.risk.as_str().to_string(),
                notes: action.notes.clone(),
                asked_ms: asked.asked_ms,
                times: asked.times,
                steps: steps_for(action),
            })
        })
        .collect();

    learned.sort_by(|left, right| {
        right
            .times
            .cmp(&left.times)
            .then(right.asked_ms.cmp(&left.asked_ms))
            .then(left.registry.cmp(&right.registry))
    });
    learned
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn memory(name: &str) -> (Memory, PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("zshelper-learn-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("memory.db");
        (Memory::open(path).expect("память открывается"), dir)
    }

    fn registry() -> Registry {
        Registry::load().expect("реестр читается")
    }

    /// Строка, которую приложение пока не умеет выполнять: именно такие и учатся.
    fn without_hand(registry: &Registry) -> Action {
        registry
            .actions()
            .iter()
            .find(|action| crate::tools::spec(&action.key()).is_none() && action.is_offerable())
            .cloned()
            .expect("в реестре есть то, чего мы не умеем")
    }

    #[test]
    fn a_goal_named_by_the_model_leaves_a_trace_that_survives() {
        let (memory, dir) = memory("goal");
        let registry = registry();
        let action = without_hand(&registry);

        // Модель называет цель словами примера — поиск обязан найти ту же строку.
        let first = request_for_goal(&memory, &registry, &action.example, "сделай это", 1000)
            .expect("просьба записана");
        assert_eq!(first.registry, action.key());
        assert_eq!(first.times, 1);

        let again = request_for_goal(&memory, &registry, &action.example, "сделай это", 2000)
            .expect("повтор тоже записан");
        assert_eq!(
            again.times, 2,
            "повтор поднимает счётчик, а не заводит вторую запись"
        );

        // Переживает перезапуск: это память, а не строка в интерфейсе.
        let listed = all(&memory, &registry);
        assert!(listed.iter().any(|item| item.registry == action.key()));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_goal_with_a_hand_or_without_a_row_is_not_promised_as_a_lesson() {
        let (memory, dir) = memory("nohand");
        let registry = registry();

        let known = registry
            .actions()
            .iter()
            .find(|action| tools::spec(&action.key()).is_some())
            .expect("рука есть");
        assert!(
            request_for_goal(&memory, &registry, &known.example, "сделай это", 1000).is_none(),
            "чему уже умеем — не учим"
        );

        assert!(
            request_for_goal(&memory, &registry, "жжжж", "сделай это", 1000).is_none(),
            "цели нет в реестре — урок не выдумывается"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_request_keeps_what_is_known_and_marks_what_is_not() {
        let (memory, dir) = memory("steps");
        let action = without_hand(&registry());

        let learning =
            request(&memory, &action, "сделай это", 1_700_000_000_000).expect("записано");

        assert_eq!(learning.registry, action.key());
        assert_eq!(learning.query, "сделай это");
        assert_eq!(learning.times, 1);
        assert_eq!(learning.steps.len(), 4);

        // Первая галочка — только если реестр правда знает, чем это делается.
        assert_eq!(
            learning.steps[0].done,
            !action.implementation.is_empty(),
            "галочка не должна опережать знание"
        );
        assert!(!learning.steps[2].done, "руку мы не написали");
        assert!(
            learning.steps[0].title.contains(&action.implementation[0])
                || action.implementation.is_empty(),
            "в задаче назван способ: {}",
            learning.steps[0].title
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn asking_twice_raises_the_counter_instead_of_the_list() {
        let (memory, dir) = memory("times");
        let action = without_hand(&registry());

        request(&memory, &action, "первый раз", 1).expect("записано");
        let second = request(&memory, &action, "второй раз", 2).expect("записано");

        assert_eq!(second.times, 2);
        assert_eq!(second.query, "второй раз", "фраза обновляется");

        let all = all(&memory, &registry());
        assert_eq!(all.len(), 1, "две просьбы — одна задача: {all:?}");
        assert_eq!(all[0].times, 2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_list_puts_the_most_asked_first() {
        let (memory, dir) = memory("order");
        let registry = registry();

        let mut without: Vec<Action> = registry
            .actions()
            .iter()
            .filter(|action| {
                crate::tools::spec(&action.key()).is_none()
                    && action.is_offerable()
                    && !action.implementation.is_empty()
            })
            .take(2)
            .cloned()
            .collect();
        assert_eq!(without.len(), 2, "нужны две строки для проверки порядка");

        let second = without.pop().expect("вторая");
        let first = without.pop().expect("первая");

        request(&memory, &first, "раз", 10).expect("записано");
        request(&memory, &second, "раз", 20).expect("записано");
        request(&memory, &second, "дважды", 30).expect("записано");

        let all = all(&memory, &registry);
        assert_eq!(all[0].registry, second.key(), "чаще просили — выше");
        assert_eq!(all[0].times, 2);
        assert_eq!(all[1].registry, first.key());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_request_survives_a_reopen() {
        let (memory, dir) = memory("reopen");
        let action = without_hand(&registry());
        let key = action.key();
        request(&memory, &action, "научись", 5).expect("записано");
        drop(memory);

        let reopened = Memory::open(dir.join("memory.db")).expect("память открывается снова");
        let all = all(&reopened, &registry());
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].registry, key);
        assert_eq!(all[0].times, 1);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
