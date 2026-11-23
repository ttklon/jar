#!/usr/bin/env python3
"""Слово «готово» не появляется без области проверки (шаг 5).

Дефект, который это лечит. В документах и на экранах слово «готово» стояло само
по себе — и один раз уже ввело в заблуждение: «готово» не говорит, **где** это
проверено, поэтому его нельзя ни опровергнуть, ни повторить. Генератор проверяет
текст, а не память автора.

Правило, а не запрет. Слово «готово» — законное, когда оно подпись к **сделанному
действию** («готово» рядом с результатом: `ok`, `stageDone`, `stepOk`) — там
область проверки и есть сам результат, и человек видит его на экране. Нельзя,
когда оно **состояние системы**: «всё готово», «приложение готово», «установка
готово» — это утверждение о мире, и оно обязано называть, где проверено.

Поэтому проверка идёт по словарю, а не по всему тексту:
  * строки **статусов** (`ok`, `stageDone`, `stepOk`, `done`, `finished`) — можно;
  * строки **утверждений о мире** (с `Lead`, `Title`, `ready`, `status`) — только
    рядом с областью: «на этой машине», «здесь», «проверено», «Windows», дата;
  * всё остальное — можно, если это не «всё готово» и не «N готово».

Почему не «запретить везде». Запрет везде заставил бы переписывать честные
подписи к действиям и ничего не сказал бы о том, что действительно опасно:
утверждении «система готова». Проверка должна указывать на опасное место, иначе
её отключат через неделю.

Запускается из `tools/check_all.py`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT = ROOT / "src" / "i18n" / "ru.ts"

# Строки-статусы: «готово» здесь — подпись к сделанному, и результат виден рядом.
STATUS_KEYS = ("ok", "done", "finished", "stageDone", "stepOk", "planStepOk", "complete")

# Строки-утверждения: «готово» здесь — про мир, и обязано называть место.
ASSERTION_MARKERS = ("Lead", "Title", "ready", "Ready", "status", "Status")

# Область проверки: слова, которыми называется, где это проверено.
SCOPE = (
    "на этой машине",
    "здесь",
    "проверено",
    "проверен",
    "Windows",
    "CI",
    "прогон",
    "тест",
)

# Опасные обороты: обобщение без места. Даже в подписи статуса они не годятся.
DANGEROUS = re.compile(r"(всё|все)\s+готово|готово\s+(ко|к)\s+", re.IGNORECASE)


def key_of(line: str) -> str | None:
    """Имя строки словаря в начале `имя: "..."` или `имя:` перед продолжением."""
    match = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", line)
    return match.group(1) if match else None


def has_scope(text: str) -> bool:
    return any(word in text for word in SCOPE)


def findings() -> list[str]:
    """Список нарушений: файл:строка — почему."""
    text = DICT.read_text(encoding="utf-8")
    lines = text.split("\n")
    problems: list[str] = []

    for index, line in enumerate(lines):
        # Именно слово «готово», а не «готовность»: готовность — это свойство,
        # которое ещё будет проверяться, а не утверждение «всё сделано».
        if not re.search(r"готово\b", line, re.IGNORECASE):
            continue
        key = key_of(line)

        # Опасный оборот ловим всегда: он утверждает про мир даже под видом
        # подписи, и именно он вводил в заблуждение.
        if DANGEROUS.search(line):
            problems.append(
                f"src/i18n/ru.ts:{index + 1}: «{line.strip()[:70]}» — «готово» про мир "
                f"без области проверки. Назовите, где проверено: "
                f"«на этой машине», «здесь», «проверено»"
            )
            continue

        if key in STATUS_KEYS:
            continue  # подпись к действию: результат виден рядом

        is_assertion = any(marker in (key or "") for marker in ASSERTION_MARKERS)
        if is_assertion and not has_scope(line):
            # Строка-утверждение о состоянии без места: ровно то, что шаг 5
            # запрещает.
            problems.append(
                f"src/i18n/ru.ts:{index + 1}: {key} = «{line.strip()[:70]}» — "
                f"утверждение «готово» без области проверки"
            )

    return problems


def main() -> int:
    problems = findings()
    if problems:
        print("слово «готово» без области проверки (шаг 5):")
        for problem in problems:
            print(f"  {problem}")
        print(f"\nвсего: {len(problems)}")
        return 1
    if "--quiet" not in sys.argv:
        print("«готово» не утверждает про мир без места, где проверено (шаг 5)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
