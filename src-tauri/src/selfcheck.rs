//! Проверка из командной строки: `zshelper.exe --self-check`.
//!
//! Зачем: приёмочный прогон на настоящей Windows должен доказать, что
//! установленная программа запускается и делает простое безопасное действие.
//! Через окно этого не увидеть — окно одинаково выглядит при успехе и при белом
//! экране. Поэтому есть отдельный режим: печатает строки, возвращает код.
//!
//! Что он делает и чего не делает:
//!
//!  * **делает только безопасное.** Чистое чтение и одна запись в свою временную
//!    папку, которая тут же убирается. Ни реестра, ни чужих файлов, ни сети —
//!    иначе проверка сама стала бы риском;
//!  * **печатает то, что проверил, а не «ок».** Каждая строка — факт с числом:
//!    версия, реестр, память, папка данных. По такой строке видно, что именно
//!    сломалось, без чтения исходников;
//!  * **код возврата честный.** Ноль только если все проверки прошли; иначе
//!    единица, и CI не примет это за успех.
//!
//! Режим не открывает окно и не запускает движок: приёмка не должна ничего
//! оставлять после себя.

/// Хотят ли запустившие программу режим проверки.
pub fn wants(args: impl Iterator<Item = String>) -> bool {
    args.into_iter().any(|arg| arg == "--self-check")
}

/// Выполнить проверки. Возвращает код возврата для процесса.
pub fn run() -> i32 {
    let mut failed = 0;
    failed += report("версия", || Ok(env!("CARGO_PKG_VERSION").to_string()));
    failed += report("реестр", registry_check);
    failed += report("папка данных", data_dir_check);
    failed += report("память", memory_check);
    failed += report("автозапуск", autostart_check);

    if failed == 0 {
        println!("SELF-CHECK: ok");
        0
    } else {
        println!("SELF-CHECK: {failed} проверок не прошло");
        1
    }
}

/// Одна проверка: печатает `ИМЯ: значение` или `ИМЯ: ОШИБКА — почему`.
fn report(name: &str, body: impl FnOnce() -> Result<String, String>) -> i32 {
    match body() {
        Ok(value) => {
            println!("{name}: {value}");
            0
        }
        Err(reason) => {
            println!("{name}: ОШИБКА — {reason}");
            1
        }
    }
}

fn registry_check() -> Result<String, String> {
    let registry = crate::registry::Registry::load()?;
    Ok(format!(
        "{} действий, {} доменов",
        registry.len(),
        registry.stats().domains
    ))
}

/// Папка данных: её можно создать и записать в неё. Это и есть «приложение
/// может работать без прав администратора» — в самом простом виде.
fn data_dir_check() -> Result<String, String> {
    let base = crate::logging::ensure_app_dir()
        .ok_or_else(|| "папка приложения недоступна".to_string())?;
    let probe = base.join("self-check.txt");
    std::fs::write(&probe, "проверка записи")
        .map_err(|error| format!("запись не удалась: {error}"))?;
    let read = std::fs::read_to_string(&probe)
        .map_err(|error| format!("чтение не удалось: {error}"))?;
    let _ = std::fs::remove_file(&probe);
    if read != "проверка записи" {
        return Err("прочиталось не то, что записано".to_string());
    }
    Ok(base.display().to_string())
}

fn memory_check() -> Result<String, String> {
    let base = crate::logging::ensure_app_dir()
        .ok_or_else(|| "папка приложения недоступна".to_string())?;
    let memory = crate::memory::Memory::open(base.join("self-check.db"))
        .map_err(|error| format!("база не открылась: {error}"))?;
    let result = memory
        .recent_runs(1)
        .map(|runs| format!("открылась, последних запусков видно: {}", runs.len()))
        .map_err(|error| format!("запрос не выполнился: {error}"));
    // Проверочная база не должна остаться: иначе каждый запуск приёмки плодит файлы.
    drop(memory);
    let _ = std::fs::remove_file(base.join("self-check.db"));
    result
}

fn autostart_check() -> Result<String, String> {
    let target = std::env::current_exe()
        .map(|path| path.display().to_string())
        .map_err(|error| format!("путь программы не определился: {error}"))?;
    let status = crate::autostart::status(
        crate::autostart::reg(&crate::autostart::query_args()),
        &target,
    );
    let value = if status.enabled {
        format!("включён: {}", status.command.unwrap_or_default())
    } else {
        "выключен".to_string()
    };
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::wants;

    #[test]
    fn the_check_mode_is_opted_into_explicitly() {
        // Без флага приложение обязано запускаться как обычно: режим проверки
        // не должен включаться случайно.
        assert!(!wants(std::iter::empty()));
        assert!(!wants(["start"].map(String::from).into_iter()));
        assert!(wants(["--self-check"].map(String::from).into_iter()));
        assert!(wants(["x", "--self-check"].map(String::from).into_iter()));
    }
}
