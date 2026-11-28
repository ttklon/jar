//! Глобальная горячая клавиша: `Ctrl+Alt+Space` показывает и скрывает окно.
//!
//! Почему не `Ctrl+Alt+Z`, как было. Правило `hotkeyFree.byDefault()` говорит
//! «Ctrl+Alt+Space» — и подсказка в настройках, и то, что человек видит в
//! документации, взято из правила. Пока Rust ставил `Ctrl+Alt+Z`, настройка
//! показывала одно сочетание, а работало другое, и узнавалось это молча.
//! Два модификатора нужны, чтобы сочетание не нажималось случайно; `Space`
//! выбран правилом, потому что он не занят ничем привычным.
//!
//! Зачем глобальная, а не оконная: ассистент живёт в фоне, окна может не быть на
//! экране — клавиша должна работать из любой программы. Поэтому плагин, а не
//! обработчик `keydown` в webview: последний работает, только когда окно в фокусе.
//!
//! Клавиша не выполняет действий сама: она только показывает окно. Всё опасное
//! по-прежнему требует подтверждения в интерфейсе — горячая клавиша не может
//! подтвердить ничего за человека.
//!
//! Вторая клавиша — `Ctrl+Space`: удержание для разговора из **любой** программы.
//! Человек смотрит видео или пишет в чужом окне; переключаться на помощника он не хочет.
//! Поэтому удержание приходит из системы двумя событиями — нажал и отпустил, — окно
//! остаётся свёрнутым, а состояние голосовой клавиши показывается в подсказке трея.
//! Сама клавиша ничего не подтверждает и ничего не выполняет.

use std::str::FromStr;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Акселератор в том виде, в каком он написан в документации и подсказке в UI.
pub const ACCELERATOR: &str = "Ctrl+Alt+Space";

/// Что нажимает человек — для подсказок в интерфейсе.
pub const LABEL: &str = "Ctrl+Alt+Space";

/// Удержание для разговора из любой программы.
pub const TALK_ACCELERATOR: &str = "Ctrl+Space";

/// Подпись для интерфейса.
pub const TALK_LABEL: &str = "Ctrl+Space";

/// Имя события для интерфейса: то же, что `GLOBAL_TALK_EVENT` в `src/lib/globalTalk.ts`.
pub const TALK_EVENT: &str = "voice://hold";

/// Удержание из любой программы.
pub fn talk_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL), Code::Space)
}

pub fn shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space)
}

/// Акселератор, который действует сейчас: по умолчанию — `ACCELERATOR`, после
/// назначения человеком — сохранённый. Хранится один на приложение, чтобы
/// обработчик и экран отвечали про одну и ту же клавишу.
static ACTIVE: Mutex<Option<String>> = Mutex::new(None);

/// Что нажал человек — в форме, которую разбирает плагин.
///
/// `spec` приходит из правила `hotkeyFree.format`: `ctrl+alt+space`, с модификаторами
/// в одном порядке. Здесь она превращается в `Ctrl+Alt+KeySpace` — тот вид, который
/// принимает `Shortcut::from_str`. Порядок модификаторов задан правилом, поэтому
/// разбор детерминирован, а не «как получилось».
pub fn accelerator_of(spec: &str) -> Option<String> {
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut win = false;
    let mut key = None;
    for part in spec
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => ctrl = true,
            "alt" => alt = true,
            "shift" => shift = true,
            "win" | "super" | "meta" => win = true,
            other => key = Some(other.to_string()),
        }
    }
    let key = key?;
    // Порядок модификаторов — **тот же, что у правила** (`hotkeyFree.format`):
    // ctrl, alt, shift, win. Иначе `shift+ctrl+k` и `ctrl+shift+k` дали бы разные
    // акселераторы, и сравнение с действующей клавишей не сработало бы: человек
    // назначил бы клавишу, а обработчик её не узнал.
    let mods: Vec<&str> = [
        (ctrl, "Ctrl"),
        (alt, "Alt"),
        (shift, "Shift"),
        (win, "Super"),
    ]
    .into_iter()
    .filter_map(|(on, name)| if on { Some(name) } else { None })
    .collect();
    // Одна буква без модификатора правило не пропускает, и здесь тоже: сочетание
    // из одной клавиши срабатывало бы при наборе текста.
    if mods.is_empty() {
        return None;
    }
    let code = match key.as_str() {
        "space" => "Space".to_string(),
        single if single.chars().count() == 1 => format!("Key{}", single.to_uppercase()),
        named => named.to_string(),
    };
    Some(format!("{}+{code}", mods.join("+")))
}

/// Обратно: акселератор плагина → форма правила (`ctrl+alt+space`).
///
/// Нужно, чтобы экран показывал то же, что сравнивает правило: `KeySpace` — это
/// подробность плагина, а не то, что человек видит.
pub fn spec_of(accelerator: &str) -> String {
    accelerator
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(|part| {
            let lower = part.to_ascii_lowercase();
            match lower.as_str() {
                "control" => "ctrl".to_string(),
                "super" | "win" => "win".to_string(),
                _ => lower.strip_prefix("key").unwrap_or(&lower).to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

/// Где лежит выбранная клавиша.
///
/// Рядом с логами и журналом, в `%LOCALAPPDATA%\ZShelper`. Не в папке программы:
/// её переустанавливают, а выбор человека — это его данные.
pub fn settings_file() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("ZShelper").join("hotkey.txt")
}

/// Что видит человек в настройках и что показывает экран после назначения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HotkeyView {
    /// Что действует сейчас — в форме правила (`ctrl+alt+space`).
    pub spec: String,
    /// Оно же словами человека (`Ctrl+Alt+Space`).
    pub shown: String,
    /// Удалось ли проверить занятость. `false` — не «свободна», а «не знаю».
    pub known: bool,
    /// Почему проверка недоступна. Пусто — проверка была.
    pub why: String,
}

/// Прочитать сохранённую клавишу.
///
/// Битый или чужой файл не чинится и не мешает: он просто не считается выбором,
/// и действует клавиша по умолчанию. Это лучше, чем «приложение не запустилось
/// из-за одной строки».
pub fn saved() -> Option<String> {
    let text = std::fs::read_to_string(settings_file()).ok()?;
    let spec = text.trim().to_ascii_lowercase();
    let accelerator = accelerator_of(&spec)?;
    Shortcut::from_str(&accelerator).ok()?;
    Some(spec)
}

/// Запомнить выбор. Ошибка записи — ошибка, а не «наверное, сохранилось».
pub fn save(spec: &str) -> Result<(), String> {
    let accelerator = accelerator_of(spec)
        .ok_or_else(|| "сочетание не разобрать: нужны модификатор и клавиша".to_string())?;
    Shortcut::from_str(&accelerator)
        .map_err(|_| format!("{spec}: Windows такое сочетание не принимает"))?;
    let file = settings_file();
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|error| format!("папка настроек: {error}"))?;
    }
    std::fs::write(&file, format!("{spec}\n"))
        .map_err(|error| format!("запись настройки: {error}"))?;
    // Доказательство — чтение обратно: «файл записался без ошибки» не значит, что
    // в нём лежит то, что нужно. Так же сделано для базы знаний и памяти.
    let back =
        std::fs::read_to_string(&file).map_err(|error| format!("чтение обратно: {error}"))?;
    if back.trim() != spec {
        return Err("в файле оказалось не то, что записали: назначение не сохранено".to_string());
    }
    Ok(())
}

/// Действующая клавиша в форме правила.
pub fn active_spec() -> String {
    if let Ok(guard) = ACTIVE.lock() {
        if let Some(spec) = guard.as_ref() {
            return spec.clone();
        }
    }
    saved().unwrap_or_else(|| spec_of(ACCELERATOR))
}

/// Показать человеку, что действует.
pub fn view(known: bool, why: &str) -> HotkeyView {
    let spec = active_spec();
    HotkeyView {
        shown: label(&spec),
        spec,
        known,
        why: why.to_string(),
    }
}

/// Подпись для человека: `ctrl+alt+space` → `Ctrl+Alt+Space`.
pub fn label(spec: &str) -> String {
    spec.split('+')
        .map(|part| match part {
            "ctrl" => "Ctrl".to_string(),
            "alt" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            "win" => "Win".to_string(),
            "space" => "Space".to_string(),
            other => other.to_uppercase(),
        })
        .collect::<Vec<_>>()
        .join("+")
}

/// Поставить новую клавишу на место прежней.
///
/// Порядок важен и он именно такой: **сначала проверить, потом снять прежнюю**.
/// Если снять прежнюю и не поставить новую, человек остаётся без клавиши и без
/// объяснения — ровно тот дефект, который исключает `hotkeySaved`.
///
/// Возвращается либо «сохранено и работает», либо причина, и прежняя клавиша
/// по-прежнему действует.
pub fn apply(app: &AppHandle, spec: &str) -> Result<HotkeyView, String> {
    let next = accelerator_of(spec)
        .ok_or_else(|| "сочетание не разобрать: нужны модификатор и клавиша".to_string())?;
    let next_shortcut = Shortcut::from_str(&next)
        .map_err(|_| format!("{spec}: Windows такое сочетание не принимает"))?;
    let current = active_spec();
    let current_shortcut =
        accelerator_of(&current).and_then(|accel| Shortcut::from_str(&accel).ok());

    if current_shortcut.as_ref() == Some(&next_shortcut) {
        return Ok(view(true, ""));
    }

    // Проба: регистрация новой клавиши **до** снятия прежней. Если она занята
    // другой программой, Windows откажет — и прежняя останется работать.
    let shortcuts = app.global_shortcut();
    if let Err(error) = shortcuts.register(next_shortcut) {
        return Err(format!(
            "{next}: Windows не отдаёт это сочетание — занято другой программой ({error}). Прежняя клавиша осталась: {}",
            label(&current)
        ));
    }

    // Новая зарегистрирована. Теперь её надо запомнить — и только если запись
    // доказана чтением обратно, снимается прежняя.
    //
    // Если запись не удалась, новая снимается, а прежняя остаётся: иначе после
    // перезапуска человек получил бы умолчание вместо выбранной клавиши, то есть
    // ровно «сохранил, а не работает».
    if let Err(error) = save(spec) {
        let _ = shortcuts.unregister(next_shortcut);
        return Err(format!(
            "{error}. Прежняя клавиша осталась: {}",
            label(&current)
        ));
    }
    if let Some(old) = current_shortcut {
        let _ = shortcuts.unregister(old);
    }
    if let Ok(mut guard) = ACTIVE.lock() {
        *guard = Some(spec.to_string());
    }
    Ok(view(true, ""))
}

/// Показать окно из любого состояния: свёрнуто, скрыто, за другими окнами.
///
/// Три шага, и третий не лишний. На Windows `set_focus` **не поднимает** окно
/// поверх других, если оно уже было на экране: человек нажимает `Ctrl+Alt+Space` или
/// второй раз открывает программу, а окно остаётся за чужими — выглядит как
/// «приложение не отвечает». Поэтому окно ненадолго ставится поверх
/// (`set_always_on_top`), получает фокус и сразу возвращается в обычный режим:
/// постоянно поверх — это уже навязчивость, а на секунду — честное «вот я».
pub fn reveal_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(error) = window.show() {
        tracing::warn!(%error, "окно не показывается");
        return;
    }
    let _ = window.unminimize();
    // Порядок важен: поднять → сфокусировать → отпустить. Если отпустить раньше
    // фокуса, окно снова уйдёт под чужое.
    let _ = window.set_always_on_top(true);
    if let Err(error) = window.set_focus() {
        tracing::warn!(%error, "окно не получает фокус");
    }
    let _ = window.set_always_on_top(false);
}

/// Отправить интерфейсу «нажал» / «отпустил».
fn emit_talk(app: &AppHandle, state: &str) {
    if let Err(error) = app.emit(TALK_EVENT, state) {
        tracing::warn!(%error, state, "удержание не отправлено в интерфейс");
    }
}

/// Показать окно, если скрыто; скрыть, если оно на экране и в фокусе.
pub fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);

    if visible && focused {
        if let Err(error) = window.hide() {
            tracing::warn!(%error, "окно не скрывается");
        }
        return;
    }

    if let Err(error) = window.show() {
        tracing::warn!(%error, "окно не показывается");
        return;
    }
    let _ = window.unminimize();
    if let Err(error) = window.set_focus() {
        tracing::warn!(%error, "окно не получает фокус");
    }
}

/// Ставит плагин и обработчик. Ошибка регистрации не должна мешать запуску:
/// без клавиши приложение работает, окно открывается из трея.
pub fn install(app: &mut tauri::App) {
    let handle = app.handle().clone();
    // Состояние удержания — своё для каждой клавиши. Автоповтор Windows
    // присылает поток `Pressed`, и без карантина разговор начинается заново
    // десяток раз за одно удержание (шаг 460).
    let talk_hold = std::sync::Arc::new(crate::hold::Hold::default());
    let main_hold = std::sync::Arc::new(crate::hold::Hold::default());
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, pressed, event| {
            let active = accelerator_of(&active_spec())
                .and_then(|accel| Shortcut::from_str(&accel).ok())
                .unwrap_or_else(shortcut);
            // Сравнение с **действующей** клавишей, а не с константой: человек
            // назначает свою, и обработчик обязан знать про неё, иначе клавиша
            // «назначена», а окно не показывается.
            let down = event.state() == ShortcutState::Pressed;
            let now = crate::hold::now_ms();

            // Пауза — раньше всего остального: «не надо» значит не надо, и
            // клавиша возвращается игре и работе (шаг 441).
            if down && crate::paused_now(app) {
                tracing::debug!("пауза: горячие клавиши не работают");
                return;
            }

            // Полноэкранное приложение — повод не мешать: клавиша, открывающая
            // окно, выкидывает из игры посреди матча (шаги 444/455). Решение
            // принимается ДО перехвата: в обработчике уже поздно.
            if down && crate::fullscreen_now::fullscreen_now() {
                tracing::debug!("полноэкранное приложение: горячие клавиши не срабатывают");
                return;
            }

            if pressed == &active && main_hold.pressed(down, now) {
                toggle_main(&handle);
            }

            if pressed == &talk_shortcut() {
                // Разговор из любой программы: человек зажал клавишу — это
                // перебивание, и обещание «не дольше 200 мс» относится и сюда,
                // а не только к кнопке в окне (шаг 80). Отдаём событие в окно,
                // чтобы замер шёл там, где звук.
                let step = if down { "down" } else { "up" };
                if let Err(error) = handle.emit("barge://spoken", step) {
                    tracing::debug!(%error, "засечка перебивания не отправлена окну");
                }
                // Спрашиваем у карантина, а не у Windows: удержание — это один
                // нажим, а не поток нажатий.
                if talk_hold.pressed(down, now) {
                    crate::tray::set_voice_hold(&handle, true);
                    emit_talk(&handle, "down");
                }
                if !down {
                    crate::tray::set_voice_hold(&handle, false);
                    emit_talk(&handle, "up");
                }
            }
        })
        .build();

    if let Err(error) = app.handle().plugin(plugin) {
        tracing::warn!(%error, "плагин горячих клавиш не подключён");
        return;
    }

    match app.global_shortcut().register(talk_shortcut()) {
        Ok(()) => tracing::info!(
            accelerator = TALK_ACCELERATOR,
            "удержание для разговора зарегистрировано"
        ),
        Err(error) => tracing::warn!(
            %error,
            accelerator = TALK_ACCELERATOR,
            "удержание занято другой программой — разговор из чужих окон недоступен"
        ),
    }

    // Клавиша человека, а не только константа: сохранённую надо поставить на
    // место умолчания ещё до того, как человек откроет настройки.
    let wanted = active_spec();
    let wanted_accel = accelerator_of(&wanted).unwrap_or_else(|| ACCELERATOR.to_string());
    let wanted_shortcut = Shortcut::from_str(&wanted_accel).unwrap_or_else(|_| shortcut());
    match app.global_shortcut().register(wanted_shortcut) {
        Ok(()) => {
            // Действующая клавиша запоминается: обработчик сравнивает нажатие с
            // ней, и чтение файла на каждое нажатие было бы лишним.
            if let Ok(mut guard) = ACTIVE.lock() {
                *guard = Some(wanted);
            }
            tracing::info!(accelerator = %wanted_accel, "горячая клавиша зарегистрирована")
        }
        Err(error) => {
            tracing::warn!(%error, accelerator = %wanted_accel, "горячая клавиша занята");
            // Сохранённая не встала — возвращаемся к умолчанию, но **не молча**:
            // иначе человек видит в настройках одно, а работает другое.
            if wanted_accel != ACCELERATOR && app.global_shortcut().register(shortcut()).is_ok() {
                if let Ok(mut guard) = ACTIVE.lock() {
                    *guard = Some(spec_of(ACCELERATOR));
                }
                tracing::warn!("вернулся к клавише по умолчанию: сохранённая занята");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn the_talk_key_is_its_own_keyboard_combination() {
        let parsed = Shortcut::from_str(TALK_ACCELERATOR).expect("акселератор разбирается");
        assert_eq!(
            parsed,
            talk_shortcut(),
            "подсказка должна совпадать с клавишей"
        );
        assert_ne!(
            talk_shortcut(),
            shortcut(),
            "окно и разговор — разные клавиши, иначе одно съест другое"
        );
    }

    #[test]
    fn the_talk_event_name_matches_the_frontend() {
        assert_eq!(TALK_EVENT, "voice://hold");
    }

    #[test]
    fn a_spec_from_the_rule_becomes_an_accelerator_and_back() {
        // Форма правила — `ctrl+alt+space`; её показывает и экран, и сравнение.
        assert_eq!(
            accelerator_of("ctrl+alt+space").as_deref(),
            Some("Ctrl+Alt+Space")
        );
        assert_eq!(spec_of("Ctrl+Alt+Space"), "ctrl+alt+space");
        // Одна буква — `KeyK`, иначе Windows не поймёт акселератор.
        assert_eq!(
            accelerator_of("ctrl+shift+k").as_deref(),
            Some("Ctrl+Shift+KeyK")
        );
        assert_eq!(spec_of("Ctrl+Shift+KeyK"), "ctrl+shift+k");
        // Порядок модификаторов не зависит от того, как их набрали.
        assert_eq!(
            accelerator_of("shift+ctrl+k"),
            accelerator_of("ctrl+shift+k")
        );
    }

    #[test]
    fn a_combination_without_a_modifier_is_not_a_shortcut() {
        // Правило `hotkeyFree.check` не пропускает одну клавишу: она срабатывала
        // бы при наборе текста. Ядро обязано отказать по той же причине.
        assert_eq!(accelerator_of("k"), None);
        assert_eq!(accelerator_of(""), None);
        // И то, что Windows не разбирает, не становится «наверное, вот это».
        assert!(Shortcut::from_str("Ctrl+Alt+НетТакой").is_err());
    }

    #[test]
    fn a_changed_key_is_the_one_the_handler_compares() {
        // Настоящий дефект, который здесь закрыт: обработчик сравнивал нажатие с
        // константой, и назначенная человеком клавиша не показывала окно.
        let custom = accelerator_of("ctrl+shift+k").unwrap();
        let active = Shortcut::from_str(&custom).expect("назначенная клавиша разбирается");
        assert_ne!(
            active,
            shortcut(),
            "назначенная клавиша отличается от умолчания"
        );
        // Подпись для человека совпадает с тем, что настраивали: без `Key`.
        assert_eq!(label(&spec_of(&custom)), "Ctrl+Shift+K");
    }

    #[test]
    fn accelerator_matches_the_registered_shortcut() {
        let parsed = Shortcut::from_str(ACCELERATOR).expect("акселератор разбирается");
        assert_eq!(
            parsed,
            shortcut(),
            "подсказка в интерфейсе должна совпадать с реальной клавишей"
        );
    }
}
