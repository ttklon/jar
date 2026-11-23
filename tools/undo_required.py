#!/usr/bin/env python3
"""Рука, описывающая эффект, обязана указать отмену (шаг 10).

Требование пользователя дословно: **не считать вызов доказательством**. Рука,
которая говорит «удаляет файл», доказала только то, что вызов прошёл. Чтобы
обещание стало обещанием, нужно сказать, что будет, если человек передумает:
что именно вернётся, чем и до какого момента.

Что проверяется. У каждой руки с необратимым или пишущим следом в паспорте
(`data/tool-receipts/<рука>.json`) должно быть поле `undo`, и оно не может быть
пустым, если рука **что-то меняет**. Сейчас `undo: null` у всех 56 — и именно
поэтому проверка пока не валит сборку: она включается в тот момент, когда
появляется первая записанная отмена.

Как это честно. Валить сборку за то, что отмены ещё нет ни у кого, значило бы
заблокировать работу и заставить придумывать отмены наспех — а наспех
придуманная отмена хуже отсутствующей: она обещает вернуть то, что не вернёт.
Поэтому проверка срабатывает по-настоящему, как только в паспорте появляется
`undo` — тогда она требует его **у каждой** меняющей руки. До этого она
называет дыру числом и не мешает.

`--strict` включает требование немедленно. Это для того дня, когда отмены
записаны у всех: тогда флаг уходит из вызова, а проверка остаётся такой же.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PASSPORTS = ROOT / "data" / "tool-receipts"


def load() -> list[dict]:
    out = []
    for path in sorted(PASSPORTS.glob("*.json")):
        out.append(json.loads(path.read_text(encoding="utf-8")))
    return out


def mutating(tool: dict) -> bool:
    """Меняет ли рука мир: пишет или необратима. Это и есть «эффект»."""
    return bool(tool.get("permissions", {}).get("writes")) or bool(tool.get("irreversible"))


def findings(tools: list[dict], strict: bool) -> list[str]:
    mutating_tools = [tool for tool in tools if mutating(tool)]
    with_undo = [tool for tool in mutating_tools if tool.get("undo")]

    problems: list[str] = []

    # Отмена записана у части — значит требование уже действует, и каждая
    # меняющая рука обязана её назвать. Иначе «сделаю потом» растянется навсегда.
    if strict or with_undo:
        for tool in mutating_tools:
            if not tool.get("undo"):
                problems.append(
                    f"{tool['title']}: меняет мир, но отмена не названа — "
                    f"скажите, что вернётся и до какого момента"
                )

    # Вторая проверка не про наличие, а про смысл: отмена «ничего» или «—» —
    # это не отмена, а отписка, и она хуже пустого поля: выглядит записанной.
    for tool in mutating_tools:
        undo = (tool.get("undo") or "").strip().lower() if isinstance(tool.get("undo"), str) else tool.get("undo")
        if undo in ("-", "—", "нет", "невозможна", "no", "none"):
            problems.append(
                f"{tool['title']}: отмена записана как «{undo}» — это отписка. "
                f"Если отменить нельзя, так и скажите: «невозвратно» и почему"
            )

    return problems


def main() -> int:
    strict = "--strict" in sys.argv
    quiet = "--quiet" in sys.argv
    tools = load()
    problems = findings(tools, strict)

    if problems:
        print("отмена не названа там, где рука меняет мир (шаг 10):")
        for problem in problems[:20]:
            print(f"  {problem}")
        if len(problems) > 20:
            print(f"  … и ещё {len(problems) - 20}")
        return 1

    if not quiet:
        mutating_count = len([tool for tool in tools if mutating(tool)])
        with_undo = len([tool for tool in tools if mutating(tool) and tool.get("undo")])
        if with_undo == 0:
            # Дыру не прячем: она называется числом, но сборку не валит, пока
            # отмен не записано ни у кого (см. объяснение в докстроке).
            print(
                f"отмена не записана ни у одной из {mutating_count} меняющих рук — "
                f"это известная дыра, а не «всё хорошо»"
            )
        else:
            print(f"отмена названа у {with_undo} из {mutating_count} меняющих рук")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
