#!/usr/bin/env python3
"""
Checks that every relative markdown link in the documentation points at a real file.

Why this exists: the documents cross-reference each other heavily (`BUILD-GUIDE` →
`DECISION-STACK` → `RUNTIME` …). A rename or a new document with a wrong relative path
turns the repository into a maze for the next reader — which, in this project, is often
a model with no context and no way to ask. The check is cheap and catches exactly that.

Fenced code blocks and inline code are stripped before scanning, so pseudo-links in
diagrams (`plan(step) → step[../data/x]`) never produce false positives.

Usage:
    python3 tools/links.py            # exit 1 if anything is broken
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

TARGETS = (
    [ROOT / "README.md", ROOT / "AGENTS.md", ROOT / "research" / "README.md"]
    + sorted((ROOT / "docs").glob("*.md"))
    + sorted((ROOT / "research" / "notes").glob("*.md"))
)

FENCE = re.compile(r"```.*?```", re.S)
INLINE = re.compile(r"`[^`\n]*`")
LINK = re.compile(r"\]\(([^)\s]+?)(?:#[^)]*)?\)")


def scan(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    text = FENCE.sub("", text)
    text = INLINE.sub("", text)
    broken: list[str] = []
    for match in LINK.finditer(text):
        link = match.group(1).strip()
        if not link or link.startswith(("http://", "https://", "mailto:", "#")):
            continue
        if link.startswith("//"):  # protocol-relative
            continue
        if not (path.parent / link).resolve().exists():
            broken.append(f"{path.relative_to(ROOT)}: {link}")
    return broken


def main() -> int:
    broken: list[str] = []
    for path in TARGETS:
        if path.exists():  # documents may legitimately be absent in a sparse checkout
            broken += scan(path)

    if broken:
        print(f"links: {len(broken)} битых ссылок")
        for item in broken:
            print(f"  - {item}")
        return 1
    print(f"links: {len(TARGETS)} документов, битых ссылок нет")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
