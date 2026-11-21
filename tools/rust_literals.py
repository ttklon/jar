#!/usr/bin/env python3
"""
Catches the Rust mistake we made three times: non-ASCII inside a byte string.

Why a separate checker instead of just being careful. `clippy::non_ascii_literal`
is an *error* here, and it fires on `b"текст"` — a byte string, where every
non-ASCII character is a bug anyway, because the bytes depend on the file
encoding, not on what the author meant. It bit us in `memory.rs` twice and in
`backup.rs` once; each time the fix took a CI round trip (~5 minutes) and each
time the mistake was in a *test*, not in the product — exactly the kind of thing
a two-second local check should catch.

What is checked, precisely:
  * `b"..."` and `b'...'` — every non-ASCII character is reported;
  * `br"..."` / `br#"..."#` — same;
  * NOT plain `"..."`: Cyrillic in ordinary strings is the whole point of this
    codebase (messages are Russian), and flagging it would be noise.

Usage:
    python3 tools/rust_literals.py            # exit 1 if anything found
    python3 tools/rust_literals.py --quiet
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src-tauri" / "src"

# b"..." / br"..." / br#"..."# — the opening quote is enough to find the start.
BYTE_LITERAL = re.compile(r'(?<![\w"])b(r?)("|#+")([^"]*?)("|#+")', re.DOTALL)


def is_ascii(text: str) -> bool:
    return all(ord(char) < 128 for char in text)


def scan(path: Path) -> list[tuple[int, str]]:
    """Line number and offending byte string literal."""
    text = path.read_text(encoding="utf-8")
    found: list[tuple[int, str]] = []

    for match in BYTE_LITERAL.finditer(text):
        body = match.group(3)
        if is_ascii(body):
            continue
        line = text.count("\n", 0, match.start()) + 1
        found.append((line, match.group(0)[:60]))

    return found


def main() -> int:
    quiet = "--quiet" in sys.argv
    bad = 0

    if not SRC.exists():
        print(f"нет папки {SRC}")
        return 1

    for path in sorted(SRC.rglob("*.rs")):
        for line, literal in scan(path):
            bad += 1
            print(f"{path.relative_to(ROOT)}:{line}: не-ASCII в байтовой строке — {literal}")

    if bad:
        print(f"\n{bad} шт.: байтовая строка должна быть ASCII (win: b\"stale\", не b\"чужой\")")
        return 1

    if not quiet:
        print("байтовые строки в Rust — только ASCII")
    return 0


if __name__ == "__main__":
    sys.exit(main())
