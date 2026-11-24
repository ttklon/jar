#!/usr/bin/env python3
"""
Любой закрытый дефект обязан иметь тест, названный его номером (шаг 254).

Дефект без теста — это дефект, который **вернётся**: закрытие без проверки
держится на памяти человека, а память через полгода занята другим. И наоборот:
комментарий «здесь был баг» без теста не закрывает ничего — его никто не
прогоняет.

Правило связи:

  * в `data/defects.json` у каждого дефекта есть `id`, `what` и `test`;
  * в файле теста обязана быть строка с **номером** дефекта (`D-007`) и словом
    **шаг** (номер шага плана) — так тест можно найти и связать с планом;
  * тест обязан существовать (для `tools/...` — файл или флаг, который CI
    прогоняет: `--selftest`/`--reproducible`);
  * дефект, у которого `test` указывает в никуда, — **не закрыт**, а забыт.

Проверяется в обе стороны:

  1. **каждый дефект имеет тест**, и тест его называет;
  2. **каждый тест, названный номером дефекта, есть в реестре** — иначе тест
     защищает что-то, о чём никто не знает, и его случайно удалят при чистке.

Usage:
    python3 tools/defects.py             # проверка, код 1 при нарушении
    python3 tools/defects.py --list      # таблица дефект → тест
    python3 tools/defects.py --selftest  # проверка на проверке
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "data" / "defects.json"

# Номер дефекта в тесте: `D-007`, `D-12` — оба вида.
NUMBER = re.compile(r"\bD-\d{3}\b")
# Номер шага плана: «шаг 220» — им размечен почти каждый тест в репозитории.
STEP = re.compile(r"[Шш]аг\s+\d{2,3}")


def tests_for(item: dict) -> Path:
    """Путь без флагов: `tools/sbom.py --reproducible` — это файл плюс флаг."""
    return ROOT / item["test"].split()[0]


def where(path: Path) -> str:
    """Имя для сообщения: временный файл selftest лежит вне репозитория."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return path.name


def tool_ok(path: Path, marker: str) -> bool:
    """
    Тест-инструмент: файл есть и содержит маркер (флаг CI или случай selftest).

    Для `tools/...` «есть тест» значит «есть selftest или флаг», а не «есть
    файл»: файл без самопроверки — это документ.
    """
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8", errors="ignore")
    return marker in text


def code_ok(path: Path, number: str) -> tuple[bool, str]:
    """Тест-файл: существует и называет дефект своим номером."""
    if not path.exists():
        return False, f"нет файла {where(path)}"
    text = path.read_text(encoding="utf-8", errors="ignore")
    if number not in text:
        return False, f"{where(path)} не называет {number}"
    if not STEP.search(text):
        return False, f"{where(path)}: у {number} нет номера шага плана"
    return True, ""


def check(registry: dict) -> list[str]:
    problems: list[str] = []
    defects = registry.get("defects", [])
    if not defects:
        problems.append("реестр дефектов пуст — «нет закрытых дефектов» это не «всё хорошо»")

    ids: set[str] = set()
    for item in defects:
        number = item.get("id", "")
        if not NUMBER.fullmatch(number):
            problems.append(f"{number or '?'}: номер должен быть вида D-000")
            continue
        if number in ids:
            problems.append(f"{number}: номер повторяется")
        ids.add(number)

        path = tests_for(item)
        if item["test"].startswith("tools/"):
            if not tool_ok(path, item.get("marker", "--selftest")):
                problems.append(f"{number}: {item['test']} без маркера «{item.get('marker')}» — это документ, а не тест")
            # И сам инструмент должен упоминать дефект, иначе связь односторонняя.
            if path.exists() and number not in path.read_text(encoding="utf-8", errors="ignore"):
                problems.append(f"{number}: {item['test']} не называет дефект своим номером")
            continue

        ok, why = code_ok(path, number)
        if not ok:
            problems.append(f"{number}: {why}")

    # Обратная сторона: тест называет номер, которого нет в реестре.
    for path in sorted((ROOT / "src").rglob("*.test.ts*")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for found in set(NUMBER.findall(text)):
            if found not in ids:
                problems.append(f"{where(path)}: называет {found}, а его нет в реестре")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()

    if not REGISTRY.exists():
        print("дефекты: нет data/defects.json", file=sys.stderr)
        return 1
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))

    if args.list:
        for item in registry["defects"]:
            print(f"{item['id']:6} {item['test']:34} {item['what'][:70]}")

    problems = check(registry)
    if problems:
        for line in problems:
            print(f"дефекты: {line}", file=sys.stderr)
        return 1
    print(f"дефекты: {len(registry['defects'])} закрытых, у каждого тест со своим номером")
    return 0


def selftest() -> int:
    """Проверка на проверке: код-тест без номера, инструмент без selftest, чужой номер."""
    import tempfile

    failed = 0
    with tempfile.TemporaryDirectory() as folder:
        base = Path(folder)
        (base / "a.test.ts").write_text("/** шаг 254 */ it('x', () => {})", encoding="utf-8")
        (base / "b.test.ts").write_text("/** D-001, шаг 254 */ it('x', () => {})", encoding="utf-8")
        (base / "tool.py").write_text("def main(): pass", encoding="utf-8")
        (base / "tool_ok.py").write_text("def selftest(): pass", encoding="utf-8")

        if NUMBER.search((base / "a.test.ts").read_text(encoding="utf-8")):
            print("selftest: тест без номера назван названным", file=sys.stderr)
            failed += 1
        ok, why = code_ok(base / "a.test.ts", "D-001")
        if ok:
            print("selftest: код-тест без номера прошёл", file=sys.stderr)
            failed += 1
        ok, _ = code_ok(base / "b.test.ts", "D-001")
        if not ok:
            print("selftest: правильный тест не прошёл", file=sys.stderr)
            failed += 1
        if tool_ok(base / "tool.py", "--selftest"):
            print("selftest: инструмент без selftest назван тестом", file=sys.stderr)
            failed += 1
        if not tool_ok(base / "tool_ok.py", "selftest"):
            print("selftest: инструмент с selftest не найден", file=sys.stderr)
            failed += 1

    if failed:
        return 1
    print("selftest: связь «дефект ↔ тест» проверяется в обе стороны")
    return 0


if __name__ == "__main__":
    sys.exit(main())
