#!/usr/bin/env python3
"""
Превращает хвост лога в аннотации GitHub Actions.

Зачем: логи джоб в этом окружении недоступны (`gh run view --log-failed` упирается
в закрытое хранилище), а аннотации читаются через API всегда. Аннотация ограничена
по длине, поэтому лог режется на куски и каждая строка уходит отдельным сообщением.

Usage:
    python3 scripts/ci_log_annotate.py build.log --title "tauri build" --tail 80

Печатает `::error title=…::строка` — GitHub складывает это в аннотации шага.
"""

from __future__ import annotations

import argparse
import sys


def escape(text: str) -> str:
    """Экранирование по правилам workflow-команд GitHub."""
    return (
        text.replace("%", "%25")
        .replace("\r", "")
        .replace("\n", "%0A")
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("log", help="файл с выводом команды")
    parser.add_argument("--title", default="лог", help="заголовок аннотации")
    parser.add_argument("--tail", type=int, default=80, help="сколько последних строк показать")
    parser.add_argument("--chunk", type=int, default=600, help="длина куска строки")
    args = parser.parse_args()

    try:
        with open(args.log, encoding="utf-8", errors="replace") as handle:
            lines = [line.rstrip() for line in handle.readlines()]
    except FileNotFoundError:
        print(f"::error title={escape(args.title)}::лог не создан — команда не запускалась")
        return 0

    tail = [line for line in lines if line.strip()][-args.tail :]
    if not tail:
        print(f"::error title={escape(args.title)}::лог пуст")
        return 0

    print(f"::error title={escape(args.title)}::{escape(str(len(lines)))} строк, показываю хвост")
    for line in tail:
        for start in range(0, len(line), args.chunk):
            piece = line[start : start + args.chunk]
            print(f"::error title={escape(args.title)}::{escape(piece)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
