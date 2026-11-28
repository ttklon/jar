//! Сон и завершение работы: не потерять дело и не начать его самим.
//!
//! Windows выключается и **даёт приложению несколько секунд**. Если в эти
//! секунды ничего не сделать, случается самое обидное: человек нажал «завершить
//! работу», а на утро дело, которое шло, не продолжилось — потому что номер шага
//! не сохранился.
//!
//! Два правила:
//!
//!  1. **сохранить — успеть**, и список минимален: у нас секунды. Номер шага,
//!     имя дела, фраза и незаконченная фраза в поле ввода;
//!  2. **не мочь помешать выключению**. Даже если запись не удалась, ответ
//!     «выключайте»: работа компьютера важнее нашего журнала.
//!
//! И симметричное правило после включения: **не продолжаем молча**. Дело
//! возвращается с вопросом, а не с выполнением.

use serde::{Deserialize, Serialize};

/// Что нужно сохранить при выходе.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Need {
    pub deed: Option<String>,
    pub step: u32,
    pub said: String,
    pub draft: String,
}

/// Что успели сохранить.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Saved {
    /// Можно ли выключать. Всегда да — но поле есть, чтобы это было решением,
    /// а не забывчивостью.
    pub allow: bool,
    pub items: Vec<String>,
    pub said: String,
}

/// Где лежит незавершённое.
pub fn file() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("ZShelper").join("unfinished.json")
}

/// Сохранить. `ok` — удалась ли запись.
pub fn save(need: &Need, ok: bool) -> Saved {
    let mut items: Vec<String> = Vec::new();
    if let Some(deed) = &need.deed {
        items.push(format!("дело «{deed}» на шаге {}", need.step));
    }
    if !need.said.trim().is_empty() {
        items.push("фраза".to_string());
    }
    if !need.draft.trim().is_empty() && need.draft != need.said {
        items.push("незаконченная фраза в поле".to_string());
    }

    if !ok {
        return Saved {
            allow: true,
            items: Vec::new(),
            said: "сохранить не успели, но выключению не мешаю: работа компьютера важнее нашего \
                   журнала. Продолжить дело можно будет вручную"
                .to_string(),
        };
    }

    Saved {
        allow: true,
        said: if items.is_empty() {
            "сохранять нечего: дел и фраз не было".to_string()
        } else {
            format!(
                "сохранено: {}. После включения можно продолжить",
                items.join(", ")
            )
        },
        items,
    }
}

/// Записать на диск и вернуть `Saved` — с честным `ok`.
pub fn save_now(need: &Need) -> Saved {
    let path = file();
    let written = (|| -> Result<(), String> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|error| error.to_string())?;
        }
        let text = serde_json::to_string_pretty(need).map_err(|error| error.to_string())?;
        std::fs::write(&path, format!("{text}\n")).map_err(|error| error.to_string())
    })();
    save(need, written.is_ok())
}

/// Что осталось от прошлого раза. `None` — ничего не осталось.
///
/// Битый файл — `None`, а не паника: незавершённое дело — удобство, не условие
/// запуска.
pub fn unfinished() -> Option<Need> {
    let text = std::fs::read_to_string(file()).ok()?;
    let need: Need = serde_json::from_str(&text).ok()?;
    let empty = need.deed.is_none() && need.said.trim().is_empty() && need.draft.trim().is_empty();
    if empty {
        None
    } else {
        Some(need)
    }
}

/// После включения: что сказать. Пусто — ничего.
///
/// Спрашиваем, а не продолжаем (шаг 457: «продолжить всё молча» — это и есть
/// случай, когда ноутбук в сумке что-то удаляет).
pub fn after_restart(need: &Need) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(deed) = &need.deed {
        parts.push(format!("дело «{deed}» на шаге {}", need.step));
    }
    if !need.said.trim().is_empty() {
        parts.push("фраза".to_string());
    }
    if !need.draft.trim().is_empty() && need.draft != need.said {
        parts.push("незаконченная фраза в поле".to_string());
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(
            "после включения: {} на месте. Продолжить — с того же шага, по вашему ответу",
            parts.join(", ")
        )
    }
}

/// Забыть незавершённое — после ответа человека.
pub fn forget() -> Result<(), String> {
    match std::fs::remove_file(file()) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("не удалось забыть незавершённое: {error}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn need() -> Need {
        Need {
            deed: Some("уборка загрузок".into()),
            step: 3,
            said: "убери загрузки".into(),
            draft: "и ещё почисти".into(),
        }
    }

    #[test]
    fn a_failed_save_does_not_block_shutdown() {
        let saved = save(&need(), false);
        assert!(saved.allow, "работа компьютера важнее нашего журнала");
        assert!(saved.items.is_empty());
        assert!(saved.said.contains("выключайте") || saved.said.contains("выключению не мешаю"));
    }

    #[test]
    fn only_what_can_be_resumed_is_saved() {
        let saved = save(&need(), true);
        assert_eq!(saved.items.len(), 3);
        // Формат — «на шаге 3»: сравниваем с настоящей строкой, а не с догадкой.
        assert_eq!(saved.items[0], "дело «уборка загрузок» на шаге 3");
    }

    #[test]
    fn nothing_to_save_is_said_plainly() {
        let saved = save(&Need::default(), true);
        assert!(saved.items.is_empty());
        assert!(saved.said.contains("сохранять нечего"));
    }

    #[test]
    fn after_restart_the_deed_waits_for_an_answer() {
        let said = after_restart(&need());
        assert!(said.contains("дело «уборка загрузок» на шаге 3"));
        assert!(said.contains("по вашему ответу"), "{said}");
        assert!(!said.contains("продолжаю"), "молча не продолжаем");
    }

    #[test]
    fn an_empty_file_is_not_an_unfinished_deed() {
        let empty = Need::default();
        assert!(after_restart(&empty).is_empty());
    }
}
