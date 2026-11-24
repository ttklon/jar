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

/// Минимальная версия Windows (шаг 238).
///
/// Десятая — не «вкус»: WebView2 на 7 и 8.1 не обновляется дальше Chromium 109,
/// а он уже не гарантирует то, на чём стоит экран «Голос». Проверка платформы в
/// JavaScript это знает (`MIN_WINDOWS_MAJOR`), а **нативная** — нет, и на 7 с
/// установленным WebView2 приложение уверенно запустится: «движок есть» ещё не
/// значит «система подходит».
pub const MIN_WINDOWS_MAJOR: u32 = 10;

/// Почему старая система — это отказ, а не «попробуем».
///
/// Тихий отказ на 7 выглядит как «приложение запустилось, но половина не
/// работает»: голос не поднимается, горячие клавиши не срабатывают. Человек
/// ищет причину в приложении, а причина — в системе.
pub const OLD_WINDOWS: &str = "Нужна Windows 10 или новее.\
\n\nНа Windows 7 и 8.1 приложение запускается, но голос и часть возможностей \n\
работать не будут: WebView2 там не обновляется дальше версии, которой для этого\n\
не хватает. Это не ошибка установки и не ваша вина — не та система.\n\n\
Windows 10 и 11 эта версия поддерживает полностью.";

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
        Present::No => {
            "WebView2: НЕ найден — окно не откроется, нужен Microsoft Edge WebView2 Runtime"
        }
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

    /// Старшая цифра версии Windows из реестра: `10.0` → 10, `6.1` → 6.
    ///
    /// Читается `CurrentMajorVersionNumber` (есть с Windows 10), а если его нет —
    /// `CurrentVersion`, где стоит `6.1` (Windows 7) и `6.3` (8.1). Две ветви, а
    /// не одна: до десятки первого ключа просто не существует, и проверять
    /// только его значило бы считать любую старую систему десяткой.
    pub fn windows_major() -> Option<u32> {
        let major = Command::new("reg")
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
                "/v",
                "CurrentMajorVersionNumber",
            ])
            .output()
            .ok()
            .filter(|out| out.status.success())
            .and_then(|out| parse_reg_dword(&String::from_utf8_lossy(&out.stdout)));
        if major.is_some() {
            return major;
        }
        Command::new("reg")
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
                "/v",
                "CurrentVersion",
            ])
            .output()
            .ok()
            .filter(|out| out.status.success())
            .and_then(|out| parse_reg_version(&String::from_utf8_lossy(&out.stdout)))
    }

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

/// `CurrentMajorVersionNumber` — DWORD: в выводе `reg` он шестнадцатеричный.
pub fn parse_reg_dword(output: &str) -> Option<u32> {
    for line in output.lines() {
        let lower = line.trim().to_ascii_lowercase();
        if !lower.contains("currentmajorversionnumber") {
            continue;
        }
        // Строка вида `CurrentMajorVersionNumber    REG_DWORD    0xa`.
        let value = line.split_whitespace().last()?;
        let hex = value.trim_start_matches("0x").trim_start_matches("0X");
        if let Ok(number) = u32::from_str_radix(hex, 16) {
            return Some(number);
        }
    }
    None
}

/// `CurrentVersion` — строка `6.1` / `6.3` / `10.0`. Берётся старшая цифра.
pub fn parse_reg_version(output: &str) -> Option<u32> {
    for line in output.lines() {
        let lower = line.trim().to_ascii_lowercase();
        if !lower.contains("currentversion") {
            continue;
        }
        let value = line.split_whitespace().last()?;
        let major = value.split('.').next()?;
        if let Ok(number) = major.parse::<u32>() {
            return Some(number);
        }
    }
    None
}

/// Подходит ли система. `None` — прочитать не удалось: это не отказ, а «не знаю».
pub fn supported(major: Option<u32>) -> bool {
    // Не прочитали — не отказываем: на урезанной системе реестр может молчать, а
    // приложение при этом работает. Отказ должен опираться на факт.
    match major {
        Some(value) => value >= MIN_WINDOWS_MAJOR,
        None => true,
    }
}

pub use probe::check;
#[cfg(windows)]
pub use probe::windows_major;

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
    fn a_windows_10_dword_is_read_as_ten() {
        // Вывод `reg query` для DWORD — шестнадцатеричный.
        let output = "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\r\n    CurrentMajorVersionNumber    REG_DWORD    0xa\r\n";
        assert_eq!(parse_reg_dword(output), Some(10));
    }

    #[test]
    fn an_old_system_is_read_from_current_version() {
        // На 7 и 8.1 ключа `CurrentMajorVersionNumber` нет вовсе — только `6.1`/`6.3`.
        let win7 = "    CurrentVersion    REG_SZ    6.1";
        let win81 = "    CurrentVersion    REG_SZ    6.3";
        let win10 = "    CurrentVersion    REG_SZ    10.0";
        assert_eq!(parse_reg_version(win7), Some(6));
        assert_eq!(parse_reg_version(win81), Some(6));
        assert_eq!(parse_reg_version(win10), Some(10));
    }

    #[test]
    fn only_windows_below_ten_is_refused() {
        assert!(!supported(Some(6)));
        assert!(supported(Some(10)));
        assert!(supported(Some(11)));
    }

    #[test]
    fn an_unreadable_registry_does_not_refuse() {
        // Отказ должен опираться на факт: на урезанной системе реестр молчит, а
        // приложение при этом работает.
        assert!(supported(None));
    }

    #[test]
    fn the_old_system_text_names_the_versions_and_the_reason() {
        assert!(OLD_WINDOWS.contains("Windows 10"));
        assert!(OLD_WINDOWS.contains("7"));
        assert!(OLD_WINDOWS.contains("8.1"));
        // «Не ваша вина» — чтобы человек не искал причину в себе.
        assert!(OLD_WINDOWS.contains("не ваша вина"));
    }

    #[test]
    fn every_state_is_named_in_words() {
        // Ни одно состояние не остаётся без строки: молчание читается как «всё хорошо».
        for state in [Present::Yes, Present::No, Present::Unknown] {
            assert!(describe(state).contains("WebView2"));
        }
    }
}
