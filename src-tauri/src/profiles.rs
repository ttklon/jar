//! Профили приложений: «как именно это делается в этой программе».
//!
//! Реестр отвечает на вопрос **что** умеет ZShelper (829 действий), профиль — **как**
//! это сделать в конкретной программе: якоря, шаги, проверка результата. Профили
//! готовит человек (`data/profiles/*.json`), проверяет `tools/profiles.py`, а
//! приложение читает сводку `data/profiles.json`.
//!
//! Инвариант, ради которого этот модуль существует: ссылка профиля на реестр обязана
//! разрешаться в реальную строку. Иначе экран «Приложения» обещает то, чего нет, — а
//! политика риска считает риск по строке реестра, значит без строки риск неизвестен.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::registry::{Action, Registry};

const PROFILES_JSON: &str = include_str!("../../data/profiles.json");

/// Одна операция профиля. `registry` — ссылка на строку реестра, возможно короткая.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileOperation {
    pub name: String,
    pub registry: String,
    pub risk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSpec {
    /// Слаг из имени файла: стабильный идентификатор, не зависит от названия программы.
    pub slug: String,
    pub app: String,
    pub kind: String,
    pub exe: Vec<String>,
    pub ui_stack: String,
    pub version_seen: String,
    /// Когда профиль последний раз проверяли руками — обещание перепроверки.
    pub verified_at: String,
    pub anchors: usize,
    pub operations: Vec<ProfileOperation>,
}

static PROFILES: OnceLock<Vec<ProfileSpec>> = OnceLock::new();

/// Все профили. Состав проверяется в CI (`tools/profiles.py`) и тестами ниже.
pub fn all() -> &'static [ProfileSpec] {
    PROFILES.get_or_init(|| {
        serde_json::from_str(PROFILES_JSON).expect("data/profiles.json обязан быть валидным (CI)")
    })
}

pub fn get(slug: &str) -> Option<&'static ProfileSpec> {
    all().iter().find(|profile| profile.slug == slug)
}

/// Разрешает ссылку профиля в строку реестра.
///
/// Ссылка бывает трёх видов: полный ключ (`domain|verb|object`), короткий
/// (`domain|verb`) и с частью объекта (`domain|verb|документ`). В последних двух
/// случаях берётся **самая рискованная** подходящая строка: если в реестре есть и
/// чтение, и удаление одного и того же действия, профиль обязан считаться опасным.
pub fn resolve<'a>(registry: &'a Registry, key: &str) -> Option<&'a Action> {
    if let Some(action) = registry.by_key(key) {
        return Some(action);
    }

    let mut parts = key.splitn(3, '|');
    let domain = parts.next()?;
    let verb = parts.next()?;
    let object = parts.next().filter(|filter| !filter.is_empty());

    registry
        .actions()
        .iter()
        .filter(|action| {
            action.domain == domain
                && action.verb == verb
                && object.map_or(true, |filter| action.object.contains(filter))
        })
        .max_by_key(|action| action.risk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools;

    fn registry() -> Registry {
        Registry::load().expect("реестр читается")
    }

    #[test]
    fn slugs_are_unique_and_look_like_files() {
        let mut seen = std::collections::HashSet::new();
        for profile in all() {
            assert!(
                profile.slug.chars().all(|c| c.is_ascii_lowercase()
                    || c.is_ascii_digit()
                    || c == '-'
                    || c == '_'),
                "слаг «{}» должен быть безопасным именем файла",
                profile.slug
            );
            assert!(seen.insert(&profile.slug), "слаг «{}» повторяется", profile.slug);
            assert!(!profile.app.trim().is_empty(), "у {} нет названия", profile.slug);
            assert!(!profile.exe.is_empty(), "у {} не указан исполняемый файл", profile.slug);
            assert!(
                !profile.operations.is_empty(),
                "у {} нет ни одной операции",
                profile.slug
            );
        }
    }

    #[test]
    fn every_operation_points_at_a_registry_row() {
        let registry = registry();
        for profile in all() {
            for operation in &profile.operations {
                let action = resolve(&registry, &operation.registry).unwrap_or_else(|| {
                    panic!(
                        "{}: операция «{}» ссылается на «{}», которого нет в реестре",
                        profile.slug, operation.name, operation.registry
                    )
                });
                assert!(
                    !action.risk.is_forbidden_for_agent(),
                    "{}: «{}» — действие, которое система не выполняет",
                    profile.slug,
                    operation.registry
                );
            }
        }
    }

    #[test]
    fn operation_risk_is_not_lower_than_the_registry() {
        // Профиль может объявить риск выше реестра (осторожность разрешена), но не ниже:
        // иначе «тихая» операция получит подтверждение «чтения».
        let registry = registry();
        let rank = |risk: &str| match risk {
            "read" => 0,
            "write-local" => 1,
            "external" => 2,
            "destructive" => 3,
            "identity" => 4,
            "money" => 5,
            _ => -1,
        };

        for profile in all() {
            for operation in &profile.operations {
                let action = resolve(&registry, &operation.registry).expect("строка реестра");
                let base = serde_json::to_value(action.risk)
                    .ok()
                    .and_then(|value| value.as_str().map(str::to_string))
                    .unwrap_or_default();
                assert!(
                    rank(&operation.risk) >= rank(&base),
                    "{}: «{}» объявляет риск {}, а реестр — {}",
                    profile.slug,
                    operation.name,
                    operation.risk,
                    base
                );
            }
        }
    }

    #[test]
    fn some_operations_already_have_a_hand() {
        // Не требование к данным, а проверка связи двух слоёв: если профили и «руки»
        // разойдутся совсем, экран «Приложения» перестанет показывать хоть что-то живое.
        let supported = all()
            .iter()
            .flat_map(|profile| profile.operations.iter())
            .filter(|operation| tools::spec(&operation.registry).is_some())
            .count();
        assert!(
            supported > 0,
            "ни одна операция профилей не покрыта инструментами — слои разошлись"
        );
    }
}
