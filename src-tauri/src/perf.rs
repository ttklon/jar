//! Замер старта и памяти в CI на подставном профиле (шаги 390/391).
//!
//! Зачем отдельный модуль. Пороги «холодный старт ≤ 3 с» (381) и «память в простое
//! ≤ 150 МБ» (382) без регулярного замера — это обещание, которое никто не проверяет.
//! Проверять надо не «сегодня быстро», а «не стало медленнее»: регрессия приходит
//! шагом на десятки миллисекунд и её не видно глазами.
//!
//! Здесь нет и не может быть настоящего окна: тест в CI — это процесс без интерфейса.
//! Поэтому профиль «подставной»: работы, которые делает старт (разбор реестра,
//! открытие памяти, первая засечка), выполняются по-настоящему, и время меряется
//! вокруг них. Это не «старт приложения» целиком — и отчёт говорит это прямо, а не
//! выдаёт за него. Порог тот же: если подготовка съест больше половины бюджета,
//! на окно останется меньше, и регрессия будет видна до того, как её заметит человек.
//!
//! Числа печатаются строкой `PERF ...` и попадают в сводку CI: замер, которого никто
//! не видит, — это не замер.

use std::time::{Duration, Instant};

/// Порог холодного старта, который обещаем человеку (шаг 381), в секундах.
pub const START_BUDGET_S: f64 = 3.0;

/// Порог памяти в простое (шаг 382), мегабайт.
pub const MEMORY_BUDGET_MB: f64 = 150.0;

/// Сколько старта отдаём подготовке, а сколько оставляем окну.
///
/// Половина — не потому, что так удобно, а потому, что окно — это ещё и отрисовка,
/// первый кадр и загрузка экранов: если подготовка съела больше половины бюджета,
/// обещание «≤ 3 с до окна» держать уже нечем.
pub const PREPARE_SHARE: f64 = 0.5;

/// Что вышло из одной проверки: число, порог и честное «влезло ли».
#[derive(Debug, Clone, PartialEq)]
pub struct Measured {
    pub name: &'static str,
    pub value: f64,
    pub unit: &'static str,
    pub budget: f64,
}

impl Measured {
    pub fn within(&self) -> bool {
        self.value <= self.budget
    }

    /// Строка для CI: число, порог, вывод. Одна строка — одна проверка.
    pub fn line(&self) -> String {
        format!(
            "PERF {} {:.3}{} при пороге {:.1}{} — {}",
            self.name,
            self.value,
            self.unit,
            self.budget,
            self.unit,
            if self.within() { "в пределах" } else { "за порогом" }
        )
    }
}

/// Прогнать замер один раз.
///
/// `work` — то, что меряем. Один прогон, а не «среднее из ста»: старт случается один
/// раз, и среднее по прогретому кэшу как раз и скрыло бы регрессию.
pub fn time<T>(work: impl FnOnce() -> T) -> (T, Duration) {
    let started = Instant::now();
    let result = work();
    let elapsed = started.elapsed();
    (result, elapsed)
}

/// Итог замера старта: время подготовки против доли бюджета.
pub fn start_check(prepared: Duration) -> Measured {
    Measured {
        name: "подготовка старта",
        value: prepared.as_secs_f64(),
        unit: "с",
        budget: START_BUDGET_S * PREPARE_SHARE,
    }
}

/// Итог замера памяти: рабочий набор процесса против порога.
pub fn memory_check(mb: Option<f64>) -> Option<Measured> {
    // Не измерили — не выдумываем ноль: `None` здесь значит «сказать нечего»,
    // и вызывающий печатает это, а не зелёную строку.
    mb.map(|mb| Measured {
        name: "память тестового процесса",
        value: mb,
        unit: "МБ",
        budget: MEMORY_BUDGET_MB,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Подставной профиль: та работа, которую делает старт, но без окна.
    ///
    /// Реестр встроен в бинарник (`data/registry.json`), память — sqlite во временной
    /// папке: и то, и другое настоящее, поэтому и время настоящее.
    fn prepare() -> (usize, usize) {
        let registry = crate::registry::Registry::load().expect("реестр");
        let tools = registry.len();
        // Имя с меткой времени: тесты идут параллельно, и общий каталог на процесс
        // означал бы, что один удаляет базу другого посреди открытия.
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("zshelper-perf-{stamp}"));
        let _ = std::fs::create_dir_all(&dir);
        let memory = crate::memory::Memory::open(dir.join("perf.db")).expect("память");
        let facts = memory.facts().len();
        let _ = std::fs::remove_dir_all(&dir);
        (tools, facts)
    }

    #[test]
    fn the_start_preparation_stays_inside_its_share() {
        let ((tools, _facts), elapsed) = time(prepare);
        let check = start_check(elapsed);

        println!("{}", check.line());
        assert!(tools > 0, "реестр разобран, а не пуст");

        // Не «медленно ли вообще», а «не отняли ли у окна больше половины бюджета».
        assert!(
            check.within(),
            "подготовка старта {} с при доле бюджета {} с",
            check.value,
            check.budget
        );
    }

    #[test]
    fn the_memory_is_named_with_its_threshold() {
        let measured = memory_check(crate::budget::memory_mb());

        match measured {
            Some(check) => {
                println!("{}", check.line());
                // Превышение — факт, а не поломка (правило шага 400): тест падает
                // только на порог памяти в разы, то есть на настоящую утечку.
                assert!(
                    check.value < MEMORY_BUDGET_MB * 2.0,
                    "память {} МБ — это уже не «чуть больше порога», а утечка",
                    check.value
                );
            }
            None => {
                // Не Windows: счётчика нет, и это говорится, а не прячется.
                println!("PERF память тестового процесса не измерена: счётчик доступен только на Windows");
            }
        }
    }

    #[test]
    fn a_number_always_stands_next_to_its_threshold() {
        let check = start_check(Duration::from_millis(10));

        assert!(check.line().contains("при пороге"), "порог назван в той же строке");
        assert!(check.line().contains("в пределах"));
        // Превышение называется превышением, а не «ошибкой»: это факт, не поломка.
        let over = start_check(Duration::from_secs(10));
        assert!(!over.within());
        assert!(over.line().contains("за порогом"));
        assert!(!over.line().contains("ошибк"));
    }
}
