//! Проверка WebView2 **до** первого окна (шаг 225).
//!
//! Почему это в Rust, а не в проверке платформы на JavaScript. Вся проверка
//! `platform.ts` — тоже полезная, но она живёт **внутри** WebView2: если движка
//! нет, её код не запустится ни разу. Человек при этом видит то, что описано в
//! шаге: окно не открывается вообще либо открывается белым — то есть ни причины,
//! ни действия. Самый частый сбой установки остаётся без объяснения.
//!
//! Поэтому проверка здесь, до `tauri::Builder`: смотрим, зарегистрирован ли
//! `WebView2 Runtime` в реестре Windows. Есть — запускаемся как обычно. Нет —
//! показываем **окно с инструкцией** (обычный MessageBox, он не зависит от
//! WebView2) и выходим с кодом 2, чтобы установщик и CI отличали это от
//! «упало непонятно».
//!
//! Чего модуль не делает: не ставит WebView2 сам. Молчаливая установка
//! чужого runtime — не наше дело, а «нажмите и я что-нибудь поставлю» ломает
//! доверие хуже отказа.

/// Ключи реестра, по которым Windows хранит WebView2 Runtime.
///
/// Их два, и это не дублирование: 32-битный установщик пишет в `WOW6432Node`,
/// 64-битный — в обычный `SOFTWARE`. Проверять только один значит объявить
/// «нет WebView2» на машине, где он есть, — и это хуже, чем не проверять вовсе.
pub const REGISTRY_KEYS: [&str; 2] = [
    r"HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    r"HKLM\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
];

/// Что сказать человеку. Текст без «ошибка 0x…»: причина и действие.
pub const INSTRUCTION: &str = "Для работы приложения нужен Microsoft Edge WebView2 Runtime — \
он не найден на этом компьютере.\n\n\
Что сделать: скачать «Evergreen Bootstrapper» со страницы \
https://developer.microsoft.com/microsoft-edge/webview2/ и запустить его. \
Нужны права администратора; установка занимает минуту и не требует перезагрузки.\n\n\
После установки запустите приложение снова.";

/// Итог проверки. Отдельный тип, а не `bool`: «не смог прочитать реестр» — это
/// не «WebView2 нет», и путать их значит отправлять человека ставить то, что у
/// него уже стоит.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Present {
    /// Ключ найден — запускаемся.
    Yes,
    /// Ключа нет ни в одной из двух ветвей.
    No,
    /// Реестр прочитать не удалось (не Windows, отказ доступа).
    Unknown,
}

/// Строка, которую печатает `--self-check`: проверка видна и без окна.
pub fn describe(state: Present) -> &'static str {
    match state {
        Present::Yes => "WebView2: найден",
        Present::No => "WebView2: НЕ найден — окно не откроется, нужен Microsoft Edge WebView2 Runtime",
        Present::Unknown => "WebView2: проверить не удалось (не Windows или нет доступа к реестру)",
    }
}

/// Продолжать ли запуск. `No` — единственный случай, когда показываем окно с
/// инструкцией; `Unknown` не повод отказывать: на машине, где реестр не читается
/// (например, под ограниченной учётной записью), приложение обычно работает.
pub fn should_stop(state: Present) -> bool {
    matches!(state, Present::No)
}

#[cfg(windows)]
mod probe {
    use super::Present;
    use std::process::Command;

    /// Прочитать наличие ключа через `reg query`: без лишних зависимостей, и то
    /// же самое делает установщик в CI.
    pub fn check() -> Present {
        for key in super::REGISTRY_KEYS {
            let output = Command::new("reg").args(["query", key]).output();
            match output {
                Ok(out) if out.status.success() => return Present::Yes,
                // Ключа нет — это ответ, а не ошибка: пробуем следующую ветвь.
                Ok(_) => continue,
                // `reg` не запустился вовсе: реестр прочитать нельзя.
                Err(_) => return Present::Unknown,
            }
        }
        Present::No
    }
}

#[cfg(not(windows))]
mod probe {
    use super::Present;

    pub fn check() -> Present {
        // На других системах проверять нечего: приложение рассчитано на Windows,
        // и это скажет проверка платформы. Здесь — честное «не знаю».
        Present::Unknown
    }
}

pub use probe::check;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn both_registry_branches_are_checked() {
        // Одна ветвь — ложное «нет WebView2» на половине машин.
        assert_eq!(REGISTRY_KEYS.len(), 2);
        assert!(REGISTRY_KEYS[0].contains("WOW6432Node"));
        assert!(REGISTRY_KEYS[1].contains(r"SOFTWARE\Microsoft"));
    }

    #[test]
    fn only_a_missing_runtime_stops_the_launch() {
        // «Не смог прочитать» — не повод отказывать: иначе приложение не
        // запустится там, где всё в порядке, только реестр закрыт.
        assert!(should_stop(Present::No));
        assert!(!should_stop(Present::Yes));
        assert!(!should_stop(Present::Unknown));
    }

    #[test]
    fn the_instruction_names_the_action_and_the_address() {
        // Отказ без действия — это ещё один отказ текстом.
        assert!(INSTRUCTION.contains("https://"));
        assert!(INSTRUCTION.contains("Bootstrapper"));
        assert!(INSTRUCTION.contains("права администратора"));
        // И не пугает кодом ошибки, который человеку некуда деть.
        assert!(!INSTRUCTION.contains("0x"));
    }

    #[test]
    fn every_state_is_named_in_words() {
        // Ни одно состояние не остаётся без строки: молчание читается как «всё хорошо».
        for state in [Present::Yes, Present::No, Present::Unknown] {
            assert!(describe(state).contains("WebView2"));
        }
    }
}
