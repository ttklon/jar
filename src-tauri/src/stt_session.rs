//! Single-flight ASR ownership. IDs name requests, never arbitrary system PIDs.
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const CANCELLED: &str = "локальное распознавание отменено";

#[derive(Default)]
pub struct Ticket {
    pub cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
    #[cfg(test)]
    fail_stop: AtomicBool,
}

impl Ticket {
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) {
            Err(CANCELLED.into())
        } else {
            Ok(())
        }
    }

    pub fn attach(&self, mut child: Child) -> Result<(), String> {
        let mut slot = match self.child.lock() {
            Ok(slot) => slot,
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("владелец процесса ASR недоступен".into());
            }
        };
        if self.check().is_err() || slot.is_some() {
            let _ = child.kill();
            let _ = child.wait();
            return Err(CANCELLED.into());
        }
        *slot = Some(child);
        Ok(())
    }

    pub fn exited(&self) -> Result<bool, String> {
        let mut child = self
            .child
            .lock()
            .map_err(|_| "владелец процесса ASR недоступен")?;
        child
            .as_mut()
            .ok_or("процесс ASR не запущен")?
            .try_wait()
            .map(|status| status.is_some())
            .map_err(|e| e.to_string())
    }

    /// Set the flag before taking the process lock: a racing spawn cannot escape.
    pub fn stop(&self) -> Result<(), String> {
        self.cancelled.store(true, Ordering::SeqCst);
        #[cfg(test)]
        if self.fail_stop.load(Ordering::SeqCst) {
            return Err("injected ASR cleanup failure".into());
        }
        let mut child = self
            .child
            .lock()
            .map_err(|_| "владелец процесса ASR недоступен")?;
        if let Some(child) = child.as_mut() {
            if child.try_wait().map_err(|e| e.to_string())?.is_none() {
                child
                    .kill()
                    .map_err(|e| format!("процесс ASR не остановлен: {e}"))?;
            }
            child
                .wait()
                .map_err(|e| format!("процесс ASR не освобождён: {e}"))?;
        }
        Ok(())
    }
}

struct Pending {
    id: String,
    created: Instant,
    started: bool,
    finished: bool,
    ticket: Arc<Ticket>,
}

#[derive(Default)]
pub struct Requests {
    next: AtomicU64,
    slot: Mutex<Option<Pending>>,
}

impl Requests {
    /// Reserve before sending audio. Aborted reservations cannot later spawn a process.
    pub fn reserve(&self) -> Result<String, String> {
        let mut slot = self.slot.lock().map_err(|_| "очередь ASR недоступна")?;
        if slot
            .as_ref()
            .is_some_and(|p| !p.started && p.created.elapsed() >= Duration::from_secs(30))
        {
            *slot = None;
        }
        if slot.is_some() {
            return Err("ASR ещё завершает предыдущий запрос; повторите запись".into());
        }
        let id = self.next.fetch_add(1, Ordering::SeqCst).to_string();
        *slot = Some(Pending {
            id: id.clone(),
            created: Instant::now(),
            started: false,
            finished: false,
            ticket: Arc::default(),
        });
        Ok(id)
    }

    pub fn acquire(self: &Arc<Self>, id: &str) -> Result<Lease, String> {
        let mut slot = self.slot.lock().map_err(|_| "очередь ASR недоступна")?;
        let pending = slot
            .as_mut()
            .filter(|p| p.id == id && !p.started)
            .ok_or("запрос ASR отменён, устарел или уже запущен")?;
        if pending.created.elapsed() >= Duration::from_secs(30) {
            *slot = None;
            return Err("резерв ASR истёк; повторите запись".into());
        }
        pending.ticket.check()?;
        pending.started = true;
        Ok(Lease {
            owner: self.clone(),
            id: id.into(),
            ticket: pending.ticket.clone(),
        })
    }

    pub fn cancel(&self, id: &str) -> Result<(), String> {
        let ticket = {
            let mut slot = self.slot.lock().map_err(|_| "очередь ASR недоступна")?;
            let Some(pending) = slot.as_ref().filter(|p| p.id == id) else {
                return Ok(());
            };
            let ticket = pending.ticket.clone();
            if !pending.started {
                *slot = None;
            }
            ticket
        };
        ticket.stop()?;
        let mut slot = self.slot.lock().map_err(|_| "очередь ASR недоступна")?;
        if slot.as_ref().is_some_and(|p| p.id == id && p.finished) {
            *slot = None;
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        let ticket = self
            .slot
            .lock()
            .ok()
            .and_then(|s| s.as_ref().map(|p| p.ticket.clone()));
        if let Some(ticket) = ticket {
            if let Err(error) = ticket.stop() {
                tracing::warn!(%error, "ASR shutdown");
            }
        }
    }
}

pub struct Lease {
    owner: Arc<Requests>,
    id: String,
    pub ticket: Arc<Ticket>,
}

impl Drop for Lease {
    fn drop(&mut self) {
        let stopped = self.ticket.stop();
        if let Err(error) = &stopped {
            tracing::warn!(%error, "ASR cleanup");
        }
        if let Ok(mut slot) = self.owner.slot.lock() {
            if let Some(pending) = slot.as_mut().filter(|p| p.id == self.id) {
                if stopped.is_ok() {
                    *slot = None;
                } else {
                    // Never lose the process handle or permit another model when
                    // termination failed. A same-ID cancel or shutdown may retry.
                    pending.finished = true;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_reservation_cannot_spawn_and_stale_cancel_cannot_stop_next() {
        let owner = Arc::new(Requests::default());
        let old = owner.reserve().unwrap();
        owner.cancel(&old).unwrap();
        assert!(owner.acquire(&old).is_err());
        let new = owner.reserve().unwrap();
        let lease = owner.acquire(&new).unwrap();
        owner.cancel(&old).unwrap();
        assert!(lease.ticket.check().is_ok());
        assert!(owner.reserve().is_err());
        assert!(owner.acquire(&new).is_err());
        owner.cancel(&new).unwrap();
        assert!(lease.ticket.check().is_err());
        assert!(owner.reserve().is_err(), "worker still owns the lease");
        drop(lease);
        assert!(owner.reserve().is_ok());
    }

    #[test]
    fn failed_cleanup_keeps_ownership_and_blocks_new_work_until_retry() {
        let owner = Arc::new(Requests::default());
        let id = owner.reserve().unwrap();
        let lease = owner.acquire(&id).unwrap();
        let ticket = lease.ticket.clone();
        ticket.fail_stop.store(true, Ordering::SeqCst);
        drop(lease);
        assert!(owner.reserve().is_err());
        assert!(owner.cancel(&id).is_err());
        assert!(owner.reserve().is_err());
        ticket.fail_stop.store(false, Ordering::SeqCst);
        owner.cancel(&id).unwrap();
        assert!(owner.reserve().is_ok());
    }

    #[test]
    fn expired_reservations_are_reclaimed_but_running_work_is_not() {
        let owner = Arc::new(Requests::default());
        let old = owner.reserve().unwrap();
        owner.slot.lock().unwrap().as_mut().unwrap().created =
            Instant::now() - Duration::from_secs(31);
        assert!(owner.acquire(&old).is_err());
        let new = owner.reserve().unwrap();
        let lease = owner.acquire(&new).unwrap();
        owner.slot.lock().unwrap().as_mut().unwrap().created =
            Instant::now() - Duration::from_secs(31);
        assert!(owner.reserve().is_err());
        owner.shutdown();
        assert!(lease.ticket.check().is_err());
    }

    #[cfg(windows)]
    #[test]
    fn cancellation_kills_and_reaps_only_the_owned_process() {
        use std::process::{Command, Stdio};
        let owner = Arc::new(Requests::default());
        let id = owner.reserve().unwrap();
        let lease = owner.acquire(&id).unwrap();
        let child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 60",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        lease.ticket.attach(child).unwrap();
        let before = Instant::now();
        owner.cancel(&id).unwrap();
        assert!(lease.ticket.exited().unwrap());
        assert!(before.elapsed() < Duration::from_secs(5));
        drop(lease);
        let next = owner.reserve().unwrap();
        let lease = owner.acquire(&next).unwrap();
        owner.cancel(&id).unwrap();
        assert!(lease.ticket.check().is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn cancelled_ticket_rejects_and_reaps_a_racing_spawn() {
        use std::process::Command;
        let ticket = Ticket::default();
        ticket.stop().unwrap();
        let child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 60",
            ])
            .spawn()
            .unwrap();
        assert!(ticket.attach(child).is_err());
        assert!(ticket.child.lock().unwrap().is_none());
    }
}
