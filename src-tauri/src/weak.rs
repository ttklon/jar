//! Профиль «слабая машина» (шаг 396).
//!
//! Зачем отдельный профиль, если пороги уже есть в `machine.rs`. Пороги есть, но
//! проверяются они на «нормальной» машине: в тестах свободной памяти тысячи
//! мегабайт, процессор свободен. На слабой машине — два гигабайта памяти, занятый
//! процессор — приложение должно не «работать помедленнее», а **честно упроститься**:
//! одно дело вместо трёх и понятная причина, почему так.
//!
//! Здесь профиль описан как данные, а не как «если в тесте мало памяти». Так он
//! один и тот же в проверке решений (`machine::decide`), в замерах (`perf.rs`) и в
//! объяснении человеку: «на этой машине я беру одно дело» — это факт из профиля, а
//! не догадка.
//!
//! Чего профиль не делает: не запрещает работу. Слабая машина — не повод отказать,
//! это повод не брать лишнего.

use crate::machine::{self, Mode, Sample};

/// Границы, по которым машина считается слабой.
///
/// Числа не «круглые для красоты»: два гигабайта памяти — это машина, на которой
/// Windows сама занимает больше половины, а свободных восьмисот мегабайт не будет
/// почти никогда; четыре ядра и HDD — ноутбук пятилетней давности.
pub const WEAK_RAM_TOTAL_MB: u32 = 4 * 1024;
pub const WEAK_CORES: u32 = 4;

/// «Человек отошёл» для профиля: те же три минуты, что и у `machine::AWAY_SECONDS`.
///
/// Повторять число здесь — не дублирование, а условие сравнения: профиль должен
/// стоять в тех же обстоятельствах, что и настоящая машина, иначе он меряет другое.
const AWAY_SECONDS_FOR_PROFILE: u64 = 180;

/// Профиль слабой машины: то, что видит приложение.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WeakMachine {
    pub ram_total_mb: u32,
    pub ram_free_mb: u32,
    pub cpu_percent: u8,
    pub cores: u32,
}

impl WeakMachine {
    /// Типичная слабая машина: мало памяти и занятый процессор.
    pub fn typical() -> Self {
        Self {
            ram_total_mb: 3 * 1024,
            // Свободной памяти меньше порога `machine::RAM_FLOOR_MB` — новый разговор
            // на такой машине начинать нельзя, но начатое не бросается.
            ram_free_mb: 900,
            cpu_percent: 55,
            cores: 2,
        }
    }

    /// Машина, у которой память кончилась совсем: сюда же браузер с сотней вкладок.
    ///
    /// Процессор намеренно не «занят»: иначе причина отказа называла бы процессор, и
    /// проверка «память на исходе» прошла бы по чужому правилу, ничего не проверив.
    pub fn starved() -> Self {
        Self {
            ram_total_mb: 3 * 1024,
            ram_free_mb: 300,
            cpu_percent: 12,
            cores: 2,
        }
    }

    /// Слаба ли она по нашим меркам.
    pub fn is_weak(&self) -> bool {
        self.ram_total_mb <= WEAK_RAM_TOTAL_MB || self.cores <= WEAK_CORES
    }

    /// Что приложение из этого профиля видит.
    ///
    /// Человек отошёл: именно тогда машина решает, сколько брать, — рядом с работающим
    /// человеком она всё равно берёт одно дело, и разницы между слабой и сильной не
    /// видно. Сравнивать профили надо при равных условиях, иначе сравнение врёт.
    pub fn sample(&self) -> Sample {
        Sample {
            cpu_percent: self.cpu_percent,
            ram_free_mb: self.ram_free_mb,
            ram_total_mb: self.ram_total_mb,
            idle_seconds: AWAY_SECONDS_FOR_PROFILE,
        }
    }
}

/// Упростилось ли приложение по-настоящему.
///
/// Не «сколько дел разрешено», а «не врёт ли оно»: на слабой машине либо меньше
/// параллельных дел, либо причина названа, либо и то, и другое.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Simplification {
    pub parallel: u8,
    pub mode: Mode,
    pub reason: String,
}

impl Simplification {
    /// Причина названа человеку: пустая строка тут была бы «просто так».
    pub fn explains_itself(&self) -> bool {
        !self.reason.trim().is_empty()
    }

    /// Упростилось ли: меньше предельных трёх дел или режим назван занятым.
    pub fn is_simpler_than_normal(&self) -> bool {
        self.parallel < machine::PARALLEL_CEILING || self.mode == Mode::Crowded
    }
}

/// Что приложение сделает на этой машине.
pub fn plan_on(machine_profile: &WeakMachine) -> Simplification {
    let budget = machine::decide(&machine_profile.sample());
    Simplification {
        parallel: budget.parallel,
        mode: budget.mode,
        reason: budget.reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_weak_machine_is_recognised_by_its_own_numbers() {
        assert!(WeakMachine::typical().is_weak());
        assert!(WeakMachine::starved().is_weak());
        // Нормальная машина слабой не считается: иначе профиль был бы ловушкой.
        let normal = WeakMachine {
            ram_total_mb: 16 * 1024,
            ram_free_mb: 9 * 1024,
            cpu_percent: 12,
            cores: 8,
        };
        assert!(!normal.is_weak());
    }

    #[test]
    fn a_weak_machine_gets_fewer_deeds_and_a_reason() {
        let plan = plan_on(&WeakMachine::typical());

        // Либо дел меньше, чем обычно, либо режим назван занятым — и в любом случае
        // причина сказана словами, а не оставлена человеку на догадку.
        assert!(
            plan.is_simpler_than_normal(),
            "на слабой машине план не упростился: {plan:?}"
        );
        assert!(plan.explains_itself(), "причина не названа: {plan:?}");
        assert!(plan.parallel <= machine::PARALLEL_CEILING);
    }

    #[test]
    fn a_starving_machine_does_not_start_new_deeds() {
        let plan = plan_on(&WeakMachine::starved());

        // Память ниже порога — новое не начинается; начатое не бросается.
        assert_eq!(plan.mode, Mode::Crowded);
        assert!(plan.explains_itself());
        assert!(
            plan.reason.contains("памяти"),
            "причина должна называть память: {}",
            plan.reason
        );
    }

    #[test]
    fn a_strong_machine_is_not_simplified_by_the_weak_profile() {
        // Профиль не должен «упрощать» всех подряд: на сильной машине упрощения нет.
        let normal = WeakMachine {
            ram_total_mb: 32 * 1024,
            ram_free_mb: 20 * 1024,
            cpu_percent: 10,
            cores: 16,
        };
        let plan = plan_on(&normal);

        assert_eq!(plan.parallel, machine::PARALLEL_CEILING);
        assert_ne!(plan.mode, Mode::Crowded);
        assert!(
            plan.explains_itself(),
            "и тут причина названа — иначе это молчание"
        );
    }
}
