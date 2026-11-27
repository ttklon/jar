//! Люди за одним компьютером: у каждого своя память и свои разрешения.
//!
//! За одним компьютером не всегда один человек. Пока память одна, «у меня
//! аллергия на кошек» становится фактом про всех, а разрешение «удалять файлы»,
//! данное одним, работает и для другого — то есть **чужое согласие считается
//! моим**.
//!
//! Два правила, из которых всё остальное следует:
//!
//!  1. **память отдельного человека не видна другому** — не «помечена как его», а
//!     физически в другом списке: поиск в чужой памяти не должен её находить;
//!  2. **разрешения тоже по человеку** — «можно удалять» это согласие человека, а
//!     не свойство компьютера.
//!
//! Что **не** разделяется: настройки программы, скачанная модель, расписания
//! общих задач. Это про машину, а не про человека. Иначе новый профиль заставит
//! скачивать модель заново — и человек не станет заводить профиль.
//!
//! Хранилище — файл рядом с остальными настройками. Активный человек тоже в нём:
//! «кто сейчас» — это факт, а не догадка из последнего дела.

use serde::{Deserialize, Serialize};

/// Один человек.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Person {
    pub id: String,
    pub name: String,
    /// Гость: безопасные дела, и ничего опасного.
    pub guest: bool,
    /// Сколько фактов в его памяти — числом, чтобы было видно «своя память», а не
    /// обещание.
    pub facts: u32,
}

/// Что лежит в файле целиком.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Book {
    /// Кто действует сейчас. Пусто — профилей ещё нет.
    pub current: String,
    pub people: Vec<Person>,
}

/// Где лежит список людей.
pub fn file() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    base.join("ZShelper").join("people.json")
}

/// Прочитать список.
///
/// Битый файл — пустой список, а не паника: профили можно завести заново, а
/// приложение без профилей запускается (один человек — ничего не выбирает).
pub fn load() -> Book {
    let Ok(text) = std::fs::read_to_string(file()) else {
        return Book::default();
    };
    serde_json::from_str::<Book>(&text).unwrap_or_default()
}

/// Записать список. Доказательство — чтение обратно.
pub fn save(book: &Book) -> Result<(), String> {
    let path = file();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|error| format!("папка людей: {error}"))?;
    }
    let text = serde_json::to_string_pretty(book).map_err(|error| error.to_string())?;
    std::fs::write(&path, format!("{text}\n")).map_err(|error| format!("запись людей: {error}"))?;
    let back =
        std::fs::read_to_string(&path).map_err(|error| format!("чтение обратно: {error}"))?;
    if back.trim() != text.trim() {
        return Err("в файле оказалось не то, что записали: список людей не сохранён".to_string());
    }
    Ok(())
}

/// Завести человека.
///
/// Имя — обязательное: «другой профиль» не помогает человеку отличить себя от
/// гостя. Два одинаковых имени не заводятся: иначе вопрос «это вы?» показывает
/// два одинаковых варианта.
pub fn add(book: &Book, name: &str, guest: bool) -> Result<Book, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("имя не названо: без имени человек не отличит себя от гостя".to_string());
    }
    let mut next = book.clone();
    // Сравнение имён без регистра — **не** `eq_ignore_ascii_case`: он знает
    // только латиницу, и «я» с «Я» прошли бы как разные люди. Для русских имён
    // это и есть «два одинаковых имени» в вопросе «это вы?».
    let wanted = name.to_lowercase();
    if next
        .people
        .iter()
        .any(|person| person.name.to_lowercase() == wanted)
    {
        return Err(format!(
            "«{name}» уже есть: два одинаковых имени не помогают отличить людей"
        ));
    }
    let id = format!("p{}", next.people.len() + 1);
    next.people.push(Person {
        id: id.clone(),
        name: name.to_string(),
        guest,
        facts: 0,
    });
    // Первый человек становится действующим: «один человек — ничего не выбирает».
    if next.current.is_empty() {
        next.current = id;
    }
    save(&next)?;
    Ok(next)
}

/// Переключить, кто сейчас.
///
/// Дело при этом не начинается заново: переключение встраивается. Отдельная
/// команда, потому что «посмотреть» и «поменять» — разные действия.
pub fn switch(book: &Book, id: &str) -> Result<Book, String> {
    if !book.people.iter().any(|person| person.id == id) {
        return Err("такого человека нет: возможно, профиль уже удалён".to_string());
    }
    let mut next = book.clone();
    next.current = id.to_string();
    save(&next)?;
    Ok(next)
}

/// Убрать человека.
///
/// Последнего не удаляем: без людей приложение не знает, от чьего имени работает,
/// а «пусто» — это не «один человек».
pub fn remove(book: &Book, id: &str) -> Result<Book, String> {
    if book.people.len() <= 1 {
        return Err(
            "единственного человека не удаляю: без него непонятно, от чьего имени работать"
                .to_string(),
        );
    }
    let mut next = book.clone();
    next.people.retain(|person| person.id != id);
    if next.current == id {
        // Действующим становится первый оставшийся — и это сказано экраном.
        next.current = next
            .people
            .first()
            .map(|person| person.id.clone())
            .unwrap_or_default();
    }
    save(&next)?;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book() -> Book {
        Book {
            current: "p1".into(),
            people: vec![Person {
                id: "p1".into(),
                name: "я".into(),
                guest: false,
                facts: 3,
            }],
        }
    }

    #[test]
    fn a_name_without_a_name_is_not_a_profile() {
        assert!(add(&book(), "   ", false).is_err());
    }

    #[test]
    fn two_identical_names_make_the_question_useless() {
        let error = add(&book(), "Я", false).unwrap_err();
        assert!(error.contains("уже есть"), "{error}");
    }

    #[test]
    fn the_first_person_becomes_the_current_one() {
        let empty = Book::default();
        let next = add(&empty, "Аня", false).expect("человек заводится");
        assert_eq!(next.current, "p1", "один человек — ничего не выбирает");
    }

    #[test]
    fn the_last_person_is_not_removed() {
        let error = remove(&book(), "p1").unwrap_err();
        assert!(error.contains("единственного"), "{error}");
    }

    #[test]
    fn removing_the_current_person_switches_to_a_remaining_one() {
        let mut two = book();
        two.people.push(Person {
            id: "p2".into(),
            name: "Аня".into(),
            guest: true,
            facts: 0,
        });
        let next = remove(&two, "p1").expect("удаляется");
        assert_eq!(next.current, "p2");
    }

    #[test]
    fn switching_to_an_unknown_person_is_refused() {
        assert!(switch(&book(), "p9").is_err());
    }
}
