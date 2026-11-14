//! Машина человека: сколько на ней можно делать и когда лучше не мешать.
//!
//! Зачем это нужно. Помощник должен уметь работать долго и много — но машина у человека
//! не бесконечная, и она ему ещё нужна. «Занял все ядра и съел память» — это не усердие,
//! это помеха. Поэтому прежде чем что-то запускать, помощник спрашивает машину: сколько
//! сейчас свободно, работает ли человек или ушёл.
//!
//! Здесь только измерение и решение. Ни одного запуска: модуль отвечает на вопрос «сколько
//! можно», а не «сделай». Решения принимаются по понятным правилам, и каждое правило
//! названо вслух — иначе «умное» распределение нельзя ни объяснить, ни проверить.
//!
//! Признаки, которые считаются:
//! * **простой ввода** — сколько секунд человек ничего не трогал (клавиатура, мышь). Это
//!   самый честный признак «он ушёл»: он не зависит от того, что запущено;
//! * **загрузка процессора** — по ней видно, занята машина кем-то ещё или нет;
//! * **свободная память** — по ней видно, можно ли брать ещё работу.
//!
//! Чего модуль не делает: не выгружает чужие программы, не меняет приоритеты и не решает
//! за человека, когда ему освободиться. Он только советует сам себе, сколько взять.

use serde::Serialize;

/// Что удалось измерить. Цифры — как есть, без «примерно».
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Sample {
    /// Загрузка процессора в процентах: 0..=100.
    pub cpu_percent: u8,
    /// Свободная физическая память в мегабайтах.
    pub ram_free_mb: u32,
    /// Вся физическая память в мегабайтах.
    pub ram_total_mb: u32,
    /// Сколько секунд человек не трогал ввод.
    pub idle_seconds: u64,
}

/// Кто сейчас за машиной.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Mode {
    /// Человек рядом и работает: делаем по одному и негромко.
    Near,
    /// Человек отошёл: можно взять больше.
    Away,
    /// Машина и так занята: берём минимум, сколько бы человек ни отошёл.
    Crowded,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Near => "человек за машиной",
            Mode::Away => "человек отошёл",
            Mode::Crowded => "машина занята",
        }
    }
}

/// Что человек сказал о себе: уходит он или работает.
///
/// Зачем слово, если есть таймер. Таймер ошибается в обе стороны: он считает «отошёл»
/// того, кто читает с экрана, и «рядом» того, кто ушёл с ноутбуком. Слово человека
/// сильнее измерения — но не сильнее железа: объявление не добавляет памяти и ядер.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Presence {
    /// «Я ухожу»: можно взять больше, пока не сказано обратное.
    Away,
    /// «Я работаю»: одно дело в фоне, чужие окна не трогаем.
    Near,
}

impl Presence {
    pub fn as_str(self) -> &'static str {
        match self {
            Presence::Away => "я ухожу",
            Presence::Near => "я работаю",
        }
    }
}

/// Сколько можно взять прямо сейчас. Это совет, и он объяснён.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Budget {
    /// Сколько дел можно вести одновременно.
    pub parallel: u8,
    /// Кто за машиной — по измерению, а не по догадке.
    pub mode: Mode,
    /// Почему решено именно так. Без этого «умное» решение — просто число.
    pub reason: String,
    /// Можно ли начинать новое дело. Память на исходе — это «нет», а не «помедленнее».
    pub may_start: bool,
}

/// Человек отошёл, если не трогал ввод дольше этого.
const AWAY_SECONDS: u64 = 180;

/// Меньше этого свободной памяти — не начинаем ничего нового.
const RAM_FLOOR_MB: u32 = 800;

/// Меньше этого — работаем по одному, даже если человек отошёл.
const RAM_TIGHT_MB: u32 = 1500;

/// Загрузка выше этой — машина занята кем-то ещё.
const CPU_BUSY: u8 = 70;

/// Решение по измерению, без слова человека. Оставлено отдельно: так видно, что именно
/// меняет слово, а что говорит железо.
pub fn decide(sample: &Sample) -> Budget {
    decide_with(sample, None)
}

/// Решение по измерению и по слову человека.
///
/// Порядок правил не случаен: сначала голодная машина, потом чужая загрузка, и только
/// потом присутствие. Слово «я ухожу» не отменяет первые два правила — иначе объявление
/// стало бы способом выжать из машины то, чего в ней нет.
pub fn decide_with(sample: &Sample, said: Option<Presence>) -> Budget {
    if sample.ram_free_mb < RAM_FLOOR_MB {
        return Budget {
            parallel: 0,
            mode: Mode::Crowded,
            reason: match said {
                Some(Presence::Away) => format!(
                    "вы сказали, что уходите, но свободной памяти {} МБ из {} — меньше порога \
                     {} МБ: новое не начинаю, иначе машина повиснет вместе с вашими делами",
                    sample.ram_free_mb, sample.ram_total_mb, RAM_FLOOR_MB
                ),
                _ => format!(
                    "свободной памяти {} МБ из {} — меньше порога {} МБ: новое не начинаю, \
                     чтобы не подвесить машину",
                    sample.ram_free_mb, sample.ram_total_mb, RAM_FLOOR_MB
                ),
            },
            may_start: false,
        };
    }

    if sample.cpu_percent >= CPU_BUSY {
        return Budget {
            parallel: 1,
            mode: Mode::Crowded,
            reason: format!(
                "процессор занят на {}%: дело будет одно, и то в фоне{}",
                sample.cpu_percent,
                match said {
                    Some(Presence::Away) => ", хоть вы и ушли — чужую работу я не вытесняю",
                    _ => "",
                }
            ),
            may_start: true,
        };
    }

    // Слово человека сильнее таймера — в обе стороны.
    match said {
        Some(Presence::Away) => {
            if sample.ram_free_mb < RAM_TIGHT_MB {
                return Budget {
                    parallel: 1,
                    mode: Mode::Away,
                    reason: format!(
                        "вы сказали, что уходите, но свободной памяти только {} МБ — беру одно дело",
                        sample.ram_free_mb
                    ),
                    may_start: true,
                };
            }

            return Budget {
                parallel: 3,
                mode: Mode::Away,
                reason: format!(
                    "вы сказали, что уходите, — верю слову, а не таймеру (ввод молчит {} с): \
                     можно три дела сразу",
                    sample.idle_seconds
                ),
                may_start: true,
            };
        }
        Some(Presence::Near) => {
            // Таймер мог решить «отошёл» — но человек сказал иначе, и это видно в причине.
            let silence = if sample.idle_seconds >= AWAY_SECONDS {
                format!(" (хотя ввод молчит уже {} с)", sample.idle_seconds)
            } else {
                String::new()
            };

            return Budget {
                parallel: 1,
                mode: Mode::Near,
                reason: format!(
                    "вы сказали, что работаете, — одно дело в фоне, чужие окна не трогаю{silence}"
                ),
                may_start: true,
            };
        }
        None => {}
    }

    // Слова нет — решает таймер, и об этом говорится прямо: он может ошибаться.
    if sample.idle_seconds < AWAY_SECONDS {
        return Budget {
            parallel: 1,
            mode: Mode::Near,
            reason: format!(
                "человек трогал ввод {} с назад — работаю в фоне, по одному делу. Если уходите, \
                 скажите это: тогда возьму больше",
                sample.idle_seconds
            ),
            may_start: true,
        };
    }

    // Человек отошёл. Сколько взять — зависит от того, хватит ли памяти на несколько.
    if sample.ram_free_mb < RAM_TIGHT_MB {
        return Budget {
            parallel: 1,
            mode: Mode::Away,
            reason: format!(
                "по тишине ({} с) человек отошёл, но свободной памяти только {} MБ — беру одно дело",
                sample.idle_seconds, sample.ram_free_mb
            ),
            may_start: true,
        };
    }

    Budget {
        parallel: 3,
        mode: Mode::Away,
        reason: format!(
            "по тишине ({} с) человек отошёл, процессор свободен, памяти {} МБ — можно три дела сразу",
            sample.idle_seconds, sample.ram_free_mb
        ),
        may_start: true,
    }
}

/// Ответ без измерения. Слово «я ухожу» здесь всё равно значит больше, чем ничего: если
/// человек сказал, что его нет, одно осторожное дело — честнее, чем «не могу, не вижу».
fn unmeasured(said: Option<Presence>, reason: &str) -> Budget {
    match said {
        Some(Presence::Away) => Budget {
            parallel: 1,
            mode: Mode::Away,
            reason: format!(
                "машина не измерилась ({reason}), но вы сказали, что уходите — беру одно дело"
            ),
            may_start: true,
        },
        _ => Budget {
            parallel: 1,
            mode: Mode::Near,
            reason: format!("машина не измерилась ({reason}) — беру одно дело и осторожно"),
            may_start: true,
        },
    }
}

/// Один процент из двух замеров процессорного времени.
///
/// Считается по разнице: полное время = ядра + пользователь (ядро уже включает простой),
/// значит занятость = 1 − простой/полное. Ноль в знаменателе — не «занято 100%», а «мерить
/// нечего», и это честно превращается в ноль.
pub fn cpu_percent(
    idle: u64,
    kernel: u64,
    user: u64,
    idle_prev: u64,
    kernel_prev: u64,
    user_prev: u64,
) -> u8 {
    let total = (kernel + user).saturating_sub(kernel_prev + user_prev);
    if total == 0 {
        return 0;
    }
    let quiet = idle.saturating_sub(idle_prev).min(total);
    let busy = total - quiet;
    ((busy * 100) / total).min(100) as u8
}

/// Что сказать человеку про этот способ.
pub fn note() -> String {
    if available() {
        "машина измеряется честно: простой ввода, загрузка процессора, свободная память".to_string()
    } else {
        "машина — это Windows: здесь её загрузку не измерить".to_string()
    }
}

/// Можно ли измерить машину здесь.
pub fn available() -> bool {
    cfg!(windows)
}

/// Всё, что приложение знает о машине прямо сейчас.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct State {
    /// Удалось ли измерить. `None` — машина не измеряется здесь, и это не ошибка.
    pub sample: Option<Sample>,
    /// Сколько можно взять. Без измерения — минимум: одно дело.
    pub budget: Budget,
    /// Можно ли измерять на этой системе.
    pub available: bool,
    /// Что это за способ измерения.
    pub note: String,
    /// Что человек сказал про себя. `None` — не говорил, и тогда решает таймер.
    pub declared: Option<Presence>,
}

/// Измерить машину и решить, сколько можно. Отказ измерения — не отказ приложения:
/// без цифр помощник берётся за одно дело, а не за все сразу.
pub fn state() -> State {
    state_with(None)
}

/// То же, но со словом человека: «я ухожу» или «я работаю».
pub fn state_with(said: Option<Presence>) -> State {
    let note = note();
    match sample() {
        Ok(sample) => State {
            budget: decide_with(&sample, said),
            sample: Some(sample),
            available: available(),
            note,
            declared: said,
        },
        Err(reason) => State {
            budget: unmeasured(said, &reason),
            sample: None,
            available: available(),
            note,
            declared: said,
        },
    }
}

/// Снять показания. На Windows — с короткой паузой: загрузка процессора считается по
/// разнице двух замеров, а не по одному мгновению.
pub fn sample() -> Result<Sample, String> {
    imp::sample()
}

#[cfg(windows)]
mod imp {
    use super::cpu_percent;
    use super::Sample;
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::FILETIME;
    // В этих привязках `GetSystemTimes` живёт рядом с потоками, а не с общей информацией
    // о системе: так разложен заголовок, и спорить с ним бесполезно.
    use windows_sys::Win32::System::SystemInformation::{
        GetTickCount, GlobalMemoryStatusEx, MEMORYSTATUSEX,
    };
    use windows_sys::Win32::System::Threading::GetSystemTimes;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    fn ticks(value: &FILETIME) -> u64 {
        ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
    }

    pub fn sample() -> Result<Sample, String> {
        let (idle_prev, kernel_prev, user_prev) = times()?;

        // Двести миллисекунд — достаточно, чтобы разница была осмысленной, и мало, чтобы
        // человек это заметил.
        std::thread::sleep(std::time::Duration::from_millis(200));

        let (idle, kernel, user) = times()?;
        let percent = cpu_percent(idle, kernel, user, idle_prev, kernel_prev, user_prev);

        let mut status: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        status.dwLength = size_of::<MEMORYSTATUSEX>() as u32;
        let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
        if ok == 0 {
            return Err("память не измерилась: система отказала".to_string());
        }

        let mut last: LASTINPUTINFO = unsafe { std::mem::zeroed() };
        last.cbSize = size_of::<LASTINPUTINFO>() as u32;
        let ok = unsafe { GetLastInputInfo(&mut last) };
        if ok == 0 {
            return Err("простой ввода не измерился: система отказала".to_string());
        }

        // `GetTickCount` считает миллисекунды с запуска системы и переполняется сам:
        // вычитание по модулю 2^32 даёт правильную разницу и через 49 суток.
        let now = unsafe { GetTickCount() };
        let idle_ms = now.wrapping_sub(last.dwTime);

        Ok(Sample {
            cpu_percent: percent,
            ram_free_mb: (status.ullAvailPhys / 1024 / 1024) as u32,
            ram_total_mb: (status.ullTotalPhys / 1024 / 1024) as u32,
            idle_seconds: (idle_ms / 1000) as u64,
        })
    }

    fn times() -> Result<(u64, u64, u64), String> {
        let mut idle = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut kernel = idle;
        let mut user = idle;

        let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
        if ok == 0 {
            return Err("время процессора не измерилось: система отказала".to_string());
        }

        Ok((ticks(&idle), ticks(&kernel), ticks(&user)))
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Sample;

    pub fn sample() -> Result<Sample, String> {
        Err("загрузку машины видно только на Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(cpu: u8, ram_free: u32, idle: u64) -> Sample {
        Sample {
            cpu_percent: cpu,
            ram_free_mb: ram_free,
            ram_total_mb: 16_384,
            idle_seconds: idle,
        }
    }

    #[test]
    fn while_a_person_is_there_only_one_thing_runs() {
        let budget = decide(&sample(20, 9_000, 5));

        assert_eq!(budget.parallel, 1);
        assert_eq!(budget.mode, Mode::Near);
        assert!(budget.may_start);
        assert!(budget.reason.contains("в фоне"));
    }

    #[test]
    fn when_he_leaves_more_can_run() {
        let budget = decide(&sample(12, 9_000, 900));

        assert_eq!(budget.mode, Mode::Away);
        assert_eq!(budget.parallel, 3);
        assert!(budget.reason.contains("отошёл"));
    }

    #[test]
    fn a_few_gigabytes_of_free_memory_is_not_room_for_three() {
        let budget = decide(&sample(15, 1_200, 900));

        assert_eq!(budget.parallel, 1);
        assert!(budget.reason.contains("памяти только"));
    }

    #[test]
    fn memory_about_to_run_out_stops_everything() {
        let budget = decide(&sample(10, 400, 900));

        assert_eq!(budget.parallel, 0);
        assert!(!budget.may_start);
        assert_eq!(budget.mode, Mode::Crowded);
        assert!(budget.reason.contains("новое не начинаю"));
    }

    #[test]
    fn a_busy_machine_is_respected_even_if_the_person_is_away() {
        let budget = decide(&sample(95, 9_000, 900));

        assert_eq!(budget.parallel, 1);
        assert_eq!(budget.mode, Mode::Crowded);
        assert!(budget.reason.contains("процессор занят"));
    }

    #[test]
    fn cpu_load_is_counted_from_the_difference_and_never_lies_about_zero() {
        // Простоя не было вовсе: занято всё.
        assert_eq!(cpu_percent(0, 100, 100, 0, 0, 0), 100);
        // Простой равен полному времени: занято ноль.
        assert_eq!(cpu_percent(200, 100, 100, 0, 0, 0), 0);
        // Мерить нечего — это ноль, а не «занято на 100%».
        assert_eq!(cpu_percent(10, 10, 10, 10, 10, 10), 0);
        // Разница меньше шага: делим на то, что есть, и не выходим за 100.
        assert!(cpu_percent(1, 2, 1, 0, 0, 0) <= 100);
    }

    #[test]
    fn without_measurement_the_answer_is_careful_not_brave() {
        // Здесь машина не измеряется (в тестах — не Windows либо без прав). Ответ всё равно
        // есть: одно дело и причина, а не «всё можно».
        let state = state();
        if state.sample.is_none() {
            assert_eq!(state.budget.parallel, 1);
            assert!(state.budget.may_start);
            assert!(state.budget.reason.contains("не измерилась"));
        }
        assert!(!state.note.is_empty());
    }

    #[test]
    fn a_persons_word_beats_the_idle_timer() {
        // Сказал «ухожу», хотя ввод трогали пять секунд назад, — верим слову.
        let away = decide_with(&sample(10, 9_000, 5), Some(Presence::Away));
        assert_eq!(away.mode, Mode::Away);
        assert_eq!(away.parallel, 3);
        assert!(away.reason.contains("вы сказали"));

        // Сказал «работаю», хотя таймер молчит два часа, — тоже верим.
        let near = decide_with(&sample(10, 9_000, 9_000), Some(Presence::Near));
        assert_eq!(near.mode, Mode::Near);
        assert_eq!(near.parallel, 1);
        assert!(near.reason.contains("вы сказали"));
        assert!(near.reason.contains("ввод молчит уже 9000 с"));
    }

    #[test]
    fn a_word_about_leaving_does_not_add_memory_or_cores() {
        // Мало памяти — «я ухожу» этого не отменяет: объявление не добавляет железа.
        let low = decide_with(&sample(10, 400, 5), Some(Presence::Away));
        assert_eq!(low.parallel, 0);
        assert!(!low.may_start);
        assert_eq!(low.mode, Mode::Crowded);
        assert!(low.reason.contains("вы сказали"));

        // Полтора гигабайта — одно дело, даже если человек ушёл.
        let tight = decide_with(&sample(10, 1_200, 5), Some(Presence::Away));
        assert_eq!(tight.parallel, 1);
        assert!(tight.reason.contains("памяти только"));

        // Чужую загрузку не вытесняем даже по слову.
        let busy = decide_with(&sample(95, 9_000, 5), Some(Presence::Away));
        assert_eq!(busy.parallel, 1);
        assert_eq!(busy.mode, Mode::Crowded);
        assert!(busy.reason.contains("не вытесняю"));
    }

    #[test]
    fn without_a_word_the_timer_says_so_honestly() {
        let near = decide(&sample(10, 9_000, 5));

        assert!(near.reason.contains("Если уходите, скажите"));
    }

    #[test]
    fn a_declaration_is_not_lost_when_the_machine_cannot_be_measured() {
        let away = unmeasured(Some(Presence::Away), "нет прав");

        assert_eq!(away.mode, Mode::Away);
        assert_eq!(away.parallel, 1);
        assert!(
            away.may_start,
            "слово человека всё же значит одно осторожное дело"
        );
        assert!(away.reason.contains("вы сказали"));

        assert_eq!(unmeasured(None, "нет прав").mode, Mode::Near);
    }

    #[test]
    fn the_note_says_where_measuring_is_possible() {
        let note = note();
        if available() {
            assert!(note.contains("измеряется"));
        } else {
            assert!(note.contains("Windows"));
        }
    }
}
