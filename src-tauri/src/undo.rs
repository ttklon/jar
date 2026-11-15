//! Откат сделанного за сессию: журнал переносов и их отмена.
//!
//! Зачем отдельный журнал, если уже есть `audit.jsonl`: у них разные вопросы. Журнал
//! действий отвечает «что просили, что решила политика и чем закончилось» — он нужен
//! человеку. Здесь другой вопрос: **как вернуть**. Поэтому записи пишутся в отдельный файл
//! и только для того, что действительно можно вернуть.
//!
//! Правила, которые легко нарушить молча:
//!
//!  * **записывается только обратимое.** Перенос и переименование вернуть можно: путь
//!    известен, содержимое не менялось. Запись в файл, копия, сжатие, скачивание и корзина
//!    сюда **не попадают** — старое содержимое уже потеряно или лежит в другом месте.
//!    Отчёт об откате так и говорит: «это не откатывается», а не тихо пропускает;
//!  * **откат идёт в обратном порядке.** Последнее дело отменяется первым: иначе пары
//!    «откуда → куда» перестают сходиться, и файл уезжает не туда;
//!  * **перед обратным шагом проверяется состояние.** Файл должен быть там, куда его
//!    положили, а старое место — свободно. Не сходится — отказ с причиной. Перезаписать
//!    то, что человек положил на старое место, было бы хуже, чем не откатить;
//!  * **после шага проверяется результат.** «Команда не упала» — не доказательство:
//!    обратный перенос проверяется по двум фактам (вернулось, и там его больше нет);
//!  * **битая строка журнала не ломает остальные.** Файл могут править руками; читаем
//!    построчно и пропускаем то, что не разбирается, как и журнал действий.

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;

/// Что именно откатывается. Пока только пути: и перенос, и переименование — это перенос.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Kind {
    /// Файл или папка переехали из одного места в другое.
    Move,
    /// Имя изменилось, содержимое осталось.
    Rename,
}

impl Kind {
    /// Как это назвать человеку.
    pub fn title(self) -> &'static str {
        match self {
            Kind::Move => "перенос",
            Kind::Rename => "переименование",
        }
    }
}

/// Одна запись: что куда уехало и когда.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    /// Секунды от эпохи: время нужно, чтобы человек узнал дело, а не поверил номеру.
    pub at: u64,
    /// Сессия — это запуск приложения: откат по умолчанию касается текущего.
    pub session: String,
    pub kind: Kind,
    pub from: String,
    pub to: String,
}

impl Entry {
    /// Что сказать про эту запись в списке отката.
    pub fn title(&self) -> String {
        format!("{}: {} → {}", self.kind.title(), self.from, self.to)
    }
}

/// Шаг отката: запись и причина, по которой её откатывать нельзя (если есть).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Step {
    pub entry: Entry,
    /// `None` — можно откатывать.
    pub refusal: Option<String>,
}

impl Step {
    /// Можно ли выполнять этот шаг.
    pub fn possible(&self) -> bool {
        self.refusal.is_none()
    }
}

/// Чем закончился откат.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Report {
    pub session: String,
    /// Сколько дел вернулось.
    pub undone: usize,
    /// Почему остальные не вернулись — по строке на дело.
    pub refused: Vec<String>,
}

impl Report {
    /// Человеческая фраза про итог: без «успешно» и без «ошибка».
    pub fn summary(&self) -> String {
        if self.undone == 0 && self.refused.is_empty() {
            return format!("в сессии {} нечего откатывать", self.session);
        }
        if self.refused.is_empty() {
            return format!("откачено дел: {}", self.undone);
        }
        if self.undone == 0 {
            return format!("ничего не откатилось — причин: {}", self.refused.len());
        }
        format!(
            "откачено дел: {}, не откатилось: {}",
            self.undone,
            self.refused.len()
        )
    }
}

/// Что откат **не** умеет — прямо, чтобы никто не надеялся зря.
pub const NOTE: &str = "откатываются переносы и переименования этой сессии; запись в файл, \
копия, сжатие, скачивание и корзина — нет: старое содержимое уже не вернуть";

/// Разбор журнала: построчно, терпимо к битым строкам.
pub fn parse(text: &str) -> Vec<Entry> {
    text.lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<Entry>(line).ok())
        .collect()
}

/// Журнал отката: файл и сессия, к которой относятся новые записи.
#[derive(Debug, Clone)]
pub struct Journal {
    path: PathBuf,
    session: String,
}

impl Journal {
    pub fn open(path: impl Into<PathBuf>, session: impl Into<String>) -> Journal {
        Journal {
            path: path.into(),
            session: session.into(),
        }
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    pub fn session(&self) -> &str {
        &self.session
    }

    /// Записать обратимое дело. `Err` — с причиной, а не молча: журнал без записи значит,
    /// что откат об этом деле не узнает.
    pub fn record(&self, kind: Kind, from: &str, to: &str) -> Result<Entry, String> {
        if from.trim().is_empty() || to.trim().is_empty() {
            return Err("не записываю перенос без обеих сторон: откатывать будет некуда".into());
        }
        let entry = Entry {
            at: now(),
            session: self.session.clone(),
            kind,
            from: from.to_string(),
            to: to.to_string(),
        };
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let line = serde_json::to_string(&entry)
            .map_err(|error| format!("запись не собралась в строку: {error}"))?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .map_err(|error| format!("журнал отката не открылся на запись: {error}"))?;
        writeln!(file, "{line}").map_err(|error| format!("журнал отката не записался: {error}"))?;
        Ok(entry)
    }

    /// Всё, что записано. Битые строки пропускаются молча — но их отсутствие не выдаётся
    /// за «ничего не делали»: об этом скажет пустой список, а не ложное подтверждение.
    pub fn entries(&self) -> Vec<Entry> {
        match std::fs::read_to_string(&self.path) {
            Ok(text) => parse(&text),
            Err(_) => Vec::new(),
        }
    }

    /// Записи этой сессии в порядке отката (обратном порядке дел).
    pub fn undoable(&self) -> Vec<Entry> {
        let mut mine: Vec<Entry> = self
            .entries()
            .into_iter()
            .filter(|entry| entry.session == self.session)
            .collect();
        mine.reverse();
        mine
    }
}

/// План отката: что вернём, а что нет, и почему.
///
/// `exists` — проверка состояния на момент составления плана: она же повторится перед
/// каждым шагом, потому что между планом и делом человек успевает что-то переложить.
pub fn plan(entries: &[Entry], session: &str, exists: impl Fn(&str) -> bool) -> Vec<Step> {
    entries
        .iter()
        .rev()
        .map(|entry| Step {
            entry: entry.clone(),
            refusal: refuse_reason(entry, session, &exists),
        })
        .collect()
}

fn refuse_reason(entry: &Entry, session: &str, exists: &impl Fn(&str) -> bool) -> Option<String> {
    if entry.session != session {
        return Some(format!(
            "это дело другой сессии ({}) — откатывайте там, где его сделали",
            entry.session
        ));
    }
    if !exists(&entry.to) {
        return Some(format!(
            "{} уже не там, куда его положили: откатывать нечего",
            entry.from
        ));
    }
    if exists(&entry.from) {
        return Some(format!(
            "старое место занято: {} — перезаписывать не буду",
            entry.from
        ));
    }
    None
}

/// Выполнить план: обратный перенос с проверкой до и после.
///
/// Движение передаётся снаружи: ядро отката не знает, чем двигают файлы, и это позволяет
/// проверить правила без диска.
pub fn apply(
    steps: &[Step],
    exists: impl Fn(&str) -> bool,
    move_back: impl Fn(&str, &str) -> Result<(), String>,
) -> Report {
    let session = steps
        .first()
        .map(|step| step.entry.session.clone())
        .unwrap_or_default();
    let mut report = Report {
        session,
        undone: 0,
        refused: Vec::new(),
    };

    for step in steps {
        if let Some(reason) = &step.refusal {
            report
                .refused
                .push(format!("{}: {reason}", step.entry.title()));
            continue;
        }
        // Состояние могло измениться после составления плана — проверяем ещё раз.
        if let Some(reason) = refuse_reason(&step.entry, &step.entry.session, &exists) {
            report
                .refused
                .push(format!("{}: {reason}", step.entry.title()));
            continue;
        }
        match move_back(&step.entry.to, &step.entry.from) {
            // Проверка после шага: вернулось и там его больше нет. Иначе это не откат.
            Ok(()) if exists(&step.entry.from) && !exists(&step.entry.to) => {
                report.undone += 1;
            }
            Ok(()) => report.refused.push(format!(
                "{}: после обратного переноса состояние не сходится",
                step.entry.title()
            )),
            Err(reason) => report
                .refused
                .push(format!("{}: {reason}", step.entry.title())),
        }
    }
    report
}

/// Откатить сессию по-настоящему: план по журналу и перенос через файловую систему.
pub fn undo_session(journal: &Journal) -> Report {
    let entries = journal.undoable();
    let steps = plan(&entries, journal.session(), path_exists);
    apply(&steps, path_exists, move_back_on_disk)
}

fn path_exists(path: &str) -> bool {
    std::path::Path::new(path).exists()
}

fn move_back_on_disk(from: &str, to: &str) -> Result<(), String> {
    std::fs::rename(from, to).map_err(|error| format!("вернуть не удалось: {error}"))
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|spent| spent.as_secs())
        .unwrap_or_default()
}

/// Журнал приложения: открывается один раз на запуск.
///
/// Без него запись вызовов — тихий пропуск: так живут тесты и утилиты, у которых нет папки
/// приложения. Это единственное место, где «ничего не записалось» не ошибка, и здесь об
/// этом сказано прямо.
static CURRENT: OnceLock<Journal> = OnceLock::new();

/// Открыть журнал приложения. `true` — открыли, `false` — уже был открыт (повтор не беда).
pub fn init(path: PathBuf) -> bool {
    let session = format!("{:x}", now());
    CURRENT.set(Journal::open(path, session)).is_ok()
}

/// Журнал приложения, если он открыт.
pub fn current() -> Option<&'static Journal> {
    CURRENT.get()
}

/// Записать перенос, если журнал открыт. Возвращает `true`, если запись появилась.
pub fn record_move(from: &str, to: &str) -> bool {
    match current() {
        Some(journal) => journal.record(Kind::Move, from, to).is_ok(),
        None => false,
    }
}

/// Записать переименование, если журнал открыт.
pub fn record_rename(from: &str, to: &str) -> bool {
    match current() {
        Some(journal) => journal.record(Kind::Rename, from, to).is_ok(),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_journal(name: &str) -> Journal {
        let dir = std::env::temp_dir().join(format!("zshelper-undo-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("папка журнала");
        Journal::open(dir.join("undo.jsonl"), "sess-1")
    }

    fn entry(kind: Kind, from: &str, to: &str, session: &str) -> Entry {
        Entry {
            at: 1,
            session: session.to_string(),
            kind,
            from: from.to_string(),
            to: to.to_string(),
        }
    }

    #[test]
    fn a_recorded_move_is_read_back_and_reads_tolerate_broken_lines() {
        let journal = temp_journal("roundtrip");

        journal
            .record(Kind::Move, "C:\\a\\файл.txt", "C:\\b\\файл.txt")
            .expect("запись");

        // Битая строка не должна утащить за собой целые.
        let mut file = OpenOptions::new()
            .append(true)
            .open(journal.path())
            .expect("файл журнала");
        writeln!(file, "{{это не json").expect("мусор");
        journal
            .record(Kind::Rename, "C:\\b\\файл.txt", "C:\\b\\новый.txt")
            .expect("вторая запись");

        let entries = journal.entries();
        assert_eq!(entries.len(), 2, "{entries:?}");
        assert_eq!(entries[0].kind, Kind::Move);
        assert_eq!(entries[1].kind, Kind::Rename);
        // Откат идёт с конца: последнее дело — первым.
        let order: Vec<Kind> = journal.undoable().iter().map(|e| e.kind).collect();
        assert_eq!(order, vec![Kind::Rename, Kind::Move]);
    }

    #[test]
    fn an_entry_without_both_sides_is_not_recorded() {
        let journal = temp_journal("empty-side");

        let refused = journal.record(Kind::Move, "", "C:\\b\\файл.txt");

        assert!(refused.is_err(), "запись без «откуда» откатить нельзя");
        assert!(journal.entries().is_empty());
    }

    #[test]
    fn a_broken_journal_path_says_so_instead_of_panicking() {
        let journal = Journal::open("/\u{0}негодный/undo.jsonl", "sess-1");

        let failed = journal.record(Kind::Move, "C:\\a", "C:\\b");

        assert!(failed.is_err(), "о неудаче записи нужно узнать");
    }

    #[test]
    fn the_plan_goes_backwards_and_refuses_foreign_sessions() {
        let entries = vec![
            entry(Kind::Move, "a", "b", "sess-1"),
            entry(Kind::Move, "c", "d", "sess-1"),
            entry(Kind::Move, "x", "y", "sess-2"),
        ];

        let steps = plan(&entries, "sess-1", |path| matches!(path, "b" | "d" | "y"));

        // Порядок — обратный ко всему журналу: последнее дело первым. Чужое дело попадает
        // в список, но с причиной: человеку полезно видеть, что оно есть и почему не его.
        let order: Vec<&str> = steps.iter().map(|s| s.entry.to.as_str()).collect();
        assert_eq!(order, vec!["y", "d", "b"]);
        assert!(steps[0].refusal.is_some(), "чужая сессия не откатывается");
        assert!(steps[1].possible(), "{:?}", steps[1]);
        assert!(steps[2].possible(), "{:?}", steps[2]);
    }

    #[test]
    fn a_target_that_is_no_longer_there_is_not_undone() {
        let entries = vec![
            entry(Kind::Move, "a", "b", "sess-1"),
            entry(Kind::Move, "c", "d", "sess-1"),
        ];

        // «d» человек уже убрал руками: откатывать нечего, и это говорится вслух.
        let steps = plan(&entries, "sess-1", |path| path == "b");

        assert!(
            steps[0]
                .refusal
                .as_deref()
                .unwrap_or("")
                .contains("уже не там"),
            "{:?}",
            steps[0].refusal
        );
        assert!(steps[1].possible(), "{:?}", steps[1]);
    }

    #[test]
    fn an_occupied_old_place_is_refused_instead_of_overwritten() {
        let entries = vec![entry(Kind::Move, "a", "b", "sess-1")];

        // Человек положил что-то новое туда, откуда файл когда-то уехал.
        let steps = plan(&entries, "sess-1", |path| path == "a" || path == "b");

        assert!(
            steps[0].refusal.as_deref().unwrap_or("").contains("занято"),
            "{:?}",
            steps[0].refusal
        );
    }

    #[test]
    fn applying_counts_what_came_back_and_says_why_the_rest_did_not() {
        // Состояние живое: после обратного переноса «b» исчезает, «a» появляется. Статичная
        // проверка здесь ничего бы не доказала — она не заметила бы самого переноса.
        let state = std::cell::RefCell::new(vec!["b".to_string()]);
        let exists = |path: &str| state.borrow().iter().any(|known| known == path);
        let move_back = |from: &str, to: &str| -> Result<(), String> {
            state.borrow_mut().retain(|known| known != from);
            state.borrow_mut().push(to.to_string());
            Ok(())
        };

        let steps = vec![
            Step {
                entry: entry(Kind::Move, "a", "b", "sess-1"),
                refusal: None,
            },
            Step {
                entry: entry(Kind::Move, "c", "d", "sess-1"),
                refusal: Some("старое место занято".to_string()),
            },
        ];

        let report = apply(&steps, exists, move_back);

        assert_eq!(report.undone, 1, "{report:?}");
        assert_eq!(report.refused.len(), 1, "{report:?}");
        assert!(
            report.summary().contains("откачено дел: 1"),
            "{}",
            report.summary()
        );
    }

    #[test]
    fn a_move_that_lied_about_success_is_not_counted() {
        // Движение «прошло», но состояние не сходится: файл остался на месте.
        let steps = vec![Step {
            entry: entry(Kind::Move, "a", "b", "sess-1"),
            refusal: None,
        }];

        let report = apply(&steps, |path| path == "b", |_from, _to| Ok(()));

        assert_eq!(report.undone, 0);
        assert!(
            report.refused[0].contains("не сходится"),
            "{}",
            report.refused[0]
        );
    }

    #[test]
    fn a_real_move_is_undone_on_disk_and_checked_by_two_facts() {
        let journal = temp_journal("real");
        let dir = journal.path().parent().expect("папка").to_path_buf();
        let source = dir.join("заметка.txt");
        let moved = dir.join("куда-то");
        std::fs::create_dir_all(&moved).expect("папка назначения");
        let target = moved.join("заметка.txt");
        std::fs::write(&source, "текст").expect("файл");
        std::fs::rename(&source, &target).expect("перенос");
        journal
            .record(
                Kind::Move,
                &source.to_string_lossy(),
                &target.to_string_lossy(),
            )
            .expect("запись");

        let report = undo_session(&journal);

        assert_eq!(report.undone, 1, "{report:?}");
        assert!(source.exists(), "файл вернулся на место");
        assert!(!target.exists(), "и там его больше нет");
        assert_eq!(std::fs::read_to_string(&source).expect("текст"), "текст");

        // Второй откат того же не выдумывает успех: вернуть уже нечего.
        let second = undo_session(&journal);
        assert_eq!(second.undone, 0, "{second:?}");
        assert!(!second.refused.is_empty());
    }
}
