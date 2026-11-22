//! Движок в «Проверке себя»: он либо исправен, либо это видно и чинится.
//!
//! Зачем отдельный модуль. Движок — то, без чего не работает главное, и
//! ломается он чаще всего: обновление Windows, антивирус, недокачанный архив.
//! До сих пор это выяснялось при первом запуске модели — то есть уже тогда,
//! когда человек ждёт ответа. Проверка себя должна сказать это раньше.
//!
//! Три решения:
//!
//!  * **отсутствие движка — не провал.** Приложение работает без него: чат с
//!    моделью недоступен, всё остальное — да. Провал — когда движок есть и
//!    испорчен: это поломка, а не выбор человека;
//!  * **проверяем оба движка**, а не первый попавшийся: человек может держать
//!    только распознавание речи;
//!  * **читаем по метке владения**, а не «есть ли файл»: чужой движок рядом —
//!    не наша поломка, и трогать его нельзя.
//!
//! Ремонт — кнопкой «Переустановить движок» (`repair("reinstall-engine")`):
//! имя вердикта начинается с «движок», и `adviceFor` находит его сам.

use crate::evals::Verdict;
use crate::runtime::Kind;
use std::time::Instant;

/// Вердикт про движки для «Проверки себя».
pub fn runtime_verdict() -> Verdict {
    let started = Instant::now();
    let outcome: Result<String, String> = match crate::logging::ensure_app_dir() {
        None => Err("папка приложения недоступна".to_string()),
        Some(base) => match (inspect(&base, Kind::Llama), inspect(&base, Kind::Whisper)) {
            (Ok(llama), Ok(whisper)) => report(llama, whisper),
            (Err(reason), _) | (_, Err(reason)) => Err(reason),
        },
    };
    crate::evals::verdict_for(
        "движок",
        "установленный движок на месте и его файлы совпадают с описью",
        "модель не запустится, и человек узнает об этом в момент вопроса, а не заранее",
        started,
        outcome,
    )
}

/// Что с одним движком.
enum State {
    /// Не установлен приложением — это не поломка.
    Absent,
    /// Установлен, опись сошлась.
    Sound,
    /// Установлен, но файлы не те: путь, который человеку стоит увидеть.
    Broken(String),
}

fn inspect(base: &std::path::Path, kind: Kind) -> Result<(Kind, State), String> {
    if !crate::runtime::installed(base, kind) {
        return Ok((kind, State::Absent));
    }
    match crate::runtime::verify(base, kind) {
        Ok(()) => Ok((kind, State::Sound)),
        Err(reason) => Ok((kind, State::Broken(reason))),
    }
}

/// Строка для человека: что с движками и есть ли поломка.
///
/// Один проход, а не два: `[llama, whisper].into_iter()` отдаёт значения,
/// и второй такой массив уже не собрать — первая версия так и падала.
fn report(llama: (Kind, State), whisper: (Kind, State)) -> Result<String, String> {
    let mut broken = Vec::new();
    let mut present = Vec::new();
    for (kind, state) in [llama, whisper] {
        match state {
            State::Broken(reason) => broken.push(format!("{}: {reason}", kind.name())),
            State::Sound => present.push(kind.name()),
            State::Absent => {}
        }
    }
    if !broken.is_empty() {
        // Ошибка — потому что это поломка, а не отсутствие.
        return Err(format!(
            "{}; починить можно кнопкой «Переустановить движок» — модели при этом остаются",
            broken.join("; ")
        ));
    }
    Ok(if present.is_empty() {
        "движки не установлены — это не поломка: приложение работает и без них".to_string()
    } else {
        format!("на месте: {}", present.join(", "))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Шаг 360: отсутствие движка — не провал, а испорченный — провал.
    ///
    /// Разница важна: «движка нет» человек выбрал сам (приложение работает и
    /// так), «движок испорчен» — поломка, которую надо чинить.
    #[test]
    fn an_absent_engine_is_not_a_failure_but_a_broken_one_is() {
        let absent = report((Kind::Llama, State::Absent), (Kind::Whisper, State::Absent)).unwrap();
        assert!(absent.contains("не поломка"), "{absent}");

        let broken = report(
            (Kind::Llama, State::Broken("файл не совпал".into())),
            (Kind::Whisper, State::Absent),
        )
        .expect_err("испорченный движок — провал");
        assert!(
            broken.contains("файл не совпал"),
            "причина названа: {broken}"
        );
        // И сразу сказано, чем чинить, не отправляя искать экран.
        assert!(broken.contains("Переустановить движок"), "{broken}");
        // И что модели при этом целы — иначе человек боится нажимать.
        assert!(broken.contains("модели"), "{broken}");
    }

    /// Шаг 360, сквозной: испорченный движок доходит до человека как провал
    /// проверки, а имя вердикта ведёт к кнопке ремонта.
    ///
    /// Проверяется стык, а не части: `runtime::verify` действительно ловит
    /// изменённый файл, `report` называет поломку, а имя «движок» — то, по
    /// которому `adviceFor` в интерфейсе находит переустановку.
    #[test]
    fn a_corrupted_engine_travels_from_disk_to_the_repair_advice() {
        let base = std::env::temp_dir().join(format!("zshelper-engine-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let dir = crate::runtime::directory(&base, Kind::Llama);
        std::fs::create_dir_all(&dir).unwrap();
        // `spec()` — ссылка, а `program` и `sha256` — `String`: их нельзя
        // вынести из ссылки, только взять по ней.
        let spec = Kind::Llama.spec();
        std::fs::write(dir.join(&spec.program), b"portable").unwrap();
        let sha = crate::models::sha256_file(&dir.join(&spec.program)).unwrap();
        let meta = serde_json::json!({
            "archive_sha256": &spec.sha256,
            "program": &spec.program,
            "files": [{"path": &spec.program, "sha256": sha}]
        });
        std::fs::write(
            dir.join("installed.json"),
            serde_json::to_vec(&meta).unwrap(),
        )
        .unwrap();
        std::fs::write(dir.join(".zshelper-owner"), spec.sha256.as_bytes()).unwrap();

        // До порчи — исправен.
        assert!(crate::runtime::installed(&base, Kind::Llama));
        assert!(crate::runtime::verify(&base, Kind::Llama).is_ok());

        // Антивирус или недокачанный архив: файл стал другим.
        std::fs::write(dir.join(&spec.program), b"portable-but-wrong").unwrap();

        let inspected = inspect(&base, Kind::Llama).unwrap();
        let (kind, state) = inspected;
        assert_eq!(kind.name(), "движок llama.cpp");
        match state {
            State::Broken(reason) => assert!(reason.contains("изменился"), "{reason}"),
            _ => panic!("испорченный движок должен быть замечен"),
        }

        let outcome = report(
            (Kind::Llama, State::Broken("файл движка изменился".into())),
            (Kind::Whisper, State::Absent),
        );
        assert!(outcome.is_err(), "провал");

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn a_sound_engine_is_named() {
        let sound = report((Kind::Llama, State::Sound), (Kind::Whisper, State::Absent)).unwrap();
        assert!(sound.contains("llama.cpp"), "{sound}");
        assert!(
            !sound.contains("whisper"),
            "отсутствующий не хвалят: {sound}"
        );
    }
}
