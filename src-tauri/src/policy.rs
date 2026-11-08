//! Политика риска: единственное место, где решается «можно ли это выполнять».
//!
//! Ни UI, ни будущий планировщик не имеют права обойти `decide()`: они спрашивают,
//! а решение и подтверждающий токен живут здесь.
//!
//! Правила (совпадают с `docs/BUILD-GUIDE.md` §7):
//! * `read` — выполняется сразу, человеку показывается уведомление;
//! * `write-local`, `external`, `destructive` — нужен одноразовый токен, который
//!   выдаётся только после явного подтверждения в интерфейсе;
//! * `identity`, `money` и статус `never` — отказ. Не «после подтверждения», а
//!   отказ: у системы не должно быть пути, который это делает.
//!
//! Токен привязан к ключу действия и хешу аргументов. Изменились аргументы —
//! токен недействителен. Токен одноразовый и живёт 5 минут.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::registry::{Action, ActionStatus, Risk};

/// Сколько живёт подтверждение. Дольше — человек уже не помнит, на что соглашался.
pub const TOKEN_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Выполнять сразу, без вопроса.
    Allow,
    /// Выполнять можно, но человек должен увидеть, что именно произойдёт.
    AllowWithNotice,
    /// Нужен подтверждающий токен.
    Confirm,
    /// Отказ; строка — причина для интерфейса.
    Deny(&'static str),
}

impl Decision {
    pub fn as_str(self) -> &'static str {
        match self {
            Decision::Allow => "allow",
            Decision::AllowWithNotice => "allow_with_notice",
            Decision::Confirm => "confirm",
            Decision::Deny(_) => "deny",
        }
    }

    pub fn needs_token(self) -> bool {
        matches!(self, Decision::Confirm)
    }

    pub fn reason(self) -> &'static str {
        match self {
            Decision::Allow => "чтение: можно выполнять без подтверждения",
            Decision::AllowWithNotice => {
                "изменение в пределах приложения: выполняем и показываем результат"
            }
            Decision::Confirm => "нужно подтверждение человеком",
            Decision::Deny(reason) => reason,
        }
    }
}

/// Решение по действию из реестра.
pub fn decide(action: &Action) -> Decision {
    if action.status == ActionStatus::Never {
        // `never` в реестре — это не «заблокировано», а «такой возможности нет».
        return Decision::Deny("действие помечено never: система его не выполняет");
    }

    match action.risk {
        Risk::Read => Decision::Allow,
        Risk::WriteLocal => Decision::Confirm,
        Risk::External => Decision::Confirm,
        Risk::Destructive => Decision::Confirm,
        Risk::Identity => Decision::Deny("учётные данные и подпись — только человек"),
        Risk::Money => Decision::Deny("деньги система не двигает"),
    }
}

/// Хеш аргументов: устойчивый (FNV-1a 64), без внешних зависимостей.
///
/// Криптостойкость здесь не нужна: хеш сверяется в том же процессе и защищает от
/// «подтвердил одно — выполнилось другое», а не от подбора.
pub fn fingerprint(key: &str, args: &[(String, String)]) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0000_0100_0000_01b3;

    let mut hash = OFFSET;
    let mut feed = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(PRIME);
        }
    };

    feed(key.as_bytes());
    for (name, value) in args {
        feed(b"\x1f");
        feed(name.as_bytes());
        feed(b"\x1e");
        feed(value.as_bytes());
    }
    hash
}

#[derive(Debug)]
struct Token {
    fingerprint: u64,
    issued: Instant,
}

/// Хранилище подтверждений. Живёт в состоянии приложения.
#[derive(Default)]
pub struct PolicyState {
    tokens: Mutex<HashMap<u64, Token>>,
    next: Mutex<u64>,
}

impl PolicyState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Выдаёт токен. Вызывается только после подтверждения в интерфейсе.
    pub fn issue(&self, key: &str, args: &[(String, String)]) -> u64 {
        let fingerprint = fingerprint(key, args);
        let mut next = match self.next.lock() {
            Ok(next) => next,
            Err(poisoned) => poisoned.into_inner(),
        };
        *next += 1;
        let id = *next;

        let mut tokens = match self.tokens.lock() {
            Ok(tokens) => tokens,
            Err(poisoned) => poisoned.into_inner(),
        };
        tokens.insert(
            id,
            Token {
                fingerprint,
                issued: Instant::now(),
            },
        );
        id
    }

    /// Проверяет и **сразу гасит** токен: повторно им воспользоваться нельзя.
    pub fn consume(&self, id: u64, key: &str, args: &[(String, String)]) -> Result<(), TokenError> {
        let mut tokens = match self.tokens.lock() {
            Ok(tokens) => tokens,
            Err(poisoned) => poisoned.into_inner(),
        };

        let token = tokens.remove(&id).ok_or(TokenError::Unknown)?;
        if token.issued.elapsed() > TOKEN_TTL {
            return Err(TokenError::Expired);
        }
        if token.fingerprint != fingerprint(key, args) {
            return Err(TokenError::Mismatch);
        }
        Ok(())
    }

    /// Чистка просроченных: вызывается перед выдачей нового токена.
    pub fn prune(&self) {
        let mut tokens = match self.tokens.lock() {
            Ok(tokens) => tokens,
            Err(poisoned) => poisoned.into_inner(),
        };
        tokens.retain(|_, token| token.issued.elapsed() <= TOKEN_TTL);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum TokenError {
    #[error("подтверждение не найдено или уже использовано")]
    Unknown,
    #[error("подтверждение истекло — подтвердите ещё раз")]
    Expired,
    #[error("аргументы изменились после подтверждения")]
    Mismatch,
}

impl TokenError {
    pub fn as_str(self) -> &'static str {
        match self {
            TokenError::Unknown => "подтверждение не найдено или уже использовано",
            TokenError::Expired => "подтверждение истекло — подтвердите ещё раз",
            TokenError::Mismatch => "аргументы изменились после подтверждения",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::{HumanCode, Tier};

    fn action(risk: Risk, status: ActionStatus) -> Action {
        Action {
            id: "t-001".into(),
            domain: "files".into(),
            verb: "создать".into(),
            object: "папку".into(),
            example: "создай папку".into(),
            implementation: vec!["fs.mkdir".into()],
            risk,
            tier: Tier::T0,
            human: "может".into(),
            human_code: HumanCode::Can,
            status,
            notes: String::new(),
        }
    }

    fn args(path: &str) -> Vec<(String, String)> {
        vec![("path".to_string(), path.to_string())]
    }

    #[test]
    fn read_runs_without_question() {
        assert_eq!(decide(&action(Risk::Read, ActionStatus::V1)), Decision::Allow);
    }

    #[test]
    fn writes_require_confirmation() {
        for risk in [Risk::WriteLocal, Risk::External, Risk::Destructive] {
            assert_eq!(decide(&action(risk, ActionStatus::V1)), Decision::Confirm);
            assert!(decide(&action(risk, ActionStatus::V1)).needs_token());
        }
    }

    #[test]
    fn money_and_identity_are_denied() {
        assert!(matches!(decide(&action(Risk::Money, ActionStatus::V1)), Decision::Deny(_)));
        assert!(matches!(decide(&action(Risk::Identity, ActionStatus::V1)), Decision::Deny(_)));
    }

    #[test]
    fn never_status_is_denied_even_when_read() {
        let decision = decide(&action(Risk::Read, ActionStatus::Never));
        assert!(matches!(decision, Decision::Deny(_)));
    }

    #[test]
    fn token_is_single_use() {
        let state = PolicyState::new();
        let token = state.issue("files|создать|папку", &args("C:\\tmp"));
        assert!(state.consume(token, "files|создать|папку", &args("C:\\tmp")).is_ok());
        assert_eq!(
            state.consume(token, "files|создать|папку", &args("C:\\tmp")),
            Err(TokenError::Unknown)
        );
    }

    #[test]
    fn token_is_bound_to_arguments() {
        let state = PolicyState::new();
        let token = state.issue("files|создать|папку", &args("C:\\tmp"));
        assert_eq!(
            state.consume(token, "files|создать|папку", &args("C:\\Windows")),
            Err(TokenError::Mismatch)
        );
    }

    #[test]
    fn token_is_bound_to_action() {
        let state = PolicyState::new();
        let token = state.issue("files|создать|папку", &args("C:\\tmp"));
        assert_eq!(
            state.consume(token, "files|удалить|в корзину", &args("C:\\tmp")),
            Err(TokenError::Mismatch)
        );
    }

    #[test]
    fn unknown_token_is_rejected() {
        let state = PolicyState::new();
        assert_eq!(
            state.consume(42, "files|создать|папку", &args("C:\\tmp")),
            Err(TokenError::Unknown)
        );
    }

    #[test]
    fn fingerprint_is_stable_and_order_sensitive() {
        let a = fingerprint("k", &args("1"));
        assert_eq!(a, fingerprint("k", &args("1")));
        assert_ne!(a, fingerprint("k", &args("2")));
        assert_ne!(a, fingerprint("k2", &args("1")));

        let two_a = vec![
            ("a".to_string(), "1".to_string()),
            ("b".to_string(), "2".to_string()),
        ];
        let two_b = vec![
            ("b".to_string(), "2".to_string()),
            ("a".to_string(), "1".to_string()),
        ];
        assert_ne!(fingerprint("k", &two_a), fingerprint("k", &two_b));
    }
}
