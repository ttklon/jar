//! Pinned runtime delivery. The archive is never executed. Publication is a directory
//! rename on the same volume, after bounded extraction and Windows x64 PE validation.
//!
//! Два движка — `llama-server` (разговор) и `whisper-server` (распознавание) — идут
//! одним и тем же путём: pinned-релиз, сверка хеша архива до распаковки, ограниченная
//! распаковка, PE-проверка, атомарная публикация в свой управляемый каталог и метка
//! владения. Отличаются только записью в каталоге готовности.
use crate::{download, models, readiness};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MAX_EXPANDED: u64 = 500 * 1024 * 1024;
const OWNER: &str = ".zshelper-owner";
const SCRIPT: &str = include_str!("runtime-install.ps1");

/// Какой движок доставляем. Источник истины по URL/хешу — `data/readiness.json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Llama,
    Whisper,
}

impl Kind {
    /// Pinned-спецификация из каталога готовности.
    pub fn spec(self) -> &'static readiness::RuntimeSpec {
        match self {
            Kind::Llama => &readiness::catalog().runtime,
            Kind::Whisper => &readiness::catalog().whisper_runtime,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Installed {
    pub program: String,
}
#[derive(Deserialize)]
struct Marker {
    archive_sha256: String,
    program: String,
    files: Vec<InstalledFile>,
}
#[derive(Deserialize)]
struct InstalledFile {
    path: String,
    sha256: String,
}

fn marker(dir: &Path) -> Option<Marker> {
    let path = dir.join("installed.json");
    if std::fs::metadata(&path).ok()?.len() > 1024 * 1024 {
        return None;
    }
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

pub fn directory(base: &Path, kind: Kind) -> PathBuf {
    base.join("sidecars").join(&kind.spec().id)
}

/// Windows path rules, also on Linux tests. Never trust a marker as a path.
pub fn safe_relative(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 180
        && name.split(['/', '\\']).all(|p| {
            let stem = p.split('.').next().unwrap_or("").to_ascii_uppercase();
            let numbered_device = stem
                .strip_prefix("COM")
                .or_else(|| stem.strip_prefix("LPT"))
                .is_some_and(|tail| tail.chars().count() == 1 && "0123456789¹²³".contains(tail));
            !p.is_empty()
                && p != "."
                && p != ".."
                && !p.ends_with(['.', ' '])
                && !p.chars().any(|c| c < ' ' || "<>:\"|?*".contains(c))
                && !["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$", "CLOCK$"]
                    .contains(&stem.as_str())
                && !numbered_device
        })
}

fn link_or_reparse(info: &std::fs::Metadata) -> bool {
    if info.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if info.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    false
}

/// Ownership is separate from the payload manifest so a broken payload can still
/// be removed. An arbitrary directory with the version name is NOT app-owned.
pub fn is_managed(base: &Path, kind: Kind) -> bool {
    let dir = directory(base, kind);
    let Ok(info) = std::fs::symlink_metadata(&dir) else {
        return false;
    };
    if !info.is_dir() || link_or_reparse(&info) {
        return false;
    }
    let path = dir.join(OWNER);
    let Ok(info) = std::fs::symlink_metadata(&path) else {
        return false;
    };
    info.is_file()
        && !link_or_reparse(&info)
        && info.len() == 64
        && std::fs::read(path).is_ok_and(|bytes| bytes == kind.spec().sha256.as_bytes())
}

/// Validate the record and filesystem structure without claiming a fresh hash check.
fn payload(dir: &Path, kind: Kind) -> Result<Marker, String> {
    let info = std::fs::symlink_metadata(dir).map_err(|e| e.to_string())?;
    if !info.is_dir() || link_or_reparse(&info) {
        return Err("каталог движка является ссылкой".into());
    }
    let marker_info =
        std::fs::symlink_metadata(dir.join("installed.json")).map_err(|e| e.to_string())?;
    if !marker_info.is_file() || link_or_reparse(&marker_info) {
        return Err("запись установки является ссылкой".into());
    }
    let spec = kind.spec();
    let meta = marker(dir)
        .ok_or_else(|| "повреждена запись установки движка; переустановите его".to_string())?;
    if meta.archive_sha256 != spec.sha256
        || !safe_relative(&meta.program)
        || !meta
            .program
            .replace('\\', "/")
            .rsplit('/')
            .next()
            .is_some_and(|name| name.eq_ignore_ascii_case(&spec.program))
        || meta.files.is_empty()
        || meta.files.len() > 2048
    {
        return Err("запись установки движка не прошла проверку; переустановите его".into());
    }
    let mut found = false;
    let mut total_bytes = 0u64;
    let mut paths = std::collections::BTreeSet::new();
    for file in &meta.files {
        if !safe_relative(&file.path)
            || !readiness::sha256_well_formed(&file.sha256)
            || !paths.insert(file.path.replace('\\', "/").to_ascii_lowercase())
        {
            return Err(
                "небезопасная или повторная запись файла движка; переустановите его".into(),
            );
        }
        if file.path == meta.program {
            found = true;
        }
        // Reject links in every ancestor, not just at the leaf (Windows junctions too).
        let mut current = dir.to_path_buf();
        let parts: Vec<_> = file.path.split(['/', '\\']).collect();
        for (index, part) in parts.iter().enumerate() {
            current.push(part);
            let info = std::fs::symlink_metadata(&current).map_err(|e| {
                format!(
                    "файл установки недоступен: {} ({e}); переустановите движок",
                    current.display()
                )
            })?;
            let leaf = index + 1 == parts.len();
            if link_or_reparse(&info) || (!leaf && !info.is_dir()) || (leaf && !info.is_file()) {
                return Err("небезопасная структура установки; переустановите движок".into());
            }
            if leaf {
                total_bytes = total_bytes.saturating_add(info.len());
            }
        }
        if total_bytes > MAX_EXPANDED {
            return Err("превышен размер установки; переустановите движок".into());
        }
    }
    if !found {
        return Err("exe отсутствует в записи установки; переустановите движок".into());
    }
    Ok(meta)
}

pub fn find(base: &Path, kind: Kind) -> Option<PathBuf> {
    if !is_managed(base, kind) {
        return None;
    }
    let dir = directory(base, kind);
    let meta = payload(&dir, kind).ok()?;
    Some(dir.join(meta.program))
}

fn verify_directory(dir: &Path, kind: Kind, cancellable: bool) -> Result<(), String> {
    let meta = payload(dir, kind)?;
    for file in meta.files {
        let path = dir.join(&file.path);
        let actual = if cancellable {
            download::sha256_cancellable(&path)?
        } else {
            models::sha256_file(&path)?
        };
        if actual != file.sha256 {
            return Err(format!(
                "файл движка изменился: {}; переустановите движок",
                file.path
            ));
        }
    }
    Ok(())
}

/// The manifest detects corruption; it is not a signature against same-user attackers.
pub fn verify(base: &Path, kind: Kind) -> Result<(), String> {
    if !is_managed(base, kind) {
        return Err("владение установкой движка не подтверждено; проверьте каталог вручную".into());
    }
    verify_directory(&directory(base, kind), kind, false)
}

pub fn install(base: &Path, kind: Kind) -> Result<Installed, String> {
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("этот движок предназначен только для Windows x64".into());
    }
    let _guard = download::acquire()?;
    let spec = kind.spec();
    download::set_name(&spec.asset);
    // Source is compiled-in, no URL or destination is accepted over IPC.
    if !allowed_source(spec) {
        return Err("источник движка вне allowlist".into());
    }
    let target = directory(base, kind);
    let target_present = match std::fs::symlink_metadata(&target) {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(error.to_string()),
    };
    if target_present {
        return Err(format!("каталог движка уже есть: {}. Удалите управляемую установку кнопкой; если метка владения повреждена, проверьте каталог вручную. Чужие файлы автоматически не удаляются", target.display()));
    }
    let sidecars = base.join("sidecars");
    std::fs::create_dir_all(&sidecars).map_err(|e| e.to_string())?;
    download::check_free_space(&sidecars, MAX_EXPANDED + spec.bytes)?;
    // Exclusive create prevents cleaning up an unrelated directory.
    let work = sidecars.join(format!(
        ".runtime-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    std::fs::create_dir(&work).map_err(|e| e.to_string())?;
    let stage = work.join("stage");
    let archive = work.join("runtime.zip");
    let script = work.join("install.ps1");
    let result = (|| {
        // Fixed progress name; operation lock covers model downloads as well.
        let part = download::part_path(&sidecars.join(&spec.asset));
        download::remove_stale_part(&part)?;
        let fetched = download::fetch(&spec.url, &part, spec.bytes);
        let checked = fetched.and_then(|()| {
            let size = std::fs::metadata(&part).map_err(|e| e.to_string())?.len();
            if size != spec.bytes || download::sha256_cancellable(&part)? != spec.sha256 {
                return Err("размер или SHA-256 архива движка не совпал".into());
            }
            std::fs::rename(&part, &archive).map_err(|e| e.to_string())
        });
        checked.map_err(|error| download::cleanup_error(&part, error))?;
        if download::cancelled() {
            return Err("скачивание отменено человеком".into());
        }
        std::fs::write(&script, SCRIPT).map_err(|e| e.to_string())?;
        extract(&script, &archive, &stage, &spec.sha256, spec.bytes, &spec.program)?;
        verify_directory(&stage, kind, true)?;
        // Write our own ownership marker, never one supplied by the ZIP.
        let mut owner = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(stage.join(OWNER))
            .map_err(|e| e.to_string())?;
        std::io::Write::write_all(&mut owner, spec.sha256.as_bytes()).map_err(|e| e.to_string())?;
        drop(owner);
        if download::cancelled() {
            return Err("установка отменена человеком".into());
        }
        std::fs::rename(&stage, &target).map_err(|e| format!("установка не опубликована: {e}"))?;
        let program =
            find(base, kind).ok_or_else(|| "не найден установленный движок".to_string())?;
        Ok(Installed {
            program: program.display().to_string(),
        })
    })();
    match std::fs::remove_dir_all(&work) {
        Ok(()) => result,
        Err(error) => {
            let reason = match result {
                Ok(_) => "движок установлен, но временный каталог не убран".to_string(),
                Err(reason) => reason,
            };
            Err(format!("{reason}; очистка не выполнена: {} ({error}). Проверьте каталог перед ручным удалением временных файлов", work.display()))
        }
    }
}

/// Оба движка приходят только из своих официальных релизов: никакого URL из IPC.
fn allowed_source(spec: &readiness::RuntimeSpec) -> bool {
    let prefix = match spec.id.as_str() {
        id if id.starts_with("llama-cpp-") => {
            "https://github.com/ggml-org/llama.cpp/releases/download/"
        }
        id if id.starts_with("whisper-cpp-") => {
            "https://github.com/ggml-org/whisper.cpp/releases/download/"
        }
        _ => return false,
    };
    spec.url.starts_with(prefix)
}

fn extract(
    script: &Path,
    archive: &Path,
    stage: &Path,
    hash: &str,
    bytes: u64,
    program: &str,
) -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};
    let mut child = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(script)
        .arg("-Archive")
        .arg(archive)
        .arg("-Stage")
        .arg(stage)
        .arg("-ExpectedHash")
        .arg(hash)
        .arg("-ExpectedBytes")
        .arg(bytes.to_string())
        .arg("-Program")
        .arg(program)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(120);
    loop {
        if download::cancelled() || Instant::now() >= deadline {
            let requested = download::cancelled();
            let _ = child.kill();
            let _ = child.wait();
            return Err(if requested {
                "распаковка отменена человеком"
            } else {
                "распаковка превысила 120 секунд; повторите установку"
            }
            .into());
        }
        match child.try_wait() {
            Ok(Some(status)) if status.success() => return Ok(()),
            Ok(Some(_)) => return Err("архив не прошёл безопасную распаковку или проверку Windows x64 PE; установка не выполнена".into()),
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => { let _ = child.kill(); let _ = child.wait(); return Err(e.to_string()); }
        }
    }
}

/// Only our versioned directory, never manual sidecars or PATH files. Caller stops engine first.
pub fn remove(base: &Path, kind: Kind) -> Result<(), String> {
    let _guard = download::acquire()?;
    let dir = directory(base, kind);
    match std::fs::symlink_metadata(&dir) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
        Ok(_) => {}
    }
    if !is_managed(base, kind) {
        return Err(format!("каталог не имеет корректной метки владения ZShelper: {}; автоматическое удаление запрещено", dir.display()));
    }
    std::fs::remove_dir_all(dir).map_err(|e| format!("движок не удалён: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_windows_path_attacks_on_every_host() {
        for name in [
            "../x",
            "..\\x",
            "/x",
            "C:\\x",
            "x:ads",
            "CON.exe",
            "a/LPT1",
            "x.",
            "x ",
            "a//b",
            "a/./b",
            "COM¹.dll",
            "CONIN$",
            "",
        ] {
            assert!(!safe_relative(name), "{name}");
        }
        assert!(safe_relative("bin/llama-server.exe"));
        assert!(safe_relative("llama-server.exe"));
        assert!(safe_relative("Release/whisper-server.exe"));
    }
    #[test]
    fn off_windows_never_installs() {
        if !cfg!(all(windows, target_arch = "x86_64")) {
            for kind in [Kind::Llama, Kind::Whisper] {
                assert!(install(Path::new("unused"), kind).is_err());
            }
        }
    }
    #[test]
    fn kinds_have_distinct_homes_and_programs() {
        // Оба движка живут в своих каталогах: установка одного не должна
        // ни прятать, ни удалять другой.
        let base = Path::new("unused-base");
        assert_ne!(directory(base, Kind::Llama), directory(base, Kind::Whisper));
        assert_eq!(Kind::Llama.spec().program, "llama-server.exe");
        assert_eq!(Kind::Whisper.spec().program, "whisper-server.exe");
        assert_ne!(Kind::Llama.spec().id, Kind::Whisper.spec().id);
    }
    #[test]
    fn only_official_release_prefixes_are_allowed() {
        for kind in [Kind::Llama, Kind::Whisper] {
            assert!(
                allowed_source(kind.spec()),
                "pinned-источник {} должен проходить allowlist",
                kind.spec().id
            );
        }
        let mut stranger = Kind::Llama.spec().clone();
        stranger.url = "https://example.com/llama.zip".into();
        assert!(!allowed_source(&stranger));
        let mut swapped = Kind::Llama.spec().clone();
        swapped.url = Kind::Whisper.spec().url.clone();
        assert!(
            !allowed_source(&swapped),
            "id и источник должны совпадать"
        );
    }
    fn fixture(tag: &str, kind: Kind) -> PathBuf {
        let base =
            std::env::temp_dir().join(format!(
            "zshelper-managed-{tag}-{}-{}",
            kind.spec().id,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&base);
        let dir = directory(&base, kind);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(&kind.spec().program), b"fixture-not-executed").unwrap();
        let sha = models::sha256_file(&dir.join(&kind.spec().program)).unwrap();
        let meta = serde_json::json!({
            "archive_sha256": kind.spec().sha256,
            "program": kind.spec().program,
            "files": [{"path": kind.spec().program, "sha256": sha}]
        });
        std::fs::write(
            dir.join("installed.json"),
            serde_json::to_vec(&meta).unwrap(),
        )
        .unwrap();
        std::fs::write(
            dir.join(OWNER),
            kind.spec().sha256.as_bytes(),
        )
        .unwrap();
        base
    }
    #[test]
    fn restart_detects_managed_install_and_corruption_blocks_launch_check() {
        for kind in [Kind::Llama, Kind::Whisper] {
            let base = fixture("integrity", kind);
            assert!(find(&base, kind).is_some());
            assert!(verify(&base, kind).is_ok());
            std::fs::write(directory(&base, kind).join(&kind.spec().program), b"changed").unwrap();
            assert!(verify(&base, kind).unwrap_err().contains("изменился"));
            std::fs::remove_dir_all(base).unwrap();
        }
    }
    #[test]
    fn malicious_marker_path_is_not_followed() {
        for kind in [Kind::Llama, Kind::Whisper] {
            let base = fixture("traversal", kind);
            let marker = serde_json::json!({
                "archive_sha256": kind.spec().sha256,
                "program": "../llama-server.exe", "files": []
            });
            std::fs::write(
                directory(&base, kind).join("installed.json"),
                serde_json::to_vec(&marker).unwrap(),
            )
            .unwrap();
            assert!(find(&base, kind).is_none());
            assert!(verify(&base, kind).is_err());
            std::fs::remove_dir_all(base).unwrap();
        }
    }
    #[test]
    fn marker_of_the_other_kind_is_rejected() {
        // Запись установки llama не должна опознавать whisper-каталог и наоборот:
        // у каждого вида своя метка владения.
        let base = fixture("cross-kind", Kind::Whisper);
        std::fs::write(
            directory(&base, Kind::Whisper).join(OWNER),
            Kind::Llama.spec().sha256.as_bytes(),
        )
        .unwrap();
        assert!(
            !is_managed(&base, Kind::Whisper),
            "чужая метка не опознаётся"
        );
        assert!(find(&base, Kind::Whisper).is_none());
        let _guard = download::TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        assert!(remove(&base, Kind::Whisper).unwrap_err().contains("метки владения"));
        std::fs::remove_dir_all(base).unwrap();
    }
    #[test]
    fn managed_removal_preserves_manual_runtime_and_models() {
        for kind in [Kind::Llama, Kind::Whisper] {
            let base = fixture("removal", kind);
            std::fs::write(base.join("sidecars/llama-server.exe"), b"manual").unwrap();
            std::fs::write(base.join("model.gguf"), b"weights").unwrap();
            let _test_guard = download::TEST_LOCK
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            remove(&base, kind).unwrap();
            assert!(!directory(&base, kind).exists());
            assert_eq!(
                std::fs::read(base.join("sidecars/llama-server.exe")).unwrap(),
                b"manual"
            );
            assert_eq!(std::fs::read(base.join("model.gguf")).unwrap(), b"weights");
            std::fs::remove_dir_all(base).unwrap();
        }
    }

    #[test]
    fn removing_one_kind_keeps_the_other() {
        let base = fixture("both-kinds", Kind::Llama);
        let whisper_dir = directory(&base, Kind::Whisper);
        std::fs::create_dir_all(&whisper_dir).unwrap();
        std::fs::write(whisper_dir.join(&Kind::Whisper.spec().program), b"fixture").unwrap();
        let _guard = download::TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        remove(&base, Kind::Whisper).unwrap();
        assert!(!whisper_dir.exists(), "whisper удалён");
        assert!(
            directory(&base, Kind::Llama).is_dir(),
            "llama остался на месте"
        );
        assert!(find(&base, Kind::Llama).is_some());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn arbitrary_version_directory_is_not_owned_or_deleted() {
        let base = fixture("not-owned", Kind::Llama);
        std::fs::remove_file(directory(&base, Kind::Llama).join(OWNER)).unwrap();
        assert!(!is_managed(&base, Kind::Llama));
        assert!(find(&base, Kind::Llama).is_none());
        let _guard = download::TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        assert!(remove(&base, Kind::Llama).unwrap_err().contains("метки владения"));
        assert!(directory(&base, Kind::Llama).join("llama-server.exe").is_file());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn broken_manifest_keeps_ownership_for_explicit_recovery() {
        let base = fixture("broken-manifest", Kind::Llama);
        std::fs::write(directory(&base, Kind::Llama).join("installed.json"), b"broken").unwrap();
        assert!(is_managed(&base, Kind::Llama));
        assert!(find(&base, Kind::Llama).is_none());
        assert!(verify(&base, Kind::Llama).is_err());
        let _guard = download::TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        remove(&base, Kind::Llama).unwrap();
        assert!(!directory(&base, Kind::Llama).exists());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn missing_payload_is_not_detected_as_an_engine() {
        let base = fixture("missing-payload", Kind::Llama);
        std::fs::remove_file(directory(&base, Kind::Llama).join("llama-server.exe")).unwrap();
        assert!(is_managed(&base, Kind::Llama));
        assert!(find(&base, Kind::Llama).is_none());
        assert!(
            verify_directory(&directory(&base, Kind::Llama), Kind::Llama, false).is_err()
        );
        std::fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn linked_payload_or_manifest_is_rejected_without_following_it() {
        let base = fixture("linked", Kind::Llama);
        let dir = directory(&base, Kind::Llama);
        std::fs::rename(dir.join("llama-server.exe"), base.join("outside.exe")).unwrap();
        std::os::unix::fs::symlink(base.join("outside.exe"), dir.join("llama-server.exe")).unwrap();
        assert!(find(&base, Kind::Llama).is_none());
        assert!(verify(&base, Kind::Llama).is_err());
        std::fs::remove_file(dir.join("llama-server.exe")).unwrap();
        std::fs::write(dir.join("llama-server.exe"), b"fixture-not-executed").unwrap();
        std::fs::rename(dir.join("installed.json"), base.join("outside.json")).unwrap();
        std::os::unix::fs::symlink(base.join("outside.json"), dir.join("installed.json")).unwrap();
        assert!(find(&base, Kind::Llama).is_none());
        assert!(verify(&base, Kind::Llama).is_err());
        std::fs::remove_dir_all(base).unwrap();
    }

    /// Network and upstream binary execution are opt-in, never part of normal tests.
    #[cfg(all(windows, target_arch = "x86_64"))]
    #[test]
    #[ignore = "downloads pinned runtime + model and executes runtime; explicit consent required"]
    fn pinned_runtime_conversation_smoke() {
        use std::time::{Duration, SystemTime, UNIX_EPOCH};
        assert!(
            std::env::var("ZSHELPER_RUNTIME_SMOKE").is_ok_and(|v| v == "1"),
            "explicit ZSHELPER_RUNTIME_SMOKE=1 consent required"
        );
        struct Work(std::path::PathBuf);
        impl Drop for Work {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        struct Engine(crate::server::Server);
        impl Drop for Engine {
            fn drop(&mut self) {
                let _ = self.0.stop();
            }
        }
        let work = Work(std::env::temp_dir().join(format!(
                "zshelper-live-smoke-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            )));
        std::fs::create_dir(&work.0).unwrap();
        let memory = crate::memory::Memory::open(work.0.join("memory.db")).unwrap();
        let model = &readiness::catalog().model;
        let models_dir = work.0.join("models");
        let downloaded = download::download_sized(
            &models_dir,
            &model.file,
            &model.url,
            Some(&model.sha256),
            Some(model.bytes),
            download::MAX_MODEL_BYTES,
            &memory,
        )
        .expect("pinned model download and hash verification");
        assert!(downloaded.verified);
        println!("RUNTIME_SMOKE model bytes and SHA256 verified");
        let installed = install(&work.0, Kind::Llama)
            .expect("pinned runtime download and atomic installation");
        verify(&work.0, Kind::Llama).expect("installed payload SHA256 inventory");
        println!("RUNTIME_SMOKE runtime installed and verified");
        let port = crate::server::free_port().unwrap();
        let spec = crate::llama::spec(
            Path::new(&installed.program),
            &models_dir.join(&model.file),
            port,
        );
        let mut engine = Engine(
            crate::server::Server::start(
                &spec,
                &work.0.join("engine.log"),
                Duration::from_secs(120),
            )
            .expect("runtime startup and /health"),
        );
        println!("RUNTIME_SMOKE process started; loopback health OK");
        let body = crate::llm::chat_body("Ответь одним словом: готово", "local");
        let answer =
            crate::llm::ask(port, &body, Duration::from_secs(120)).expect("safe test question");
        assert!(
            !answer.trim().is_empty(),
            "empty answer is not a conversation"
        );
        println!("RUNTIME_SMOKE nonempty text response received");
        engine.0.stop().expect("stop runtime");
        assert!(!engine.0.is_alive());
        remove(&work.0, Kind::Llama).expect("remove managed runtime after stopping");
        assert!(find(&work.0, Kind::Llama).is_none());
        assert!(
            models_dir.join(&model.file).is_file(),
            "runtime removal must preserve model"
        );
        println!("RUNTIME_SMOKE process stopped; managed runtime removed; model preserved");
    }
}
