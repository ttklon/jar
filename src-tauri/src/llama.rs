//! Движок `llama-server`: где он лежит и с какими флагами запускается.
//!
//! Движок не входит в сборку: это отдельный бинарник, который человек кладёт сам
//! (`sidecars/llama-server.exe`) или держит в `PATH`. Поэтому первое, что приложение
//! обязано уметь, — честно сказать «движка нет», а не «модель не запустилась».
//!
//! Флаги заданы осознанно, а не «по умолчанию»:
//! * `--host 127.0.0.1` — наружу движок не смотрит;
//! * `--no-webui` — веб-интерфейс llama.cpp нам не нужен и только занимает порт;
//! * `-c 8192` — контекст под наши планы, `--parallel 1` — один запрос за раз.

use std::path::{Path, PathBuf};

use crate::server::ServerSpec;

/// Имя бинарника в сборке под Windows.
pub const PROGRAM: &str = "llama-server.exe";

/// Где приложение ищет движок: сначала рядом с собой, потом в `PATH`.
pub fn find_program(base: &Path) -> Option<PathBuf> {
    find_named(base, PROGRAM)
}

/// Ищет `program` в `base/sidecars`, в самом `base` и в `PATH`.
pub fn find_named(base: &Path, program: &str) -> Option<PathBuf> {
    let near = [base.join("sidecars").join(program), base.join(program)];
    for candidate in near {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths)
        .map(|dir| dir.join(program))
        .find(|candidate| candidate.is_file())
}

/// Флаги запуска модели на свободном порту `127.0.0.1:<port>`.
pub fn args(model: &Path, port: u16) -> Vec<String> {
    vec![
        "--model".to_string(),
        model.display().to_string(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--no-webui".to_string(),
        "--ctx-size".to_string(),
        "8192".to_string(),
        "--parallel".to_string(),
        "1".to_string(),
    ]
}

/// Готовая спецификация для `server::Server::start`.
pub fn spec(program: &Path, model: &Path, port: u16) -> ServerSpec {
    ServerSpec::new(
        &program.display().to_string(),
        args(model, port),
        port,
        "/health",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("zshelper-llama-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("временная папка создаётся");
        dir
    }

    #[test]
    fn flags_keep_the_engine_local() {
        let args = args(Path::new("C:/models/m.gguf"), 51234);
        let joined = args.join(" ");

        assert!(
            joined.contains("--host 127.0.0.1"),
            "наружу не смотрит: {joined}"
        );
        assert!(joined.contains("--port 51234"));
        assert!(joined.contains("--no-webui"));
        assert!(joined.contains("--parallel 1"));
        assert!(joined.contains("C:/models/m.gguf") || args.contains(&"C:/models/m.gguf".into()));
    }

    #[test]
    fn spec_asks_for_the_health_endpoint() {
        let spec = spec(Path::new("llama-server.exe"), Path::new("m.gguf"), 9000);
        assert_eq!(spec.port, 9000);
        assert_eq!(spec.health_path, "/health");
        assert!(spec.args.contains(&"9000".to_string()));
    }

    #[test]
    fn program_is_found_next_to_the_app_first() {
        let dir = temp_dir("sidecars");
        let side = dir.join("sidecars");
        std::fs::create_dir_all(&side).expect("папка sidecars создаётся");
        let program = side.join(PROGRAM);
        std::fs::write(&program, b"placeholder").expect("файл пишется");

        let found = find_program(&dir).expect("находится рядом с приложением");
        assert_eq!(found, program);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn absent_program_is_none_not_an_error() {
        let dir = temp_dir("absent");
        assert!(
            find_named(&dir, "zshelper-no-such-engine.exe").is_none(),
            "отсутствие движка — это ответ, а не сбой"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
