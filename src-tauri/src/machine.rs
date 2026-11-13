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

/// Решение по измерению. Правила в порядке важности: память, затем чужая загрузка, затем
/// присутствие человека. Порядок не случаен: голодная машина вредит всем, включая человека.
pub fn decide(sample: &Sample) -> Budget {
    if sample.ram_free_mb < RAM_FLOOR_MB {
        return Budget {
            parallel: 0,
            mode: Mode::Crowded,
            reason: format!(
                "свободной памяти {} МБ из {} — меньше порога {} МБ: новое не начинаю, \
                 чтобы не подвесить машину",
                sample.ram_free_mb, sample.ram_total_mb, RAM_FLOOR_MB
            ),
            may_start: false,
        };
    }

    if sample.cpu_percent >= CPU_BUSY {
        return Budget {
            parallel: 1,
            mode: Mode::Crowded,
            reason: format!(
                "процессор занят на {}%: дело будет одно, и то в фоне",
                sample.cpu_percent
            ),
            may_start: true,
        };
    }

    if sample.idle_seconds < AWAY_SECONDS {
        return Budget {
            parallel: 1,
            mode: Mode::Near,
            reason: format!(
                "человек трогал ввод {} с назад — работаю в фоне, по одному делу",
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
                "человек отошёл ({} с тишины), но свободной памяти только {} MБ — беру одно дело",
                sample.idle_seconds, sample.ram_free_mb
            ),
            may_start: true,
        };
    }

    Budget {
        parallel: 3,
        mode: Mode::Away,
        reason: format!(
            "человек отошёл ({} с тишины), процессор свободен, памяти {} МБ — можно три дела сразу",
            sample.idle_seconds, sample.ram_free_mb
        ),
        may_start: true,
    }
}

/// Один процент из двух замеров процессорного времени.
///
/// Считается по разнице: полное время = ядра + пользователь (ядро уже включает простой),
/// значит занятость = 1 − простой/полное. Ноль в знаменателе — не «занято 100%», а «мерить
/// нечего», и это честно превращается в ноль.
pub fn cpu_percent(idle: u64, kernel: u64, user: u64, idle_prev: u64, kernel_prev: u64, user_prev: u64) -> u8 {
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
}

/// Измерить машину и решить, сколько можно. Отказ измерения — не отказ приложения:
/// без цифр помощник берётся за одно дело, а не за все сразу.
pub fn state() -> State {
    let note = note();
    match sample() {
        Ok(sample) => State {
            budget: decide(&sample),
            sample: Some(sample),
            available: available(),
            note,
        },
        Err(reason) => State {
            budget: Budget {
                parallel: 1,
                mode: Mode::Near,
                reason: format!("машина не измерилась ({reason}) — беру одно дело и осторожно"),
                may_start: true,
            },
            sample: None,
            available: available(),
            note,
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
        GlobalMemoryStatusEx, GetTickCount, MEMORYSTATUSEX,
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
    fn the_note_says_where_measuring_is_possible() {
        let note = note();
        if available() {
            assert!(note.contains("измеряется"));
        } else {
            assert!(note.contains("Windows"));
        }
    }
}
