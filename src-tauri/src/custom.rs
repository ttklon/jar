//! Привнесённые руки: то, что человек добавил сам, а не то, что вшито в приложение.
//!
//! Встроенные руки — это код: они проходят проверку CI и обзор человеком до того, как
//! попадут в сборку. Привнесённая рука написана моделью и принята человеком на его машине,
//! поэтому она **всегда помечена** и **всегда** отделена от встроенных: смешать их значит
//! однажды не понять, откуда взялась команда, которая что-то испортила.
//!
//! Что здесь есть: приём черновика в руки, список, чтение, удаление.
//!
//! Чего здесь **нет** и почему: исполнения. Привнесённая рука не попадает ни в реестр
//! действий, ни в план, ни в `tools::spec` — у неё просто нет такого пути. Исполнение
//! привнесённых рук — отдельный шаг с отдельными правилами (только в клетке, всегда с
//! отчётом), и делать его молча, «заодно», нельзя: это ровно то место, где ошибка стоит
//! дороже всего.
//!
//! Приём возможен только после пробы: черновик, который не запускался или упал, рукой не
//! становится. «Проверили и не вышло» — это не рука, это следующий черновик.

use serde::{Deserialize, Serialize};

use crate::hand;
use crate::memory::Memory;
use crate::trial;

/// Привнесённая рука. Хранится как данные, а не как вшитый код.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomHand {
    /// Ключ: та же строка реестра, для которой писали черновик.
    pub key: String,
    /// Как это называть человеку.
    pub title: String,
    /// Скрипт, который человек принял.
    pub code: String,
    /// Опасность строки реестра — чтобы в списке было видно, чего ждать.
    pub risk: String,
    /// Откуда взялось: словами, а не «модель». Человек должен помнить источник.
    pub source: String,
    pub created_ms: u64,
}

/// Ключ факта для руки.
pub fn fact_key(key: &str) -> String {
    format!("custom:{key}")
}

/// Все привнесённые руки, свежие сверху.
pub fn all(memory: &Memory) -> Vec<CustomHand> {
    let mut hands: Vec<CustomHand> = memory
        .facts_with_prefix("custom:")
        .into_iter()
        .filter_map(|(_, value)| serde_json::from_str::<CustomHand>(&value).ok())
        .collect();

    hands.sort_by(|left, right| {
        right
            .created_ms
            .cmp(&left.created_ms)
            .then(left.key.cmp(&right.key))
    });
    hands
}

/// Одна рука по ключу. Битый JSON — «руки нет».
pub fn get(memory: &Memory, key: &str) -> Option<CustomHand> {
    memory
        .fact(&fact_key(key))
        .and_then(|json| serde_json::from_str(&json).ok())
}

/// Забыть руку: человек имеет право убрать то, что добавил.
pub fn forget(memory: &Memory, key: &str) -> Result<(), String> {
    memory
        .forget(&fact_key(key))
        .map_err(|error| format!("рука не удалилась: {error}"))
}

/// Принять черновик в руки. Требования названы и проверяются, а не подразумеваются:
/// черновик должен существовать, проба должна быть **выполнена и успешна**, а скрипт —
/// проходить фильтр (повторно: между черновиком и приёмом он мог измениться руками).
pub fn adopt(memory: &Memory, key: &str, title: &str, risk: &str, now_ms: u64) -> Result<CustomHand, String> {
    let draft = hand::get(memory, key).ok_or_else(|| format!("черновика для этой строки нет: {key}"))?;

    let report = trial::get(memory, key).ok_or_else(|| {
        "этот черновик ещё не пробовали в клетке: рукой становится только проверенное".to_string()
    })?;

    if !report.ran {
        return Err(format!(
            "проба не выполнялась: {} — рукой такой черновик не становится",
            report.note
        ));
    }

    if !report.ok {
        return Err(format!(
            "проба не прошла: {} — черновик, который упал, это следующий черновик, а не рука",
            report.note
        ));
    }

    let found = hand::scan(&draft.code);
    if !found.is_empty() {
        return Err(format!(
            "в скрипте есть то, чего нельзя: {}",
            found.join("; ")
        ));
    }

    let title = if title.trim().is_empty() {
        draft.goal.clone()
    } else {
        title.trim().to_string()
    };

    let hand = CustomHand {
        key: key.to_string(),
        title,
        code: draft.code.clone(),
        risk: risk.to_string(),
        source: format!("черновик модели, проверен в клетке: {}", report.note),
        created_ms: now_ms,
    };

    let json = serde_json::to_string(&hand).map_err(|error| format!("рука не пишется: {error}"))?;
    memory
        .remember(&fact_key(key), &json)
        .map_err(|error| format!("рука не сохранилась: {error}"))?;

    Ok(hand)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn memory(name: &str) -> (Memory, PathBuf) {
        let dir = std::env::temp_dir().join(format!(
            "zshelper-custom-{name}-{}-{}",
            std::process::id(),
            now()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let path = dir.join("memory.db");
        (Memory::open(path).expect("память открывается"), dir)
    }

    fn now() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_millis())
            .unwrap_or(0)
    }

    fn draft_with_code(memory: &Memory, key: &str, code: &str) {
        let draft = hand::accept(key, "показать диски", code, "", 1000).expect("черновик");
        hand::save(memory, &draft).expect("черновик сохранён");
    }

    fn trial_report(memory: &Memory, key: &str, ran: bool, ok: bool) {
        let report = if ran {
            trial::Report {
                key: key.to_string(),
                ran,
                ok,
                exit_code: Some(if ok { 0 } else { 1 }),
                stdout: "готово".to_string(),
                stderr: String::new(),
                timed_out: false,
                cell: "клетка: AppContainer, без сети".to_string(),
                duration_ms: 10,
                note: if ok {
                    "проба прошла: код 0".to_string()
                } else {
                    "проба упала: код 1".to_string()
                },
                created_ms: 2000,
            }
        } else {
            trial::skipped(key, "ERROR_BAD_ENVIRONMENT", 2000)
        };
        trial::save(memory, &report).expect("отчёт сохранён");
    }

    #[test]
    fn a_draft_without_a_trial_does_not_become_a_hand() {
        let (memory, dir) = memory("notried");
        draft_with_code(&memory, "k", "Get-PSDrive");

        let error = adopt(&memory, "k", "", "read", 3000).expect_err("без пробы нельзя");
        assert!(error.contains("не пробовали в клетке"), "{error}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_failed_or_unrun_trial_does_not_become_a_hand() {
        let (memory, dir) = memory("failed");
        draft_with_code(&memory, "k", "Get-PSDrive");

        trial_report(&memory, "k", false, false);
        assert!(adopt(&memory, "k", "", "read", 3000)
            .expect_err("не запускалось")
            .contains("проба не выполнялась"));

        trial_report(&memory, "k", true, false);
        assert!(adopt(&memory, "k", "", "read", 3000)
            .expect_err("упало")
            .contains("проба не прошла"));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_tried_draft_becomes_a_marked_hand_that_can_be_removed() {
        let (memory, dir) = memory("ok");
        draft_with_code(&memory, "storage-backup|проверить|свободное место", "Get-PSDrive");
        trial_report(&memory, "storage-backup|проверить|свободное место", true, true);

        let hand = adopt(
            &memory,
            "storage-backup|проверить|свободное место",
            "",
            "read",
            3000,
        )
        .expect("рука принята");

        assert_eq!(hand.title, "показать диски", "без названия берём слова черновика");
        assert!(hand.source.contains("проверен в клетке"), "{}", hand.source);
        assert_eq!(all(&memory), vec![hand.clone()]);
        assert_eq!(get(&memory, "storage-backup|проверить|свободное место"), Some(hand.clone()));

        forget(&memory, "storage-backup|проверить|свободное место").expect("удалена");
        assert!(all(&memory).is_empty(), "человек имеет право убрать добавленное");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_script_that_broke_the_rules_after_the_trial_is_refused() {
        let (memory, dir) = memory("later");
        let key = "k";

        // Черновик был чистым, пробу прошёл — а потом его подменили на недопустимый.
        draft_with_code(&memory, key, "Get-PSDrive");
        trial_report(&memory, key, true, true);
        draft_with_code(&memory, key, "Invoke-Expression $x");

        let error = adopt(&memory, key, "", "read", 3000).expect_err("фильтр снова проверяет");
        assert!(error.contains("выполнение строки как кода"), "{error}");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
