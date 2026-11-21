#!/usr/bin/env python3
"""
Typecheck that is not fooled by its own cache.

Why this exists: `tsc -b` writes `tsconfig.tsbuildinfo` and, on the next run,
trusts it. Twice now that has cost a CI round trip: locally the check printed
nothing and exited 0, in CI (no cache, always fresh) `noUnusedLocals` found an
unused import and failed. A check that says "clean" when it has not looked is
worse than no check — it teaches you to trust a green line.

So: remove the build info first, then run `tsc -b`. The cost is ~8 seconds; the
alternative is a 6-minute CI round trip every few commits.

Usage:
    python3 tools/ts_typecheck.py             # exit 1 on type errors
    python3 tools/ts_typecheck.py --quiet
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    quiet = "--quiet" in sys.argv

    # Кэш удаляется ДО запуска: именно он и был причиной ложного «чисто».
    for stale in list(ROOT.glob("tsconfig*.tsbuildinfo")) + list(ROOT.glob(".tsbuildinfo")):
        stale.unlink(missing_ok=True)

    tsc = ROOT / "node_modules" / ".bin" / ("tsc.cmd" if sys.platform == "win32" else "tsc")
    if not tsc.exists():
        print("нет node_modules/.bin/tsc — выполните npm ci")
        return 1

    proc = subprocess.run(
        [str(tsc), "-b", "--pretty", "false"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    out = (proc.stdout + proc.stderr).strip()

    if proc.returncode != 0:
        print(out or "tsc завершился с ошибками")
        return 1

    if not quiet:
        print("типы в порядке (кэш сброшен, проверка настоящая)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
