//! Роли моделей: что от модели требуется, а не какая модель «правильная».
//!
//! Модель в приложении нужна не сама по себе, а под задачу: быстрая — понять, чего
//! человек хочет; большая — спланировать и написать; маленькая — искать по памяти.
//! Поэтому привязка идёт от роли к файлу, который уже лежит на диске, а не наоборот.
//!
//! Чего здесь намеренно нет: списка «рекомендованных» ссылок и эталонных хешей.
//! Мы их не проверяли, а выдуманный адрес — это скачанный мусор с правильным именем.
//! Потолок размера — единственное требование, и оно проверяемое: у файла есть размер.

use std::path::Path;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use crate::memory::Memory;

/// Роли лежат данными, а не кодом: их же читает браузерное зеркало интерфейса, и две
/// правды о том, что такое `workhorse`, разошлись бы молча.
const ROLES_JSON: &str = include_str!("../../data/roles.json");

/// Роль модели.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Role {
    pub id: String,
    pub title: String,
    pub purpose: String,
    /// Потолок размера файла. Выше — модель не про эту роль, а не «плохая».
    pub max_bytes: u64,
}

#[derive(Deserialize)]
struct Doc {
    roles: Vec<Role>,
}

fn parsed() -> &'static [Role] {
    static ROLES: OnceLock<Vec<Role>> = OnceLock::new();
    // Ошибка разбора здесь означала бы битые встроенные данные — это проверяется
    // тестом, а не обработкой во время работы.
    ROLES.get_or_init(|| {
        let doc: Doc = serde_json::from_str(ROLES_JSON).expect("встроенные роли разбираются");
        doc.roles
    })
}

pub fn all() -> &'static [Role] {
    parsed()
}

pub fn get(id: &str) -> Option<&'static Role> {
    parsed().iter().find(|role| role.id == id)
}

/// Влезает ли файл в роль по размеру.
pub fn fits(role: &Role, size_bytes: u64) -> bool {
    size_bytes <= role.max_bytes
}

fn key(role: &str) -> String {
    format!("role:{role}")
}

/// Какая модель назначена на роль. Хранится имя файла: папку можно перенести.
pub fn assigned(memory: &Memory, role: &str) -> Option<String> {
    memory.fact(&key(role))
}

/// Назначает файл на роль. Отсутствующий файл не назначается: роль, которая указывает
/// в пустоту, хуже неназначенной — она выглядит настроенной.
pub fn assign(dir: &Path, memory: &Memory, role: &str, name: &str) -> Result<(), String> {
    let role = get(role).ok_or_else(|| format!("неизвестная роль: {role}"))?;
    if name.is_empty() || name.contains(['/', '\\']) || name.contains("..") {
        return Err("имя файла не может быть путём".to_string());
    }
    if !dir.join(name).is_file() {
        return Err(format!("файла нет: {name}"));
    }

    memory
        .remember(&key(&role.id), name)
        .map_err(|error| format!("назначение не записалось: {error}"))
}

/// Снимает назначение: роль остаётся, модель у неё — нет.
pub fn clear(memory: &Memory, role: &str) -> Result<(), String> {
    let role = get(role).ok_or_else(|| format!("неизвестная роль: {role}"))?;
    memory
        .forget(&key(&role.id))
        .map_err(|error| format!("назначение не снялось: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_memory(tag: &str) -> (Memory, PathBuf) {
        let dir = std::env::temp_dir().join(format!("zshelper-roles-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("временная папка создаётся");
        let memory = Memory::open(dir.join("memory.db")).expect("память открывается");
        (memory, dir)
    }

    #[test]
    fn roles_have_unique_ids_and_real_ceilings() {
        assert!(!all().is_empty(), "роли не должны исчезнуть из данных");
        for (index, role) in all().iter().enumerate() {
            assert!(!role.title.is_empty());
            assert!(!role.purpose.is_empty());
            assert!(role.max_bytes > 0);
            assert!(
                all()
                    .iter()
                    .skip(index + 1)
                    .all(|other| other.id != role.id),
                "идентификатор роли повторяется: {}",
                role.id
            );
        }
    }

    #[test]
    fn size_ceiling_is_checked_not_guessed() {
        let router = get("router").expect("роль есть");
        assert!(fits(router, 1024 * 1024 * 1024));
        assert!(
            !fits(router, 3 * 1024 * 1024 * 1024),
            "3 ГБ в роль router не влезают"
        );
        assert!(get("no-such-role").is_none());
    }

    #[test]
    fn assigning_needs_a_real_file_and_can_be_cleared() {
        let (memory, dir) = temp_memory("assign");
        std::fs::write(dir.join("small.gguf"), b"payload").expect("файл пишется");

        let error = assign(&dir, &memory, "router", "absent.gguf").expect_err("файла нет");
        assert!(error.contains("файла нет"), "{error}");

        assign(&dir, &memory, "router", "small.gguf").expect("назначение записывается");
        assert_eq!(assigned(&memory, "router").as_deref(), Some("small.gguf"));

        // Роли независимы: назначение одной не трогает другую.
        assert!(assigned(&memory, "workhorse").is_none());

        clear(&memory, "router").expect("назначение снимается");
        assert!(assigned(&memory, "router").is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn unknown_role_is_an_error_not_a_silent_write() {
        let (memory, dir) = temp_memory("unknown");
        std::fs::write(dir.join("m.gguf"), b"payload").expect("файл пишется");

        let error = assign(&dir, &memory, "supreme", "m.gguf").expect_err("такой роли нет");
        assert!(error.contains("неизвестная роль"), "{error}");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
