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
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def escape(text: str) -> str:
    """Workflow-команды не терпят переводов строк и процентов."""
    return text.replace("%", "%25").replace("\r", "").replace("\n", " | ")[:3500]


def annotate(log: str, limit: int = 20) -> list[str]:
    lines = ANSI.sub("", log).splitlines()
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

        # Причина обычно в следующих строках («Caused by:», вызовы сборки,
        # текст ошибки build.rs). Без неё аннотация бесполезна.
        causes: list[str] = []
        for probe in lines[index + 1 : index + 14]:
            stripped = probe.strip()
            if not stripped:
                if causes:
                    break
                continue
            if HEADER.match(stripped) or LOCATION.match(probe) or stripped.startswith("|"):
                continue
            # Служебные строки cargo/сборки — шум, настоящая причина ниже.
            if stripped.startswith(("cargo:", "--- stdout", "--- stderr", "warning: build failed")):
                continue
            if stripped.startswith(("Caused by", "note:", "help:", "error:", "warning:")) or (
                causes and probe.startswith((" ", "\t"))
            ):
                causes.append(stripped)
            elif causes:
                break
            if len(causes) >= 8 or sum(len(c) for c in causes) > 1200:
                break
        if causes:
            message = f"{message} — {' / '.join(causes)}"

        if location:
            path = location.group("path").replace("\\", "/")
            out.append(
                f"::error file={path},line={location.group('line')},"
                f"col={location.group('col')}::{escape(message)}"
            )
        else:
            out.append(f"::error::{escape(message)}")

        if len(out) >= limit:
            out.append("::notice::остальные ошибки не показаны — см. полный лог джобы")
            break

    return out


def main() -> int:
    # Windows-консоль по умолчанию в cp1252, а сообщения rustc у нас русские:
    # без этого скрипт падал на печати вместо того, чтобы показать ошибки.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    argv = sys.argv[1:]
    if not argv:
        print("usage: ci_annotate.py <log> [--max N]", file=sys.stderr)
        return 2

    limit = 20
    if "--max" in argv:
        limit = int(argv[argv.index("--max") + 1])

    raw = "--raw" in argv

    path = Path(argv[0])
    if not path.exists():
        print(f"ci_annotate: нет файла {path}")
        return 0

    text = path.read_text(encoding="utf-8", errors="replace")

    if raw:
        # Режим «отдать текст как есть»: используется для диффов форматирования,
        # которые нельзя прочитать в логах, но можно применить руками.
        flat = escape(text)
        for start in range(0, len(flat), 3000):
            print(f"::error title=fmt-diff::{flat[start:start + 3000]}")
        return 0

    annotations = annotate(text, limit)

    if not annotations:
        # Диагностик нет — значит упало до компиляции (нет cargo, не скачались
        # зависимости, битый манифест). Показываем хвост лога как аннотацию:
        # логи джоб доступны не всегда, а это единственный канал наружу.
        tail = " | ".join(line for line in text.splitlines() if line.strip())[-3500:]
        if tail:
            print(f"::error title=clippy-log::{escape(tail)}")
        else:
            print("::error::лога нет: сборка не дошла до компилятора")
        return 0

    for item in annotations:
        print(item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
