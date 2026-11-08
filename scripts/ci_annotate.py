#!/usr/bin/env python3
"""
Превращает вывод rustc/clippy в аннотации GitHub Actions.

Зачем: логи упавших джобов не всегда доступны (в закрытых сетях, в песочнице
разработчика, просто из-за сбоя хранилища логов), а аннотации к проверке — это
отдельный API и они читаются всегда. Плюс ошибка сразу привязана к файлу и
строке в интерфейсе ревью.

Формат rustc:

    error[E0432]: unresolved import `x`
      --> src/lib.rs:3:5
       |
    3  | use x::y;
       |     ^^^^

Скрипт берёт заголовок диагностики и её `-->` и печатает workflow-команду
`::error file=…,line=…,col=…::сообщение`.

Usage:
    python3 scripts/ci_annotate.py clippy.log [--max 20]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HEADER = re.compile(r"^(error|warning)(\[[A-Za-z0-9]+\])?: (?P<msg>.+)$")
LOCATION = re.compile(r"^\s*-->\s+(?P<path>[^:]+):(?P<line>\d+):(?P<col>\d+)\s*$")


def annotate(log: str, limit: int = 20) -> list[str]:
    lines = log.splitlines()
    out: list[str] = []

    for index, line in enumerate(lines):
        header = HEADER.match(line.strip())
        if not header:
            continue

        message = header.group("msg").strip()
        location = None
        for probe in lines[index + 1 : index + 4]:
            found = LOCATION.match(probe)
            if found:
                location = found
                break

        if location:
            path = location.group("path").replace("\\", "/")
            out.append(
                f"::error file={path},line={location.group('line')},"
                f"col={location.group('col')}::{message}"
            )
        else:
            out.append(f"::error::{message}")

        if len(out) >= limit:
            out.append("::notice::остальные ошибки не показаны — см. полный лог джобы")
            break

    return out


def main() -> int:
    argv = sys.argv[1:]
    if not argv:
        print("usage: ci_annotate.py <log> [--max N]", file=sys.stderr)
        return 2

    limit = 20
    if "--max" in argv:
        limit = int(argv[argv.index("--max") + 1])

    path = Path(argv[0])
    if not path.exists():
        print(f"ci_annotate: нет файла {path}")
        return 0

    text = path.read_text(encoding="utf-8", errors="replace")
    annotations = annotate(text, limit)

    if not annotations:
        print("ci_annotate: диагностик не найдено (сборка прошла или упала до компиляции)")
        return 0

    for item in annotations:
        print(item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
