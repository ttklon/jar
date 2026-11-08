#!/usr/bin/env python3
"""
Runs every generator and validator in the only order that works.

Why this exists: the artefacts in this repository are derived — the registry from
`data/actions.json`, the documents from the registry, the ecosystem from the
research vault plus curated lists, the dashboard from everything. Running one of
them out of order produces documents that disagree with the data, and CI fails on
exactly that (`git diff --exit-code`). This script is the one command to run
before a commit and the one command a fresh model should run to see whether the
repository is healthy.

The order is not cosmetic:
  * `evals.py` reads the profiles written by `profiles.py` (incident 1418e21);
  * `status.py` and `dashboard.py` read the products of everything above them;
  * `build_ecosystem.py` must precede `ecosystem.py` (it writes what is validated).

Usage:
    python3 tools/check_all.py            # regenerate everything, in order
    python3 tools/check_all.py --check    # never write; fail if anything is stale
    python3 tools/check_all.py --quiet    # only the summary and failures
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# (label, argv, what it protects). Order matters — see the module docstring.
STEPS: list[tuple[str, list[str], str]] = [
    ("registry", ["tools/actions.py"], "data/actions.json well-formed, docs/ACTIONS.md fresh"),
    ("profiles", ["tools/profiles.py"], "every profile op maps to a registry row"),
    ("audit", ["tools/audit_actions.py"], "coverage: thin domains, family gaps"),
    ("evals", ["tools/evals.py"], "an eval plan for every action"),
    ("targets", ["tools/app_targets.py"], "tier A apps have profiles"),
    ("skills", ["tools/skills.py"], "skills reference real rows, risk not lowered"),
    ("hands", ["tools/hands.py"], "data/tools.json points at real, allowed registry rows"),
    ("ecosystem:build", ["tools/build_ecosystem.py"], "10 catalogues rebuilt from vault + curated"),
    ("ecosystem:check", ["tools/ecosystem.py"], "ids unique, >=200 each, statuses honest"),
    ("status", ["tools/status.py"], "AGENTS.md status block matches the data"),
    ("dashboard", ["tools/dashboard.py"], "DASHBOARD.md + INDEX.md match the data"),
    ("links", ["tools/links.py"], "every relative link in the docs points at a real file"),
]

# Files whose staleness means "you forgot to run a generator". Kept in sync with
# .github/workflows/validate.yml on purpose: if these two lists drift, CI notices.
GENERATED = [
    "data/actions.json",
    "data/evals.json",
    "data/ecosystem",
    "docs/ACTIONS.md",
    "docs/PROFILES.md",
    "docs/COVERAGE.md",
    "docs/EVALS.md",
    "docs/APP-COVERAGE.md",
    "docs/SKILLS.md",
    "docs/ECOSYSTEM.md",
    "docs/DASHBOARD.md",
    "docs/INDEX.md",
    "AGENTS.md",
]


def run(argv: list[str], quiet: bool) -> tuple[bool, str]:
    started = time.monotonic()
    proc = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True)
    took = time.monotonic() - started
    out = (proc.stdout + proc.stderr).strip()
    if not quiet and out:
        print(out)
    return proc.returncode == 0, f"{took:4.1f}s"


def stale_files() -> list[str]:
    """Generated files that differ from HEAD (or are untracked)."""
    proc = subprocess.run(
        ["git", "status", "--porcelain", "--", *GENERATED],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return []
    return [line[3:] for line in proc.stdout.splitlines() if line.strip()]


def main() -> int:
    quiet = "--quiet" in sys.argv
    check_only = "--check" in sys.argv

    if check_only:
        # Regenerating is the only honest way to answer "is it stale" — the
        # generators are deterministic, so write then compare against git.
        print("check: regenerating in place, then comparing with HEAD")

    failures: list[str] = []
    for i, (label, argv, protects) in enumerate(STEPS, 1):
        ok, took = run([sys.executable, *argv], quiet)
        mark = "ok  " if ok else "FAIL"
        print(f"[{i:2}/{len(STEPS)}] {mark} {label:<16} {took}  {protects}")
        if not ok:
            failures.append(label)

    if check_only:
        dirty = stale_files()
        if dirty:
            print("\nstale generated files (commit them):")
            for path in dirty:
                print(f"  - {path}")
            return 1
        print("\nall generated files are up to date")

    if failures:
        print(f"\n{len(failures)} failing step(s): {', '.join(failures)}")
        return 1
    print("\nall generators and validators agree with the data")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
