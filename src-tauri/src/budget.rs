//! Где приложение тратит ресурсы — и где оно выходит за обещанное.
//!
//! Зачем это отдельный модуль. «Лёгкое приложение» — обещание, которое нельзя
//! проверить глазами: пока всё быстро, не видно, стало ли медленнее месяц
//! назад. Поэтому у плана есть числа (холодный старт ≤ 3 с, память в простое
//! ≤ 150 МБ, процессор в простое ≤ 1%), и здесь они превращаются в
//! **измерение, сравнение и одно предложение**, а не в график.
//!
//! Три решения:
//!
//!  * **числа рядом с порогом.** «Память 214 МБ» без «при обещанных 150»
//!    ничего не говорит: человек не помнит порог, а разработчик не помнит,
//!    когда его поставили;
//!  * **»не измерили» — не «хорошо».** Если счётчик недоступен, так и
//!    написано. Пустая зелёная строка приучает не смотреть;
//!  * **превышение — не ошибка приложения.** Это факт, а не падение: само по
//!    себе превышение порога ничего не ломает, и пугать человека красным
//!    незачем — но и молчать нельзя, иначе порог перестаёт что-то значить.

use serde::Serialize;

/// Сколько чего приложение тратит и сколько обещало.
#[derive(Debug, Clone, Serialize)]
pub struct Metric {
    /// Что измеряем — словами человека: «холодный старт», «память в простое».
    pub name: String,
    /// Сколько вышло. `None` — не измерили, и это сказано.
    pub value: Option<f64>,
    /// Единица: «с», «МБ», «%».
    pub unit: String,
    /// Обещанный порог. `None` — порога нет, только наблюдение.
    pub budget: Option<f64>,
    /// Влезает ли в порог. `None` — сравнивать не с чем.
    pub within: Option<bool>,
    /// Как это мерили — чтобы цифре можно было верить.
    pub how: String,
}

impl Metric {
    /// Измерение с порогом. Сравнение — здесь, а не на экране: правило одно,
    /// и в двух местах оно разъедется.
    pub fn with_budget(name: &str, value: f64, unit: &str, budget: f64, how: &str) -> Metric {
        Metric {
            name: name.to_string(),
            value: Some(value),
            unit: unit.to_string(),
            budget: Some(budget),
            within: Some(value <= budget),
            how: how.to_string(),
        }
    }

    /// Наблюдение без порога: цифра есть, обещания нет.
    pub fn observed(name: &str, value: f64, unit: &str, how: &str) -> Metric {
        Metric {
            name: name.to_string(),
            value: Some(value),
            unit: unit.to_string(),
            budget: None,
            within: None,
            how: how.to_string(),
        }
    }

    /// Не измерили — и сказали об этом прямо.
    pub fn unknown(name: &str, unit: &str, why: &str) -> Metric {
        Metric {
            name: name.to_string(),
            value: None,
            unit: unit.to_string(),
            budget: None,
            within: None,
            how: why.to_string(),
        }
    }
}

/// Сводка: сколько измерений вышло за порог и что с этим делать.
#[derive(Debug, Clone, Serialize)]
pub struct BudgetReport {
    pub metrics: Vec<Metric>,
    /// Сколько вышло за порог. Ноль — и это тоже результат.
    pub over: usize,
    /// Сколько не удалось измерить: «не знаю» — не «хорошо».
    pub unknown: usize,
    /// Одно предложение: что происходит. Пусто — всё в пределах обещанного.
    pub summary: String,
}

/// Собрать сводку по измерениям.
///
/// Порядок в `metrics` сохраняется: это порядок рассказа, а не сортировка по
/// величине — человеку важен «старт, потом память, потом процессор».
pub fn report(metrics: Vec<Metric>) -> BudgetReport {
    let over = metrics
        .iter()
        .filter(|metric| metric.within == Some(false))
        .count();
    let unknown = metrics
        .iter()
        .filter(|metric| metric.value.is_none())
        .count();

    let summary = if over > 0 {
        let worst = metrics
            .iter()
            .filter(|metric| metric.within == Some(false))
            .map(|metric| metric.name.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            "за обещанным порогом: {worst}. Это не поломка, но приложение стало тяжелее, чем обещало"
        )
    } else if unknown == metrics.len() {
        "измерений нет: считать нечем, и это честнее выдуманных цифр".to_string()
    } else if unknown > 0 {
        format!("в пределах обещанного, кроме {unknown} неизмеренных — они названы отдельно")
    } else {
        "всё в пределах обещанного порога".to_string()
    };

    BudgetReport {
        metrics,
        over,
        unknown,
        summary,
    }
}

/// Память процесса в мегабайтах по счётчику Windows. `None` — не Windows.
///
/// Читается из `GetProcessMemoryInfo` через `tasklist`-подобный путь? Нет:
/// лишний процесс ради цифры — сам по себе расход. Поэтому на не-Windows
/// честное «не измерено», а на Windows число берётся у системы.
#[cfg(windows)]
pub fn memory_mb() -> Option<f64> {
    use std::os::windows::process::CommandExt;
    // `tasklist` есть на любой Windows и не требует прав: формат вывода —
    // «имя  PID  сессия  номер  ПАМЯТЬ», где память в килобайтах с разделителями.
    let pid = std::process::id().to_string();
    let output = std::process::Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    parse_tasklist_kb(&text).map(|kb| kb / 1024.0)
}

#[cfg(not(windows))]
pub fn memory_mb() -> Option<f64> {
    None
}

/// Память из строки `tasklist /FO CSV`: четвёртое поле, «12 345 КБ».
///
/// Отдельной функцией: формат чужой, и проверять разбор надо без Windows.
pub fn parse_tasklist_kb(text: &str) -> Option<f64> {
    let line = text.lines().find(|line| line.contains(','))?;
    // Настоящий разбор кавычек, а не split('"'): между полями стоят запятые,
    // и наивный split делал их отдельными полями — цифра уходила в сторону.
    let fields: Vec<&str> = line
        .split('"')
        .enumerate()
        // В `"a","b"` после split по кавычке нечётные куски — значения,
        // чётные — запятые между ними.
        .filter(|(index, _)| index % 2 == 1)
        .map(|(_, value)| value)
        .collect();
    // Поля CSV: имя, PID, сессия, номер сессии, память. Память — пятое.
    let field = fields.get(4)?;
    let digits: String = field.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse::<f64>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Шаг 400: число всегда рядом с порогом.
    ///
    /// «Память 214 МБ» без «при обещанных 150» не говорит ничего: человек не
    /// помнит порог, а разработчик не помнит, когда его поставили.
    #[test]
    fn a_number_is_always_next_to_its_budget() {
        let metric = Metric::with_budget("память в простое", 214.0, "МБ", 150.0, "tasklist");
        assert_eq!(metric.budget, Some(150.0));
        assert_eq!(metric.within, Some(false));

        let ok = Metric::with_budget("память в простое", 120.0, "МБ", 150.0, "tasklist");
        assert_eq!(ok.within, Some(true));
        // Ровно на пороге — влезает: порог это «не больше», а не «меньше».
        let edge = Metric::with_budget("старт", 3.0, "с", 3.0, "засечка");
        assert_eq!(edge.within, Some(true));
    }

    /// Шаг 382/384: превышение названо, но не названо поломкой.
    #[test]
    fn going_over_the_budget_is_named_but_not_called_a_breakage() {
        let report = report(vec![
            Metric::with_budget("холодный старт", 2.1, "с", 3.0, "засечка"),
            Metric::with_budget("память в простое", 214.0, "МБ", 150.0, "tasklist"),
        ]);
        assert_eq!(report.over, 1);
        assert!(
            report.summary.contains("память в простое"),
            "{}",
            report.summary
        );
        // Текст говорит «это не поломка» — и это именно то, что нужно.
        assert!(report.summary.contains("не поломка"), "{}", report.summary);
        // А слов, которыми обозначают поломку, в нём нет.
        assert!(!report.summary.contains("ошибк"), "{}", report.summary);
        assert!(!report.summary.contains("сломал"), "{}", report.summary);
        assert!(
            report.summary.contains("стало тяжелее"),
            "{}",
            report.summary
        );
    }

    #[test]
    fn everything_within_the_budget_says_so_plainly() {
        let report = report(vec![Metric::with_budget(
            "холодный старт",
            2.1,
            "с",
            3.0,
            "засечка",
        )]);
        assert_eq!(report.over, 0);
        assert_eq!(report.summary, "всё в пределах обещанного порога");
    }

    /// «Не измерили» — не «хорошо»: пустая зелёная строка приучает не смотреть.
    #[test]
    fn not_measured_is_not_reported_as_fine() {
        let report = report(vec![Metric::unknown(
            "память в простое",
            "МБ",
            "не Windows: счётчик недоступен",
        )]);
        assert_eq!(report.unknown, 1);
        assert_eq!(report.over, 0);
        assert!(
            report.summary.contains("измерений нет"),
            "{}",
            report.summary
        );
    }

    #[test]
    fn some_unknown_and_some_fine_names_the_gap() {
        let report = report(vec![
            Metric::with_budget("старт", 2.0, "с", 3.0, "засечка"),
            Metric::unknown("процессор в простое", "%", "счётчик недоступен"),
        ]);
        assert_eq!(report.unknown, 1);
        assert!(report.summary.contains("неизмеренн"), "{}", report.summary);
    }

    /// Разбор чужого формата проверяется без Windows.
    #[test]
    fn the_memory_number_is_read_from_tasklist_csv() {
        // Формат `tasklist /FO CSV /NH`, как на русской Windows.
        let sample = "\"zshelper.exe\",\"4321\",\"Console\",\"1\",\"142 336 КБ\"\r\n";
        assert_eq!(parse_tasklist_kb(sample), Some(142336.0));

        // Пустой ответ — не ноль, а «не прочитали».
        assert_eq!(parse_tasklist_kb(""), None);
        assert_eq!(parse_tasklist_kb("СВЕДЕНИЯ: нет задач"), None);
    }
}
