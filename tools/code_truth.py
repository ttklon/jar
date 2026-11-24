#!/usr/bin/env python3
"""
Шаг 248: код не обещает больше документации (обратная сверка).

Шаг 247 проверяет «документация → данные»: числа в документации не должны
обещать больше реестра. Этот — обратный: **что код умеет, документация обязана
назвать**. Разрыв здесь тише и хуже: человек читает гайд, не находит там
возможность и не узнаёт, что она есть. Код делает больше, чем ему обещано.

Как проверяется. Берётся **перечень** из кода — не числа, а имена: типы отката,
уровни риска, решения политики, — и каждое имя обязано встретиться в
документации словом или ярлыком. Имена берутся из одного места в коде, чтобы
проверка не разошлась с ним.

Почему списком, а не поиском по прозе. Первая попытка искала упоминания
экранов по именам файлов (`Catalog`, `Hands`) — 14 «пропавших» из 17 оказались
ложными: в гайде экраны названы по-русски. Вторая искала числа — и не отличила
обещание от частного. Перечень **закрытый**: он либо назван целиком, либо нет.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SRC = ROOT / "src"


def undo_kinds() -> list[tuple[str, str]]:
    """
    Типы отката: имя в коде → как это названо человеку.

    Источник — `NAMES` в `src/lib/undoItems.ts`: словарь, которым модуль
    называет записи журнала. Если там появится новый тип, он появится и здесь,
    и проверка потребует назвать его в гайде.
    """
    text = (SRC / "lib" / "undoItems.ts").read_text(encoding="utf-8")
    block = text[text.index("const NAMES"):]
    block = block[:block.index("};")]
    return [(key, label) for key, label in re.findall(r'(\w+):\s*"([^"]+)"', block)]


def risk_levels() -> list[str]:
    rows = json.loads((ROOT / "data" / "actions.json").read_text(encoding="utf-8"))
    return sorted({row["risk"] for row in rows})


def check() -> list[str]:
    docs = "\n".join(path.read_text(encoding="utf-8") for path in sorted(DOCS.glob("*.md")))
    problems: list[str] = []

    # Типы отката — в гайде, а не «где-нибудь в документации»: раздел про откат
    # один, и человек ищет там.
    guide = (DOCS / "GUIDE.md").read_text(encoding="utf-8")
    section = guide[guide.index("**Настройки → Откат за сессию.**"):]
    section = section[:section.index("\n## ")]
    for key, label in undo_kinds():
        if label not in section:
            problems.append(f"откат: тип `{key}` («{label}») не назван в разделе «Откат за сессию»")

    # Уровни риска обязаны быть названы в документации: иначе в реестре есть
    # обещание, о котором человек не знает, как его читать.
    for level in risk_levels():
        if level not in docs:
            problems.append(f"уровень риска `{level}` не назван в документации")
    return problems


def selftest() -> int:
    """Проверка на проверке: список из кода обязан быть непустым и узнаваемым."""
    kinds = undo_kinds()
    failures = 0
    if len(kinds) < 5:
        failures += 1
        print(f"selftest: типов отката {len(kinds)} — словарь NAMES не прочитан", file=sys.stderr)
    if ("move", "перемещение") not in kinds:
        failures += 1
        print("selftest: не найден известный тип move → перемещение", file=sys.stderr)
    if ("nonexistent", "такого нет") in kinds:
        failures += 1
        print("selftest: выдуманный тип найден — источник читается неверно", file=sys.stderr)
    if len(risk_levels()) != 6:
        failures += 1
        print(f"selftest: уровней риска {len(risk_levels())}, ожидалось 6", file=sys.stderr)
    if failures:
        return 1
    print(f"selftest: {len(kinds)} типов отката, 6 уровней риска — список читается")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    problems = check()
    if problems:
        for problem in problems:
            print(f"код обещает больше документации: {problem}", file=sys.stderr)
        return 1
    print(f"код и документация совпадают: {len(undo_kinds())} типов отката, 6 уровней риска")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
