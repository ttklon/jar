#!/usr/bin/env python3
"""
Catches the char literal that ate a newline — the mistake that cost two CI rounds.

What happened. A line that should have read

    body.find("\\n}")        # backslash and n: two characters

was written by a script as

    body.find('\n}')         # a real newline inside a char literal

Rust rejects it ("character literal may only contain one codepoint"), but only
after a full CI round trip. Reading the source does not help: in an editor both
look short and grey.

Why this is the fourth version. Counting quotes per line: 135 false alarms.
"Line ends with a quote": every legitimate multi-line string. "Apostrophe at end
of line plus apostrophe on the next": every PowerShell script embedded as a raw
string, because `$x = ''` is perfectly normal there.

The rule that finally works, and why it cannot be fooled: **an apostrophe
immediately followed by a newline, seen in CODE**. So the scanner walks the file
and knows three states — code, normal string, raw string (any `r#*"` … `"#*`) —
plus comments. Only in code is `'` + newline even possible as a mistake:

    'a          lifetime — next char is a letter
    'static     lifetime — next char is a letter
    'x'         char     — next char is the payload
    '\\''        char     — next char is a backslash
    '\\n' + newline        ← broken: no payload, no closing quote, nothing

Every PowerShell apostrophe lives inside a raw string and is skipped. Every
legitimate multi-line string is skipped. `--selftest` proves both directions.

Usage:
    python3 tools/rust_strings.py             # exit 1 if anything found
    python3 tools/rust_strings.py --selftest  # prove the checker can fail
    python3 tools/rust_strings.py --quiet
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src-tauri" / "src"


def code_positions(text: str) -> list[bool]:
    """
    Для каждой позиции: код это или содержимое строки/комментария.

    Состояния: обычный код, строчный комментарий, блочный комментарий, строка в
    кавычках, raw-строка `r#"…"#` с любым числом решёток.
    """
    mask = [False] * len(text)
    index = 0
    size = len(text)

    while index < size:
        # Строчный комментарий.
        if text.startswith("//", index):
            while index < size and text[index] != "\n":
                index += 1
            continue

        # Блочный комментарий (вложенный — Rust это разрешает).
        if text.startswith("/*", index):
            depth = 0
            while index < size:
                if text.startswith("/*", index):
                    depth += 1
                    index += 2
                    continue
                if text.startswith("*/", index):
                    depth -= 1
                    index += 2
                    if depth == 0:
                        break
                    continue
                index += 1
            continue

        # Raw-строка: `r"…"`, `r#"…"#`, `r##"…"##`, и байтовые `br#"…"#`.
        raw_start = index
        if text.startswith("b", index) and index + 1 < size:
            raw_start = index + 1
        if text.startswith("r", raw_start):
            cursor = raw_start + 1
            hashes = 0
            while cursor < size and text[cursor] == "#":
                hashes += 1
                cursor += 1
            if cursor < size and text[cursor] == '"':
                closing = '"' + "#" * hashes
                end = text.find(closing, cursor + 1)
                index = size if end < 0 else end + len(closing)
                continue

        # Обычная строка: `"…"` с экранированием.
        if text[index] == '"':
            index += 1
            while index < size:
                if text[index] == "\\":
                    index += 2
                    continue
                if text[index] == '"':
                    index += 1
                    break
                index += 1
            continue

        mask[index] = True
        index += 1

    return mask


def scan_text(text: str) -> list[tuple[int, str]]:
    """Строки, где апостроф в КОДЕ прямо перед переводом строки."""
    mask = code_positions(text)
    lines = text.splitlines()
    found: list[tuple[int, str]] = []

    for index in range(len(text) - 1):
        if not mask[index] or text[index] != "'":
            continue
        if text[index + 1] != "\n":
            continue

        # Апостроф в коде перед переносом бывает и законным: это ЗАКРЫВАЮЩАЯ
        # кавычка символьного литерала, который открылся на этой же строке
        # (`b':'`, `'_'`). Отличить легко: внутри строки есть парный апостроф,
        # открытый в коде.
        line_start = text.rfind("\n", 0, index) + 1
        if "\'" in text[line_start:index]:
            continue

        line = text.count("\n", 0, index) + 1
        snippet = lines[line - 1].strip()[:90] if line - 1 < len(lines) else ""
        found.append((line, snippet))

    return found


def scan(path: Path) -> list[tuple[int, str]]:
    return scan_text(path.read_text(encoding="utf-8"))


def selftest() -> int:
    """Доказательство в обе стороны: ловит ошибку, молчит на законном коде."""
    cases = {
        "съеденный литерал": ("fn f() {\n    let x = s.find('\n}').expect(\"x\");\n}\n", 1),
        "время жизни": ("struct S<'a> {\n    p: &'a str,\n}\n", 0),
        "static": ("pub fn all() -> &'static [T] {\n    &T\n}\n", 0),
        "экранированный апостроф": ("if c == '\\'' {\n    ok();\n}\n", 0),
        "powershell в raw-строке": ('const S: &str = r#"$x = \'\'\nWrite-Output \'\'\n"#;\n', 0),
        "многострочная строка": ('const T: &str = concat!(\n    "первая",\n    "вторая",\n);\n', 0),
        # Закрывающая кавычка короткого литерала в конце строки — законна, и её
        # нельзя путать с открытой, которая съела перенос.
        "короткий литерал": ("let a = b':';\nlet b = '_';\n", 0),
    }

    ok = True
    for name, (text, want) in cases.items():
        got = len(scan_text(text))
        mark = "ok" if got == want else "ПРОВАЛ"
        if got != want:
            ok = False
        print(f"  {name:24} ждали {want}, нашли {got}  {mark}")

    print("проверка работает" if ok else "ПРОВЕРКА СЛОМАНА")
    return 0 if ok else 1


def main() -> int:
    quiet = "--quiet" in sys.argv
    if "--selftest" in sys.argv:
        return selftest()

    bad = 0

    if not SRC.exists():
        print(f"нет папки {SRC}")
        return 1

    for path in sorted(SRC.rglob("*.rs")):
        for line, snippet in scan(path):
            bad += 1
            print(f"{path.relative_to(ROOT)}:{line}: апостроф прямо перед переносом — {snippet}")

    if bad:
        print(f"\n{bad} шт.: похоже, литерал съел перевод строки (нужно \\n, а не перенос)")
        return 1

    if not quiet:
        print("символьные литералы в Rust не содержат переводов строки")
    return 0


if __name__ == "__main__":
    sys.exit(main())
