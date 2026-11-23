#!/usr/bin/env python3
"""Список рук в интерфейсе совпадает со списком в ядре (шаги 18 и 19).

Расхождение — это ложь одной из сторон. Два случая, и оба реальны:

  * **рука есть в интерфейсе, но её нет в данных** — кнопка, которая нажмётся и
    ничего не сделает. Человек увидел обещание, которого нет;
  * **рука есть в данных, но её нет в паспортах** — обещание без записи: не
    видно, что она делает, чего не делает и что будет при отмене.

Шаг 19 требует большего: рука не появляется в интерфейсе **без строки реестра и
тест-кейса**. Строка реестра — это `registry` (`files|создать|папку`), тест-кейс —
пример на человеческом языке (`example`). Обе вещи проверяются здесь, потому что
это одно и то же правило: обещание должно быть предъявлено.

Где сверяются списки. Интерфейс в dev-режиме читает `data/tools.json` напрямую
(`src/ipc/dev.ts`), ядро — через свой код, который тоже берёт те же данные.
Значит **единственный источник** — `data/tools.json`, и сверка идёт по нему:
паспорта (`data/tool-receipts/`) обязаны покрывать его целиком, а реестр — не
содержать рук, которых в данных нет.

Почему это генератор-проверка, а не тест. Сверка идёт по данным на диске, а не
по поведению: `cargo` в этом окружении нет, а расхождение видно и без запуска
Rust. Тест в CI (`cargo check`) ловит, что ядро собирается; этот файл — что оно
обещает то же, что показывает интерфейс.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "data" / "tools.json"
ACTIONS = ROOT / "data" / "actions.json"
PASSPORTS = ROOT / "data" / "tool-receipts"


def load_tools() -> list[dict]:
    data = json.loads(TOOLS.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("tools", [])


def passport_names() -> set[str]:
    return {path.stem.replace("_", " ") for path in PASSPORTS.glob("*.json")}


def findings() -> list[str]:
    problems: list[str] = []
    tools = load_tools()
    titles = {tool.get("title") or "" for tool in tools}

    # 1. Каждая рука имеет паспорт: иначе обещание без записи.
    passports = passport_names()
    missing_passport = sorted(title for title in titles if title not in passports)
    for title in missing_passport:
        problems.append(f"{title}: есть в данных, нет паспорта — обещание без записи")

    # 2. Паспорт без руки — обещание, которого больше нет. Читают как живое.
    orphan = sorted(name for name in passports if name not in titles)
    for name in orphan:
        problems.append(f"{name}: паспорт есть, руки в данных нет — обещание-призрак")

    # 3. Шаг 19: строка реестра и тест-кейс обязательны.
    #
    # Тест-кейс берётся **не из руки**: у руки его нет и не должно быть — рука
    # исполнитель, а случай описывает действие. Кейс руки — это действие того же
    # домена и того же глагола: у «Создать папку» (`files|создать|папку`) есть
    # «создай папку Проект X на рабочем столе». Так обещание предъявлено на
    # человеческом языке, а не пересказано техническим.
    actions = json.loads(ACTIONS.read_text(encoding="utf-8"))
    cases: dict[tuple[str, str], str] = {}
    for action in actions:
        example = (action.get("example") or "").strip()
        verb = (action.get("verb") or "").strip().lower()
        if example and verb:
            cases.setdefault((action.get("domain") or "", verb), example)

    for tool in tools:
        title = tool.get("title") or "(без имени)"
        registry = (tool.get("registry") or "").strip()
        parts = [part.strip() for part in registry.split("|")]
        # Строка реестра — три части: домен | глагол | объект. Две части читаются
        # как «что-то с чем-то» и в каталог не годятся.
        if len(parts) != 3 or not all(parts):
            problems.append(f"{title}: строка реестра не в форме «домен|глагол|объект»: {registry!r}")
            continue
        domain, verb, _object = parts
        if not cases.get((domain, verb.lower())):
            problems.append(
                f"{title}: нет тест-кейса — ни одного действия «{domain}·{verb}» с примером, "
                f"нечем показать, что обещание проверяемо"
            )

    # 4. Рука, на которую ссылается каталог действий, обязана существовать. Это
    # и есть сверка «интерфейс — ядро»: каталог показывает людей к рукам.
    referenced = set()
    for action in actions:
        for impl in action.get("implementation") or []:
            if isinstance(impl, str) and impl.startswith("tool:"):
                referenced.add(impl.split(":", 1)[1].strip())
    for name in sorted(referenced):
        if name not in titles:
            problems.append(f"каталог ссылается на руку «{name}», которой нет в данных")

    return problems


def main() -> int:
    problems = findings()
    if problems:
        print("руки в интерфейсе и в данных разошлись (шаги 18, 19):")
        for problem in problems[:20]:
            print(f"  {problem}")
        if len(problems) > 20:
            print(f"  … и ещё {len(problems) - 20}")
        return 1
    if "--quiet" not in sys.argv:
        count = len(load_tools())
        print(f"руки согласованы: {count} в данных, {count} с паспортом, у каждой реестр и тест-кейс")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
