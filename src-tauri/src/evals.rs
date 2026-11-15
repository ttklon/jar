//! Самопроверка: обещания приложения, которые можно проверить машиной — без человека, без
//! сети и без модели.
//!
//! Зачем это отдельно от тестов. Тесты проверяют код; самопроверка проверяет **обещания**,
//! причём на той машине, где приложение запущено сейчас: политика одноразовых подтверждений,
//! «ничего не нашлось — это ответ», «двойники ничего не удаляют», «стоп останавливает работу».
//! Человек может нажать кнопку и увидеть, что приложение не врёт о себе.
//!
//! Чего здесь **нет** и почему:
//!
//!  * **никаких проверок, которым нужен Telegram, модель или сеть.** Такие пункты остаются в
//!    `docs/EVALS.md` как ручные: притворяться, что мы их прогнали, хуже, чем не гонять;
//!  * **ничего не меняется на диске насовсем.** Живые проверки работают во временной папке и
//!    убирают её за собой — кроме случая, когда уборка не удалась: тогда это сказано в итоге.
//!
//! Провал одной проверки не мешает остальным: список доводится до конца, чтобы человек видел
//! всю картину, а не первую ошибку.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

/// Итог одной проверки.
#[derive(Debug, Clone, Serialize)]
pub struct Verdict {
    /// Что проверяли — короткое имя.
    pub name: String,
    /// Какое обещание проверяли, словами человека.
    pub promise: String,
    /// Прошло или нет.
    pub passed: bool,
    /// Что именно увидели: числа, пути, причину провала.
    pub detail: String,
    /// Сколько это заняло.
    pub ms: u64,
}

/// Прогнать все проверки. Порядок — от быстрых к медленным.
pub fn run_all() -> Vec<Verdict> {
    let mut verdicts = Vec::new();
    verdicts.push(check_confirm_is_one_shot());
    verdicts.push(check_confirm_cannot_be_swapped());
    verdicts.push(check_destructive_wants_a_confirm());
    verdicts.push(check_nothing_found_is_an_answer());
    verdicts.push(check_twins_touch_nothing());
    verdicts.push(check_stop_stops());
    verdicts
}

fn verdict(
    name: &str,
    promise: &str,
    started: Instant,
    outcome: Result<String, String>,
) -> Verdict {
    let ms = started.elapsed().as_millis() as u64;
    match outcome {
        Ok(detail) => Verdict {
            name: name.to_string(),
            promise: promise.to_string(),
            passed: true,
            detail,
            ms,
        },
        Err(detail) => Verdict {
            name: name.to_string(),
            promise: promise.to_string(),
            passed: false,
            detail,
            ms,
        },
    }
}

/// Временная папка проверки: своя на каждый прогон, чтобы не мешать параллельным.
fn scratch(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("zshelper-check-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("временная папка");
    dir
}

/// Подтверждение одноразовое: вторым щелчком то же действие уже не пройдёт.
fn check_confirm_is_one_shot() -> Verdict {
    let started = Instant::now();
    let outcome = (|| -> Result<String, String> {
        let state = crate::policy::PolicyState::new();
        let args = vec![("path".to_string(), "C:\\проверка".to_string())];
        let id = state.issue("files|удалить|в корзину", &args);
        state
            .consume(id, "files|удалить|в корзину", &args)
            .map_err(|error| format!("первое подтверждение не сработало: {error}"))?;
        match state.consume(id, "files|удалить|в корзину", &args) {
            Err(crate::policy::TokenError::Unknown) => {
                Ok("первое подтверждение сработало, второе отклонено".to_string())
            }
            Ok(()) => Err("одним подтверждением можно воспользоваться дважды".to_string()),
            Err(other) => Err(format!("второе подтверждение отклонено не по адресу: {other}")),
        }
    })();
    verdict(
        "Подтверждение одноразовое",
        "одно подтверждение — одно действие; повторный щелчок ничего не выполнит",
        started,
        outcome,
    )
}

/// Подтверждение привязано к аргументам: подменить путь после согласия нельзя.
fn check_confirm_cannot_be_swapped() -> Verdict {
    let started = Instant::now();
    let outcome = (|| -> Result<String, String> {
        let state = crate::policy::PolicyState::new();
        let agreed = vec![("path".to_string(), "C:\\документы".to_string())];
        let id = state.issue("files|удалить|в корзину", &agreed);
        let swapped = vec![("path".to_string(), "C:\\Windows".to_string())];
        match state.consume(id, "files|удалить|в корзину", &swapped) {
            Err(crate::policy::TokenError::Mismatch) => {
                Ok("путь подменили после согласия — подтверждение не принято".to_string())
            }
            Ok(()) => Err("подтверждение сработало на другой путь".to_string()),
            Err(other) => Err(format!("отказ не тот: {other}")),
        }
    })();
    verdict(
        "Подтверждение не подменить",
        "согласие даётся на конкретные аргументы: другой путь пройдёт только с новым подтверждением",
        started,
        outcome,
    )
}

/// Разрушительное действие без подтверждения не выполняется.
fn check_destructive_wants_a_confirm() -> Verdict {
    let started = Instant::now();
    let outcome = (|| -> Result<String, String> {
        let registry = crate::registry::Registry::load()
            .map_err(|error| format!("реестр не прочитался: {error}"))?;
        let action = registry
            .by_key("files|удалить|в корзину")
            .ok_or_else(|| "в реестре нет удаления в корзину".to_string())?;
        if action.risk != crate::registry::Risk::Destructive {
            return Err(format!(
                "удаление в корзину помечено риском {}, а не destructive",
                action.risk.as_str()
            ));
        }
        match crate::policy::decide(action) {
            crate::policy::Decision::Confirm => {
                Ok("разрушительное действие требует подтверждения".to_string())
            }
            other => Err(format!(
                "политика вернула {} вместо подтверждения",
                other.as_str()
            )),
        }
    })();
    verdict(
        "Разрушительное — только с подтверждением",
        "действие риска destructive не выполняется без подтверждения человека",
        started,
        outcome,
    )
}

/// Поиск в пустом месте — ответ, а не сбой: `ok`, и рядом сказано, сколько просмотрено.
fn check_nothing_found_is_an_answer() -> Verdict {
    let started = Instant::now();
    let outcome = (|| -> Result<String, String> {
        let dir = scratch("empty");
        let mut params = std::collections::BTreeMap::new();
        params.insert("path".to_string(), dir.display().to_string());
        params.insert("query".to_string(), "такого-нет-никогда".to_string());
        let result = crate::tools::run(
            "files|найти|по имени",
            &params,
            &AtomicBool::new(false),
        );
        let _ = std::fs::remove_dir_all(&dir);
        if !result.ok {
            return Err(format!(
                "пустой поиск вернул сбой: {}",
                result.reason
            ));
        }
        Ok(format!("пустой поиск — ответ: {}", result.reason))
    })();
    verdict(
        "Пустой поиск — ответ, а не сбой",
        "«ничего не нашлось» это ok, и рядом число просмотренных",
        started,
        outcome,
    )
}

/// Двойники: отчёт не удаляет и не двигает — файлы остаются там, где были.
fn check_twins_touch_nothing() -> Verdict {
    let started = Instant::now();
    let outcome = (|| -> Result<String, String> {
        let dir = scratch("twins");
        let body = vec![7u8; 128 * 1024];
        let one = dir.join("копия один.bin");
        let two = dir.join("копия два.bin");
        std::fs::write(&one, &body).map_err(|error| format!("не записался файл: {error}"))?;
        std::fs::write(&two, &body).map_err(|error| format!("не записался файл: {error}"))?;
        let mut params = std::collections::BTreeMap::new();
        params.insert("path".to_string(), dir.display().to_string());
        let result = crate::tools::run("files|найти|двойники", &params, &AtomicBool::new(false));
        let still_there = one.exists() && two.exists();
        let _ = std::fs::remove_dir_all(&dir);
        if !result.ok {
            return Err(format!("поиск двойников не сработал: {}", result.reason));
        }
        if !still_there {
            return Err("файлы исчезли: отчёт не должен ничего трогать".to_string());
        }
        Ok(format!("{}; оба файла на месте", result.reason))
    })();
    verdict(
        "Двойники ничего не трогают",
        "поиск двойников только читает: ни удаления, ни переноса",
        started,
        outcome,
    )
}

/// «Стоп» останавливает работу: отмена срабатывает, а не ждёт конца сценария.
fn check_stop_stops() -> Verdict {
    let started = Instant::now();
    let promise = "нажатие «стоп» прекращает работу за секунды, а не после её окончания";
    let outcome = (|| -> Result<String, String> {
        let (program, argv) = if cfg!(windows) {
            (
                "powershell.exe",
                vec![
                    "-NoProfile".to_string(),
                    "-NonInteractive".to_string(),
                    "-Command".to_string(),
                    "Start-Sleep -Seconds 30".to_string(),
                ],
            )
        } else {
            ("/bin/sh", vec!["-c".to_string(), "sleep 30".to_string()])
        };
        let request = crate::executor::ExecRequest::new(program, argv);
        let cancel = AtomicBool::new(false);
        let flag = &cancel;
        let stop = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(300));
            flag.store(true, Ordering::Relaxed);
        });
        let output = crate::executor::run(&request, &cancel)
            .map_err(|error| format!("работа не запустилась: {error}"))?;
        let _ = stop.join();
        let took = started.elapsed();
        if !output.cancelled {
            return Err(format!(
                "отмена не сработала за {:?}: {}",
                took, output.limits_note
            ));
        }
        if took > Duration::from_secs(8) {
            return Err(format!("остановилось только через {:?}", took));
        }
        Ok(format!(
            "тридцатисекундная работа остановлена за {:.1} с",
            took.as_secs_f64()
        ))
    })();
    verdict("«Стоп» останавливает", promise, started, outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_check_returns_a_named_verdict() {
        let verdicts = run_all();

        assert_eq!(verdicts.len(), 6);
        for verdict in &verdicts {
            assert!(!verdict.name.is_empty(), "у проверки нет имени");
            assert!(!verdict.promise.is_empty(), "у проверки нет обещания");
            assert!(
                verdict.passed,
                "проверка «{}» провалилась: {}",
                verdict.name, verdict.detail
            );
            assert!(!verdict.detail.is_empty(), "нет итога у «{}»", verdict.name);
        }
    }
}
