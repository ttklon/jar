//! Планировщик без модели: найти в реестре то, что человек просит.
//!
//! Полноценный планировщик появится с моделью (M3). Но одна его часть полезна уже
//! сейчас и, главное, проверяема без сети: **retrieval** — сопоставить фразу человека
//! со строками реестра и честно сказать, что из найденного приложение умеет делать
//! прямо сейчас, что умеет только описывать, а что не выполняет вовсе.
//!
//! Правила поиска намеренно простые и объяснимые: слова фразы сравниваются с началом
//! слов в полях строки (объект важнее глагола, глагол важнее примера). Никаких
//! эмбеддингов и никакой «магии»: если ответ неверный, видно, почему.
//!
//! Что этот модуль **не** делает: не строит план из нескольких шагов и не выбирает
//! параметры. Это следующий этап — и он должен опираться на модель, а не на догадки.

use serde::Serialize;

use crate::policy::{self, Decision};
use crate::registry::{Action, Registry};
use crate::tools;

/// Минимальная длина значимого слова. Короче — предлоги и союзы, они только шумят.
const MIN_TERM: usize = 3;

/// Вес поля: объект — то, о чём просят; глагол — что сделать; пример и домен — подсказка.
const WEIGHT_OBJECT: u32 = 3;
const WEIGHT_VERB: u32 = 2;
const WEIGHT_EXAMPLE: u32 = 1;
const WEIGHT_DOMAIN: u32 = 1;

/// Один кандидат ответа: строка реестра, решение политики и наличие инструмента.
#[derive(Debug, Serialize)]
pub struct PlanItem {
    /// Ключ `domain|verb|object` — по нему всё и находится.
    pub key: String,
    /// Фраза-пример из реестра: как это звучит по-человечески.
    pub example: String,
    pub risk: &'static str,
    pub decision: &'static str,
    pub decision_reason: &'static str,
    pub needs_token: bool,
    /// Ключ инструмента, если приложение уже умеет это выполнять.
    pub tool: Option<&'static str>,
    /// «Руками» это пока нельзя, но человек может сделать сам — так и говорим.
    pub score: u32,
}

/// Разбирает фразу на значимые слова: нижний регистр, ё→е, без коротких слов.
pub fn terms(text: &str) -> Vec<String> {
    text.to_lowercase()
        .replace('ё', "е")
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.chars().count() >= MIN_TERM)
        .map(str::to_string)
        .collect()
}

/// Совпадает ли слово запроса со словом строки. Сравнение по началу — так «папк»
/// находит «папку», а «созда» — «создать», без словаря и стеммера.
fn matches(query: &str, term: &str) -> bool {
    term.starts_with(query) || query.starts_with(term)
}

/// Вес одного поля: сколько слов запроса в нём нашлось.
fn field_score(query: &[String], text: &str, weight: u32) -> u32 {
    let words = terms(text);
    let hits = query
        .iter()
        .filter(|needle| words.iter().any(|word| matches(needle, word)))
        .count() as u32;
    hits * weight
}

/// Счёт строки реестра для запроса. Ноль означает «не про это».
pub fn score(query: &[String], action: &Action) -> u32 {
    if query.is_empty() {
        return 0;
    }

    let object = field_score(query, &action.object, WEIGHT_OBJECT);
    let verb = field_score(query, &action.verb, WEIGHT_VERB);
    let example = field_score(query, &action.example, WEIGHT_EXAMPLE);
    let domain = field_score(query, &action.domain, WEIGHT_DOMAIN);

    // Совпадение только по примеру или домену — слишком слабо: «сделай красиво»
    // не должно выдавать полреестра.
    if object == 0 && verb == 0 {
        return 0;
    }

    object + verb + example + domain
}

fn plan_item(action: &Action, score: u32) -> PlanItem {
    let decision = policy::decide(action);
    let key = action.key();

    PlanItem {
        tool: tools::spec(&key).map(|spec| spec.registry.as_str()),
        key,
        example: action.example.clone(),
        risk: action.risk.as_str(),
        decision: decision.as_str(),
        decision_reason: decision.reason(),
        needs_token: decision.needs_token(),
        score,
    }
}

/// Ищет подходящие действия. Сначала — то, что приложение уже умеет выполнять:
/// обещать «я это могу» про нереализованное действие нельзя.
pub fn plan(registry: &Registry, query: &str, limit: usize) -> Vec<PlanItem> {
    let words = terms(query);
    if words.is_empty() || limit == 0 {
        return Vec::new();
    }

    // Берём и строки со статусом `never`: если человек просит оплатить счёт, честный
    // ответ — «этого я не делаю», а не «ничего не нашлось». Решение политики у такой
    // строки всё равно `deny`, и в интерфейсе это видно.
    let mut found: Vec<(u32, bool, PlanItem)> = registry
        .actions()
        .iter()
        .map(|action| (score(&words, action), action))
        .filter(|(score, _)| *score > 0)
        .map(|(score, action)| {
            let item = plan_item(action, score);
            let executable = item.tool.is_some();
            (score, executable, item)
        })
        .collect();

    // Сортировка детерминированная: сначала точность, потом «это уже можно выполнить»,
    // потом ключ — иначе одинаковые запросы давали бы разный порядок.
    found.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then(right.1.cmp(&left.1))
            .then(left.2.key.cmp(&right.2.key))
    });

    found
        .into_iter()
        .take(limit)
        .map(|(_, _, item)| item)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::registry::Risk;

    fn registry() -> Registry {
        Registry::load().expect("реестр читается")
    }

    #[test]
    fn terms_drop_short_words_and_normalise_yo() {
        let words = terms("Создай папку в Ёмкости!");
        assert!(words.contains(&"создай".to_string()));
        assert!(words.contains(&"папку".to_string()));
        assert!(words.contains(&"емкости".to_string()), "ё заменяется на е");
        assert!(!words.contains(&"в".to_string()), "предлоги не нужны");
    }

    #[test]
    fn create_folder_query_finds_the_hand_that_can_do_it() {
        let registry = registry();
        let items = plan(&registry, "создай папку", 5);

        let first = items.first().expect("хоть что-то найдено");
        assert_eq!(first.key, "files|создать|папку");
        assert!(first.tool.is_some(), "это действие уже выполняется рукой");
        assert!(first.needs_token, "создание папки требует подтверждения");
    }

    #[test]
    fn money_query_is_found_but_never_executable() {
        let registry = registry();
        let items = plan(&registry, "оплати счёт", 20);

        let money = items
            .iter()
            .find(|item| item.risk == "money")
            .expect("такая строка в реестре есть");
        assert_eq!(money.decision, "deny");
        assert!(money.tool.is_none(), "деньги система не выполняет");
    }

    #[test]
    fn nonsense_query_finds_nothing() {
        let registry = registry();
        assert!(plan(&registry, "  ", 5).is_empty());
        assert!(plan(&registry, "квазар", 5).is_empty());
    }

    #[test]
    fn results_are_deterministic_and_limited() {
        let registry = registry();
        let first = plan(&registry, "проверить диск", 3);
        let second = plan(&registry, "проверить диск", 3);

        assert!(first.len() <= 3, "лимит соблюдается");
        assert_eq!(
            first.iter().map(|item| item.key.clone()).collect::<Vec<_>>(),
            second.iter().map(|item| item.key.clone()).collect::<Vec<_>>(),
            "один и тот же запрос обязан давать один и тот же порядок"
        );
    }

    #[test]
    fn executable_actions_come_before_described_ones_on_equal_score() {
        let registry = registry();
        let items = plan(&registry, "размеры папки", 10);
        let scores: Vec<(u32, bool)> = items
            .iter()
            .map(|item| (item.score, item.tool.is_some()))
            .collect();

        for pair in scores.windows(2) {
            if pair[0].0 == pair[1].0 {
                assert!(
                    pair[0].1 >= pair[1].1,
                    "при равном счёте выполнимое действие идёт раньше"
                );
            }
        }
    }

    #[test]
    fn risk_labels_match_the_registry() {
        let registry = registry();
        for item in plan(&registry, "удали файл", 5) {
            assert!(
                matches!(
                    item.risk,
                    "read" | "write-local" | "external" | "destructive" | "identity" | "money"
                ),
                "неизвестный риск {}",
                item.risk
            );
            let _ = Risk::Read.as_str();
        }
    }
}
