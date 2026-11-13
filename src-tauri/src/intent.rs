//! Что спросить у модели и как читать её ответ.
//!
//! Модель нужна там, где поиск по словам бессилен: человек говорит «сделай потише», а в реестре
//! написано «убавить громкость». Совпадения букв нет, смысл есть — это работа модели.
//!
//! Здесь только две вещи, и обе проверяемы без модели:
//!  * **вопрос** — короткий, с точными кандидатами, окном перед человеком и памятью фактов;
//!  * **ответ** — строгий разбор: один объект JSON, четыре возможных вида, и ни одной руки,
//!    которой нет в реестре.
//!
//! Почему разбор такой придирчивый. Модель — не источник правды о мире: она охотно назовёт
//! инструмент, которого нет, и подставит путь, которого не существует. Поэтому имя руки
//! сверяется с реестром, параметры принимаются только как строки (число и `true` тоже
//! становятся строкой), а всё непонятное отвергается целиком — лучше «не понял», чем
//! выполненное не то.
//!
//! Ничего не выполняется здесь и ничего не решается здесь: разбор возвращает предложение,
//! а решает его `plan` и человек.

use std::collections::BTreeMap;

use serde::Serialize;

/// Сколько кандидатов показываем модели. Больше — она начинает выбирать по красоте, а не по делу.
pub const MAX_CANDIDATES: usize = 12;

/// Сколько фактов подкладываем. Память человека — не библиотека.
pub const MAX_FACTS: usize = 20;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum IntentError {
    #[error("в ответе нет объекта JSON")]
    NoJson,
    #[error("в ответе объекта больше одного: непонятно, какой выполнять")]
    ManyJson,
    #[error("JSON не разобрался: {0}")]
    Broken(String),
    #[error("не хватает поля `{0}`")]
    Missing(&'static str),
    #[error("руки `{0}` нет в реестре: выдуманное не выполняется")]
    UnknownTool(String),
    #[error("вид ответа `{0}` неизвестен: ожидалось call, learn, ask или refuse")]
    UnknownKind(String),
    #[error("пустой ответ: модель промолчала")]
    Empty,
}

/// Что модель предложила. Ровно один из четырёх видов.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Proposal {
    /// Взять существующую руку и назвать параметры.
    Call {
        registry: String,
        params: BTreeMap<String, String>,
        why: String,
    },
    /// Такого умения нет — человеку надо его добыть (найти, скачать, занести).
    Learn { goal: String, why: String },
    /// Черновик новой руки. Это текст, а не умение: исполнить его нечем и нельзя.
    Hand {
        goal: String,
        code: String,
        why: String,
    },
    /// Цепочка шагов: для результата нужно не одно действие, а несколько подряд.
    ///
    /// Это не «рой агентов»: шаги идут строго по порядку, каждый проверяется политикой и
    /// каждый доказывает свой результат. Цепочка нужна затем, чтобы «зайди и оформи» было
    /// видно по шагам, а не пряталось за одним туманным «сделаю».
    Chain {
        goal: String,
        steps: Vec<ChainStep>,
        why: String,
    },
    /// Не хватает одного ответа человека.
    Ask { question: String, why: String },
    /// Политика запрещает — единственный случай, когда отказ допустим.
    Refuse { reason: String },
}

/// Один шаг цепочки: та же рука с теми же параметрами, что и в одиночном вызове.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChainStep {
    pub registry: String,
    pub params: BTreeMap<String, String>,
    pub why: String,
}

/// Сколько шагов в цепочке разрешаем.
///
/// Пять — не про возможности модели, а про человека: длинную цепочку нельзя ни прочитать,
/// ни остановить вовремя, а «сделаю двадцать шагов» — обещание без свидетелей.
pub const MAX_CHAIN_STEPS: usize = 5;

/// Кандидат для вопроса модели: ключ реестра и то, как это называется по-человечески.
#[derive(Debug, Clone, Serialize)]
pub struct Candidate {
    pub registry: String,
    pub example: String,
    pub risk: String,
    /// Есть ли уже рука, или это только описание.
    pub executable: bool,
}

/// Что человек видит прямо сейчас — только то, что нужно для «это».
///
/// Приходит из интерфейса, поэтому и разбирается: без `Deserialize` команда не примет его
/// и вопрос к модели остался бы без окна — то есть без адресата у слова «это».
#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct Around {
    pub title: String,
    pub process: String,
    /// Что видно в окне — строками, как их прочитал UIA. Необязательно: без прав или
    /// без UI Automation окно остаётся просто окном, и это не ошибка.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub screen: Option<String>,
}

/// Вопрос к модели. Один и тот же для одного и того же входа: иначе нельзя проверить.
pub fn prompt(
    request: &str,
    around: Option<&Around>,
    facts: &[(String, String)],
    candidates: &[Candidate],
) -> String {
    let mut out = String::with_capacity(1024);

    out.push_str(
        "Ты выбираешь одно действие для помощника на Windows. Ответ — ровно один объект JSON.\n\
         Без пояснений вокруг, без markdown.\n\n\
         Виды ответа:\n\
         {\"kind\":\"call\",\"registry\":\"<ключ из списка>\",\"params\":{},\"why\":\"<почему>\"}\n\
         {\"kind\":\"learn\",\"goal\":\"<чему научиться>\",\"why\":\"<почему>\"}\n\
         {\"kind\":\"hand\",\"goal\":\"<что делает>\",\"code\":\"<скрипт>\",\"why\":\"<почему>\"}\n\
         {\"kind\":\"ask\",\"question\":\"<один вопрос>\",\"why\":\"<почему>\"}\n\
         {\"kind\":\"refuse\",\"reason\":\"<что запрещено>\"}\n\n\
         Правила:\n\
         1. registry бери только из списка ниже, дословно. Чего нет в списке — это learn, не call.\n\
         2. В params только те значения, которые человек назвал или что есть в памяти. Не придумывай пути.\n\
         3. Если нужен один ответ — ask, и в question ровно один вопрос.\n\
         4. refuse только если действие необратимо, стоит денег или выдаёт себя за человека.\n\n",
    );

    // Цепочка объявлена отдельно от общего контракта: там она заняла бы строку, которую
    // читают как «одно действие», а это не одно действие.
    out.push_str(
        r#"Ещё один вид ответа — цепочка, когда для результата нужно несколько действий подряд:
{"kind":"chain","goal":"<что получится в итоге>","steps":[{"registry":"<ключ из списка>","params":{},"why":"<зачем шаг>"}],"why":"<почему>"}
Не больше пяти шагов, и все ключи — только из списка. Цепочка не отменяет ни одного
подтверждения: каждый шаг спрашивает человека так же, как одиночный вызов.

"#,
    );

    out.push_str("Задача человека:\n");
    out.push_str(request.trim());
    out.push_str("\n\n");

    if let Some(window) = around {
        out.push_str("Перед человеком сейчас:\n");
        out.push_str(&format!(
            "{} ({})\n",
            window.title.trim(),
            window.process.trim()
        ));

        // Экран — это адрес для слова «это». Даём его, только если он действительно
        // прочитан: пустой список элементов ничего не объясняет, а место занимает.
        if let Some(screen) = window.screen.as_deref().map(str::trim) {
            if !screen.is_empty() {
                out.push_str("\nНа экране (сверху вниз, с отступами по вложенности):\n");
                for line in screen.lines().take(MAX_SCREEN_LINES) {
                    out.push_str(line.trim_end());
                    out.push('\n');
                }
            }
        }
        out.push('\n');
    }

    if !facts.is_empty() {
        out.push_str("Что человек уже говорил раньше:\n");
        for (key, value) in facts.iter().take(MAX_FACTS) {
            out.push_str(&format!("{} = {value}\n", key.trim()));
        }
        out.push('\n');
    }

    out.push_str("Что помощник умеет (registry | пример | опасность):\n");
    if candidates.is_empty() {
        out.push_str("(пусто — значит ничего подходящего нет)\n");
    } else {
        for candidate in candidates.iter().take(MAX_CANDIDATES) {
            out.push_str(&format!(
                "{} | {} | {}{}\n",
                candidate.registry,
                candidate.example.trim(),
                candidate.risk,
                if candidate.executable {
                    ""
                } else {
                    " | только описание"
                },
            ));
        }
    }

    out.push_str("\nОтвет одним объектом JSON:");
    out
}

/// Кандидаты для вопроса: находки поиска, приведённые к одному простому виду.
///
/// Берём ровно те строки, что уже нашёл поиск: модель выбирает из них, а не из всего
/// реестра на 829 действий. Иначе она выбирает красиво, а не по делу.
/// Сколько строк экрана отдаём модели. Больше — она утонет в дереве, меньше — не увидит
/// кнопку, о которой человек говорит.
pub const MAX_SCREEN_LINES: usize = 60;

pub fn candidates(found: &[crate::planner::PlanItem]) -> Vec<Candidate> {
    found
        .iter()
        .take(MAX_CANDIDATES)
        .map(|item| Candidate {
            registry: item.key.clone(),
            example: item.example.clone(),
            risk: item.risk.to_string(),
            executable: item.tool.is_some(),
        })
        .collect()
}

/// Разобрать ответ модели. `known` — ключи реестра, которые действительно существуют.
pub fn parse(answer: &str, known: &[String]) -> Result<Proposal, IntentError> {
    let text = answer.trim();
    if text.is_empty() {
        return Err(IntentError::Empty);
    }

    let object = single_json(text)?;
    let parsed: serde_json::Value =
        serde_json::from_str(&object).map_err(|error| IntentError::Broken(error.to_string()))?;

    let map = parsed
        .as_object()
        .ok_or_else(|| IntentError::Broken("ожидался объект".to_string()))?;

    let kind = map
        .get("kind")
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|kind| !kind.is_empty())
        .ok_or(IntentError::Missing("kind"))?
        .to_lowercase();

    match kind.as_str() {
        "call" => {
            let registry = map
                .get("registry")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|key| !key.is_empty())
                .ok_or(IntentError::Missing("registry"))?
                .to_string();

            // Выдуманная рука опаснее отказа: её нельзя выполнить, а человеку покажут,
            // будто можно.
            if !known.iter().any(|key| key == &registry) {
                return Err(IntentError::UnknownTool(registry));
            }

            Ok(Proposal::Call {
                registry,
                params: params(map.get("params"))?,
                why: field(map, "why"),
            })
        }
        "chain" => {
            let goal = required(map, "goal")?;
            let steps = map
                .get("steps")
                .and_then(|value| value.as_array())
                .ok_or(IntentError::Missing("steps"))?;

            if steps.is_empty() {
                return Err(IntentError::Missing("steps"));
            }
            if steps.len() > MAX_CHAIN_STEPS {
                return Err(IntentError::Broken(format!(
                    "шагов {}, а больше {} за раз не беру: такую цепочку человеку не прочитать",
                    steps.len(),
                    MAX_CHAIN_STEPS
                )));
            }

            let mut chain = Vec::with_capacity(steps.len());
            for step in steps {
                let object = step
                    .as_object()
                    .ok_or_else(|| IntentError::Broken("шаг цепочки — не объект".to_string()))?;

                let registry = object
                    .get("registry")
                    .and_then(|value| value.as_str())
                    .map(str::trim)
                    .filter(|key| !key.is_empty())
                    .ok_or(IntentError::Missing("steps[].registry"))?
                    .to_string();

                // Выдуманный шаг не пройдёт: цепочка либо целиком из известных рук, либо не
                // цепочка. Собрать половину и «попробовать» — то, чего здесь не будет.
                if !known.iter().any(|key| key == &registry) {
                    return Err(IntentError::UnknownTool(registry));
                }

                chain.push(ChainStep {
                    registry,
                    params: params(object.get("params"))?,
                    why: field(object, "why"),
                });
            }

            Ok(Proposal::Chain {
                goal,
                steps: chain,
                why: field(map, "why"),
            })
        }
        "hand" => Ok(Proposal::Hand {
            goal: required(map, "goal")?,
            code: required(map, "code")?,
            why: field(map, "why"),
        }),
        "learn" => Ok(Proposal::Learn {
            goal: required(map, "goal")?,
            why: field(map, "why"),
        }),
        "ask" => Ok(Proposal::Ask {
            question: required(map, "question")?,
            why: field(map, "why"),
        }),
        "refuse" => Ok(Proposal::Refuse {
            reason: required(map, "reason")?,
        }),
        other => Err(IntentError::UnknownKind(other.to_string())),
    }
}

/// Один объект JSON из ответа: снимает ```json, выкидывает болтовню вокруг.
///
/// Больше одного объекта — ошибка: два ответа означают, что модель не решила, а выбор из
/// двух — работа человека, а не угадывание.
fn single_json(text: &str) -> Result<String, IntentError> {
    let found = top_level_objects(text);

    match found.as_slice() {
        [] => Err(IntentError::NoJson),
        [_] => {
            let (start, end) = found[0];
            String::from_utf8(text.as_bytes()[start..end].to_vec()).map_err(|_| IntentError::NoJson)
        }
        _ => Err(IntentError::ManyJson),
    }
}

/// Границы объектов верхнего уровня: кавычки, экранирование и вложенность учитываются,
/// поэтому `{` внутри строки или во вложенном объекте не рвёт поиск.
fn top_level_objects(text: &str) -> Vec<(usize, usize)> {
    let mut found = Vec::new();
    let mut depth = 0usize;
    let mut open_at = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (index, symbol) in text.bytes().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if symbol == b'\\' {
                escaped = true;
            } else if symbol == b'"' {
                in_string = false;
            }
            continue;
        }

        match symbol {
            b'"' => in_string = true,
            b'{' => {
                if depth == 0 {
                    open_at = index;
                }
                depth += 1;
            }
            b'}' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    found.push((open_at, index + 1));
                }
            }
            _ => {}
        }
    }

    // Незакрытая скобка — не объект: обрывок ответа выполнять нельзя.
    if depth != 0 {
        return Vec::new();
    }

    found
}

/// Параметры: строка, число и `true`/`false` становятся строкой. Вложенное — ошибка.
fn params(value: Option<&serde_json::Value>) -> Result<BTreeMap<String, String>, IntentError> {
    let Some(value) = value else {
        return Ok(BTreeMap::new());
    };

    let Some(map) = value.as_object() else {
        return Err(IntentError::Broken(
            "params должен быть объектом".to_string(),
        ));
    };

    let mut out = BTreeMap::new();
    for (key, raw) in map {
        let text = match raw {
            serde_json::Value::String(text) => text.clone(),
            serde_json::Value::Number(number) => number.to_string(),
            serde_json::Value::Bool(flag) => flag.to_string(),
            serde_json::Value::Null => continue,
            _ => {
                return Err(IntentError::Broken(format!(
                    "параметр `{key}` должен быть простым значением"
                )))
            }
        };
        out.insert(key.clone(), text);
    }

    Ok(out)
}

fn field(map: &serde_json::Map<String, serde_json::Value>, name: &str) -> String {
    map.get(name)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .unwrap_or_default()
        .to_string()
}

fn required(
    map: &serde_json::Map<String, serde_json::Value>,
    name: &'static str,
) -> Result<String, IntentError> {
    let value = field(map, name);
    if value.is_empty() {
        return Err(IntentError::Missing(name));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn known() -> Vec<String> {
        vec![
            "звук|убавить|громкость".to_string(),
            "браузер|включить|субтитры".to_string(),
        ]
    }

    #[test]
    fn the_question_names_the_task_the_window_the_memory_and_the_hands() {
        let text = prompt(
            "  сделай потише ",
            Some(&Around {
                title: "Видео".to_string(),
                process: "chrome.exe".to_string(),
                screen: None,
            }),
            &[("вопрос:браузер".to_string(), "Chrome".to_string())],
            &[Candidate {
                registry: "звук|убавить|громкость".to_string(),
                example: "убавить громкость".to_string(),
                risk: "read".to_string(),
                executable: true,
            }],
        );

        assert!(text.contains("сделай потише"));
        assert!(text.contains("Видео (chrome.exe)"));
        assert!(text.contains("вопрос:браузер = Chrome"));
        assert!(text.contains("звук|убавить|громкость | убавить громкость | read"));
        assert!(text.contains("Ответ одним объектом JSON"));
        // Пустоту в кандидатах модель тоже должна увидеть словами, а не догадаться.
        assert!(prompt("что-нибудь", None, &[], &[]).contains("пусто"));
    }

    #[test]
    fn the_screen_is_the_address_for_the_word_this() {
        // Без экрана «нажми эту кнопку» — фраза без адресата. С экраном у модели есть
        // и имя кнопки, и её вид, и то, нажимается ли она вообще.
        let text = prompt(
            "нажми эту кнопку",
            Some(&Around {
                title: "Вход".to_string(),
                process: "chrome.exe".to_string(),
                screen: Some(
                    "Вход (chrome.exe)\n  - кнопка «Войти» #submit [invoke]\n  - поле ввода «Пароль» [value]"
                        .to_string(),
                ),
            }),
            &[],
            &[],
        );

        assert!(text.contains("На экране"));
        assert!(text.contains("кнопка «Войти» #submit [invoke]"));
        assert!(text.contains("поле ввода «Пароль» [value]"));
    }

    #[test]
    fn a_long_screen_is_cut_but_an_empty_one_is_not_shown_at_all() {
        let many: String = (0..200)
            .map(|number| format!("  - текст «строка {number}»\n"))
            .collect();

        let text = prompt(
            "найди строку",
            Some(&Around {
                title: "Документ".to_string(),
                process: "notepad.exe".to_string(),
                screen: Some(many),
            }),
            &[],
            &[],
        );
        assert!(text.contains("«строка 0»"));
        assert!(
            !text.contains("«строка 100»"),
            "потолок строк должен работать"
        );

        // Пустой экран — это не «экран пуст», а «экрана не прочитали»: молчим о нём.
        let quiet = prompt(
            "найди строку",
            Some(&Around {
                title: "Документ".to_string(),
                process: "notepad.exe".to_string(),
                screen: Some("   ".to_string()),
            }),
            &[],
            &[],
        );
        assert!(!quiet.contains("На экране"));
    }

    #[test]
    fn a_hand_that_exists_is_accepted_with_its_parameters() {
        let answer = r#"{"kind":"call","registry":"звук|убавить|громкость","params":{"level":"10"},"why":"просил тише"}"#;
        let proposal = parse(answer, &known()).expect("разбирается");

        match proposal {
            Proposal::Call {
                registry,
                params,
                why,
            } => {
                assert_eq!(registry, "звук|убавить|громкость");
                assert_eq!(params.get("level").map(String::as_str), Some("10"));
                assert_eq!(why, "просил тише");
            }
            other => panic!("ожидался вызов, получено {other:?}"),
        }
    }

    #[test]
    fn a_chain_of_known_hands_is_read_as_a_chain() {
        let answer = r#"{"kind":"chain","goal":"наведи порядок","steps":[
            {"registry":"файлы|создать|папку","params":{"path":"D:\\Отчёты"},"why":"нужна папка"},
            {"registry":"файлы|создать|папку","params":{},"why":""}
        ],"why":"по шагам"}"#;

        let known = vec![
            "файлы|создать|папку".to_string(),
            "звук|убавить|громкость".to_string(),
        ];

        match parse(answer, &known).expect("разбирается") {
            Proposal::Chain { goal, steps, why } => {
                assert_eq!(goal, "наведи порядок");
                assert_eq!(why, "по шагам");
                assert_eq!(steps.len(), 2);
                assert_eq!(
                    steps[0].params.get("path").map(String::as_str),
                    Some("D:\\Отчёты")
                );
                assert_eq!(steps[0].why, "нужна папка");
            }
            other => panic!("ожидалась цепочка, получено {other:?}"),
        }
    }

    #[test]
    fn a_chain_with_a_made_up_step_is_not_a_chain() {
        let known = vec!["файлы|создать|папку".to_string()];

        let unknown = r#"{"kind":"chain","goal":"x","steps":[{"registry":"файлы|создать|папку"},{"registry":"нет|такой|руки"}]}"#;
        assert!(matches!(
            parse(unknown, &known),
            Err(IntentError::UnknownTool(_))
        ));

        let empty = r#"{"kind":"chain","goal":"x","steps":[]}"#;
        assert!(parse(empty, &known).is_err());

        // Шесть шагов — отказ: такую цепочку человек не прочитает.
        let long = r#"{"kind":"chain","goal":"x","steps":[{"registry":"файлы|создать|папку"},{"registry":"файлы|создать|папку"},{"registry":"файлы|создать|папку"},{"registry":"файлы|создать|папку"},{"registry":"файлы|создать|папку"},{"registry":"файлы|создать|папку"}]}"#;
        let error = parse(long, &known).expect_err("должен быть отказ");
        assert!(format!("{error:?}").contains("5") || format!("{error:?}").contains("шесть"));
    }

    #[test]
    fn the_prompt_offers_the_chain_and_says_what_it_costs() {
        let text = prompt("оформи заказ", None, &[], &[]);
        assert!(text.contains("\"kind\":\"chain\""));
        assert!(text.contains("Не больше пяти шагов"));
        assert!(text.contains("подтверждения"));
    }

    #[test]
    fn fences_and_chatter_around_the_object_do_not_break_it() {
        let answer = "Конечно! Вот ответ:\n```json\n{\"kind\":\"learn\",\"goal\":\"поставить будильник\"}\n```\nУдачи!";
        assert_eq!(
            parse(answer, &known()).expect("разбирается"),
            Proposal::Learn {
                goal: "поставить будильник".to_string(),
                why: String::new(),
            }
        );
    }

    #[test]
    fn an_invented_hand_is_refused_instead_of_executed() {
        let answer = r#"{"kind":"call","registry":"система|удалить|всё","params":{}}"#;
        assert_eq!(
            parse(answer, &known()),
            Err(IntentError::UnknownTool("система|удалить|всё".to_string()))
        );
    }

    #[test]
    fn two_answers_are_not_a_choice_made_for_the_person() {
        let answer = r#"{"kind":"learn","goal":"раз"}{"kind":"learn","goal":"два"}"#;
        assert_eq!(parse(answer, &known()), Err(IntentError::ManyJson));
    }

    #[test]
    fn silence_and_chatter_are_both_errors() {
        assert_eq!(parse("   ", &known()), Err(IntentError::Empty));
        assert_eq!(
            parse("я не знаю, что делать", &known()),
            Err(IntentError::NoJson)
        );
        assert_eq!(
            parse("{ сломано }", &known()),
            Err(IntentError::Broken(
                "key must be a string at line 1 column 3".to_string()
            ))
        );
    }

    #[test]
    fn a_bare_kind_is_not_enough_to_act() {
        assert_eq!(
            parse(r#"{"kind":"call","params":{}}"#, &known()),
            Err(IntentError::Missing("registry"))
        );
        assert_eq!(
            parse(r#"{"kind":"learn"}"#, &known()),
            Err(IntentError::Missing("goal"))
        );
        assert_eq!(
            parse(r#"{"kind":"ask","question":"  "}"#, &known()),
            Err(IntentError::Missing("question"))
        );
        assert_eq!(
            parse(r#"{"kind":"refuse"}"#, &known()),
            Err(IntentError::Missing("reason"))
        );
    }

    #[test]
    fn an_unknown_kind_is_an_error_not_a_guess() {
        assert_eq!(
            parse(r#"{"kind":"выполнить"}"#, &known()),
            Err(IntentError::UnknownKind("выполнить".to_string()))
        );
    }

    #[test]
    fn a_draft_hand_is_read_as_text_and_never_as_a_call() {
        let answer =
            r#"{"kind":"hand","goal":"показать диски","code":"Get-PSDrive","why":"проще"}"#;
        assert_eq!(
            parse(answer, &known()).expect("разбирается"),
            Proposal::Hand {
                goal: "показать диски".to_string(),
                code: "Get-PSDrive".to_string(),
                why: "проще".to_string(),
            }
        );

        // Без кода это не черновик: пустая рука хуже отсутствия руки.
        assert_eq!(
            parse(r#"{"kind":"hand","goal":"показать диски"}"#, &known()),
            Err(IntentError::Missing("code"))
        );
    }

    #[test]
    fn parameters_become_strings_and_nested_values_are_refused() {
        let answer = r#"{"kind":"call","registry":"браузер|включить|субтитры","params":{"a":1,"b":true,"c":null}}"#;
        let proposal = parse(answer, &known()).expect("простые значения допустимы");
        match proposal {
            Proposal::Call { params, .. } => {
                assert_eq!(params.get("a").map(String::as_str), Some("1"));
                assert_eq!(params.get("b").map(String::as_str), Some("true"));
                assert!(
                    !params.contains_key("c"),
                    "null — это «не задано», а не пустая строка"
                );
            }
            other => panic!("ожидался вызов, получено {other:?}"),
        }

        let nested =
            r#"{"kind":"call","registry":"браузер|включить|субтитры","params":{"a":{"b":1}}}"#;
        assert!(matches!(
            parse(nested, &known()),
            Err(IntentError::Broken(_))
        ));
    }

    #[test]
    fn candidates_are_the_found_rows_and_their_executability() {
        let found = vec![crate::planner::PlanItem {
            key: "звук|убавить|громкость".to_string(),
            example: "убавить громкость".to_string(),
            risk: "read",
            decision: "allow",
            decision_reason: "",
            needs_token: false,
            tool: Some("звук|убавить|громкость"),
            score: 7,
        }];

        let list = candidates(&found);
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].registry, "звук|убавить|громкость");
        assert!(list[0].executable, "рука есть — модель должна это видеть");
    }

    #[test]
    fn braces_inside_strings_do_not_confuse_the_scanner() {
        let answer =
            r#"{"kind":"ask","question":"Что открыть: {папку} или файл?","why":"два варианта"}"#;
        match parse(answer, &known()).expect("разбирается") {
            Proposal::Ask { question, .. } => {
                assert_eq!(question, "Что открыть: {папку} или файл?")
            }
            other => panic!("ожидался вопрос, получено {other:?}"),
        }
    }
}
