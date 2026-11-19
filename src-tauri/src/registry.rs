//! Реестр действий — каталог инструментов приложения.
//!
//! Источник истины — `data/actions.psv` в репозитории; `data/actions.json`
//! генерируется из него и проверяется CI (`tools/actions.py`: 10 полей,
//! допустимые риск/tier/status, уникальные ключи `domain|verb|object`).
//! Файл встраивается в бинарник: в рамках релиза реестр неизменен, а чтение
//! с диска на старте — лишняя точка отказа (файл могут удалить, подменить,
//! заблокировать антивирусом).
//!
//! Профили и скиллы ссылаются на действие строкой `domain|verb|object`
//! (см. `key()`), а не слагом `id`: ключ человекочитаем и переживает
//! перенумерацию реестра.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Встроенный реестр. Путь считается от этого файла: `src-tauri/src/../../data`.
const ACTIONS_JSON: &str = include_str!("../../data/actions.json");

/// Риск операции. Порядок вариантов — от безопасного к тому, что требует человека;
/// политика (`policy.rs`) опирается на этот порядок, поэтому он часть контракта.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Risk {
    #[serde(rename = "read")]
    Read,
    #[serde(rename = "write-local")]
    WriteLocal,
    #[serde(rename = "external")]
    External,
    #[serde(rename = "destructive")]
    Destructive,
    #[serde(rename = "identity")]
    Identity,
    #[serde(rename = "money")]
    Money,
}

impl Risk {
    /// Строка риска ровно в том виде, в каком она лежит в реестре и приходит в UI.
    /// Одно место вместо `serde_json::to_value` по всему коду.
    pub fn as_str(self) -> &'static str {
        match self {
            Risk::Read => "read",
            Risk::WriteLocal => "write-local",
            Risk::External => "external",
            Risk::Destructive => "destructive",
            Risk::Identity => "identity",
            Risk::Money => "money",
        }
    }

    /// Нужен ли человек рядом, чтобы это выполнить.
    pub fn needs_human(self) -> bool {
        !matches!(self, Risk::Read)
    }

    /// Деньги и личность система не выполняет вовсе — даже с подтверждением.
    pub fn is_forbidden_for_agent(self) -> bool {
        matches!(self, Risk::Identity | Risk::Money)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Tier {
    #[serde(rename = "T0")]
    T0,
    #[serde(rename = "T1")]
    T1,
    #[serde(rename = "T2")]
    T2,
    #[serde(rename = "T3")]
    T3,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ActionStatus {
    #[serde(rename = "v1")]
    V1,
    #[serde(rename = "v2")]
    V2,
    #[serde(rename = "later")]
    Later,
    #[serde(rename = "never")]
    Never,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum HumanCode {
    #[serde(rename = "c")]
    Can,
    #[serde(rename = "h")]
    Hard,
    #[serde(rename = "n")]
    Never,
}

/// Строка реестра. Имена полей совпадают с JSON и с типами фронтенда
/// (`src/ipc/types.ts`) один в один — конвертация не нужна.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Action {
    pub id: String,
    pub domain: String,
    pub verb: String,
    pub object: String,
    pub example: String,
    pub implementation: Vec<String>,
    pub risk: Risk,
    pub tier: Tier,
    pub human: String,
    pub human_code: HumanCode,
    pub status: ActionStatus,
    pub notes: String,
}

impl Action {
    /// Ключ, которым пользуются профили, скиллы и планы: `domain|verb|object`.
    pub fn key(&self) -> String {
        format!("{}|{}|{}", self.domain, self.verb, self.object)
    }

    /// Можно ли вообще предлагать это действие пользователю.
    pub fn is_offerable(&self) -> bool {
        self.status != ActionStatus::Never
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RegistryStats {
    pub actions: usize,
    pub domains: usize,
    pub verbs: usize,
    pub by_risk: HashMap<String, usize>,
    pub by_tier: HashMap<String, usize>,
    pub by_status: HashMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistrySnapshot {
    pub actions: Vec<Action>,
    pub stats: RegistryStats,
}

#[derive(Debug, thiserror::Error)]
pub enum RegistryError {
    #[error("реестр не разобран: {0}")]
    Parse(#[from] serde_json::Error),
    #[error("дубль ключа {key}: {first} и {second}")]
    DuplicateKey {
        key: String,
        first: String,
        second: String,
    },
    #[error("дубль id {0}")]
    DuplicateId(String),
}

/// Реестр с индексами по `id` и по `domain|verb|object`.
#[derive(Debug)]
pub struct Registry {
    actions: Vec<Action>,
    by_id: HashMap<String, usize>,
    by_key: HashMap<String, usize>,
    stats: RegistryStats,
}

impl Registry {
    /// Разбирает встроенный JSON и строит индексы. Падает, если данные
    /// противоречивы: лучше не запуститься, чем работать с двусмысленным
    /// каталогом (ту же проверку делает `tools/actions.py` в CI).
    pub fn load() -> Result<Self, RegistryError> {
        Self::from_json(ACTIONS_JSON)
    }

    pub fn from_json(raw: &str) -> Result<Self, RegistryError> {
        let actions: Vec<Action> = serde_json::from_str(raw)?;
        Self::new(actions)
    }

    pub fn new(actions: Vec<Action>) -> Result<Self, RegistryError> {
        let mut by_id = HashMap::with_capacity(actions.len());
        let mut by_key = HashMap::with_capacity(actions.len());
        let mut stats = RegistryStats {
            actions: actions.len(),
            ..RegistryStats::default()
        };
        let mut domains = std::collections::HashSet::new();
        let mut verbs = std::collections::HashSet::new();

        for (index, action) in actions.iter().enumerate() {
            if by_id.insert(action.id.clone(), index).is_some() {
                return Err(RegistryError::DuplicateId(action.id.clone()));
            }
            let key = action.key();
            if let Some(previous) = by_key.insert(key.clone(), index) {
                return Err(RegistryError::DuplicateKey {
                    key,
                    first: actions[previous].id.clone(),
                    second: action.id.clone(),
                });
            }

            domains.insert(action.domain.clone());
            verbs.insert(action.verb.clone());
            *stats
                .by_risk
                .entry(risk_key(action.risk).to_string())
                .or_default() += 1;
            *stats
                .by_tier
                .entry(tier_key(action.tier).to_string())
                .or_default() += 1;
            *stats
                .by_status
                .entry(status_key(action.status).to_string())
                .or_default() += 1;
        }

        stats.domains = domains.len();
        stats.verbs = verbs.len();

        Ok(Self {
            actions,
            by_id,
            by_key,
            stats,
        })
    }

    pub fn actions(&self) -> &[Action] {
        &self.actions
    }

    pub fn stats(&self) -> &RegistryStats {
        &self.stats
    }

    pub fn len(&self) -> usize {
        self.actions.len()
    }

    pub fn is_empty(&self) -> bool {
        self.actions.is_empty()
    }

    pub fn by_id(&self, id: &str) -> Option<&Action> {
        self.by_id.get(id).map(|index| &self.actions[*index])
    }

    /// Разрешение ссылки из профиля или скилла: `domain|verb|object`.
    pub fn by_key(&self, key: &str) -> Option<&Action> {
        self.by_key.get(key).map(|index| &self.actions[*index])
    }

    /// Разрешение «короткой» ссылки `domain|verb` (без объекта) — так профили
    /// ссылаются, когда в домене один осмысленный вариант. Если вариантов
    /// несколько, возвращаем первый по реестру и говорим об этом вызывающему.
    pub fn by_short_key(&self, key: &str) -> Option<&Action> {
        self.actions.iter().find(|action| {
            let mut parts = key.splitn(2, '|');
            let domain = parts.next().unwrap_or_default();
            let verb = parts.next().unwrap_or_default();
            action.domain == domain && action.verb == verb
        })
    }

    /// Поиск по каталогу: слова ищутся в примере фразы, глаголе, объекте,
    /// домене и каналах исполнения — те поля, которые человек реально помнит.
    pub fn search(&self, query: &str) -> Vec<&Action> {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return self.actions.iter().collect();
        }
        let words: Vec<&str> = needle.split_whitespace().collect();

        self.actions
            .iter()
            .filter(|action| {
                let haystack = format!(
                    "{} {} {} {} {}",
                    action.example,
                    action.verb,
                    action.object,
                    action.domain,
                    action.implementation.join(" ")
                )
                .to_lowercase();
                words.iter().all(|word| haystack.contains(word))
            })
            .collect()
    }

    pub fn snapshot(&self) -> RegistrySnapshot {
        RegistrySnapshot {
            actions: self.actions.clone(),
            stats: self.stats.clone(),
        }
    }
}

fn risk_key(risk: Risk) -> &'static str {
    match risk {
        Risk::Read => "read",
        Risk::WriteLocal => "write-local",
        Risk::External => "external",
        Risk::Destructive => "destructive",
        Risk::Identity => "identity",
        Risk::Money => "money",
    }
}

fn tier_key(tier: Tier) -> &'static str {
    match tier {
        Tier::T0 => "T0",
        Tier::T1 => "T1",
        Tier::T2 => "T2",
        Tier::T3 => "T3",
    }
}

fn status_key(status: ActionStatus) -> &'static str {
    match status {
        ActionStatus::V1 => "v1",
        ActionStatus::V2 => "v2",
        ActionStatus::Later => "later",
        ActionStatus::Never => "never",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry() -> Registry {
        Registry::load().expect("встроенный реестр обязан разбираться")
    }

    #[test]
    fn embedded_registry_parses() {
        let registry = registry();
        // Точное число меняется с данными — проверяем порядок величины и то,
        // что это не пустой огрызок.
        assert!(
            registry.len() > 500,
            "в реестре {} действий",
            registry.len()
        );
        assert!(registry.stats().domains > 20);
        assert!(registry.stats().verbs > 50);
    }

    #[test]
    fn stats_cover_every_action() {
        let registry = registry();
        let total: usize = registry.stats().by_risk.values().sum();
        assert_eq!(total, registry.len());
        let total: usize = registry.stats().by_tier.values().sum();
        assert_eq!(total, registry.len());
        let total: usize = registry.stats().by_status.values().sum();
        assert_eq!(total, registry.len());
    }

    #[test]
    fn ids_and_keys_are_unique() {
        let registry = registry();
        // Индексы строятся с проверкой, поэтому здесь достаточно убедиться,
        // что они полные: каждая строка находится обоими способами.
        for action in registry.actions() {
            assert!(registry.by_id(&action.id).is_some());
            assert!(registry.by_key(&action.key()).is_some());
        }
    }

    #[test]
    fn key_is_domain_verb_object() {
        let action = Action {
            id: "files-001".into(),
            domain: "files".into(),
            verb: "создать".into(),
            object: "папку".into(),
            example: "создай папку".into(),
            implementation: vec!["fs.mkdir".into()],
            risk: Risk::WriteLocal,
            tier: Tier::T0,
            human: "может".into(),
            human_code: HumanCode::Can,
            status: ActionStatus::V1,
            notes: String::new(),
        };
        assert_eq!(action.key(), "files|создать|папку");
        assert!(action.is_offerable());
    }

    #[test]
    fn short_key_resolves_profile_references() {
        let registry = registry();
        let action = registry
            .by_short_key("files|создать")
            .expect("в домене files есть глагол «создать»");
        assert_eq!(action.domain, "files");
        assert_eq!(action.verb, "создать");
    }

    #[test]
    fn search_finds_by_phrase_and_by_channel() {
        let registry = registry();
        assert!(!registry.search("папку").is_empty());
        assert!(!registry.search("fs.mkdir").is_empty());
        assert!(registry.search("абракадабра-которой-нет").is_empty());
        assert_eq!(registry.search("   ").len(), registry.len());
    }

    #[test]
    fn duplicate_key_is_rejected() {
        let raw = r#"[
          {"id":"a-1","domain":"d","verb":"v","object":"o","example":"e","implementation":["x"],
           "risk":"read","tier":"T0","human":"может","human_code":"c","status":"v1","notes":""},
          {"id":"a-2","domain":"d","verb":"v","object":"o","example":"e2","implementation":["y"],
           "risk":"read","tier":"T0","human":"может","human_code":"c","status":"v1","notes":""}
        ]"#;
        let error = Registry::from_json(raw).expect_err("дубль ключа должен падать");
        assert!(matches!(error, RegistryError::DuplicateKey { .. }));
    }

    #[test]
    fn risk_ordering_is_part_of_the_contract() {
        assert!(Risk::WriteLocal > Risk::Read);
        assert!(Risk::Destructive > Risk::WriteLocal);
        assert!(Risk::Money > Risk::Destructive);
        assert!(!Risk::Read.needs_human());
        assert!(Risk::WriteLocal.needs_human());
        assert!(Risk::Money.is_forbidden_for_agent());
        assert!(!Risk::External.is_forbidden_for_agent());
    }
}
