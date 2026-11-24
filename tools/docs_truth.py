#!/usr/bin/env python3
"""
Шаг 247: документация не обещает больше кода.

Человек читает документацию и строит ожидания: «835 действий», «49 доменов».
Если число разошлось с данными, документация обещает то, чего нет, — и это хуже
пустого места, потому что выглядит проверенным.

**Как отличить обещание от частного числа.** Первые версии пытались угадать по
словам («< 8 действий», «на 20 действий», «695 действий не входят») и давали то
пропуски, то ложные срабатывания. Признак оказался проще: **общий итог называют
парой** — «N действий и M доменов» в одной строке. Число в одиночку почти всегда
частное: порог, очередь, доля, подмножество.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

TOTAL_ACTIONS = re.compile(r"(\d+)\s+(?:действий|действия|действие)")
TOTAL_DOMAINS = re.compile(r"(\d+)\s+(?:доменов|домена|домене|доменах|домен)")

# «Было 829, стало 835», «829 → 835» — история, а не обещание.
HISTORY = re.compile(r"было|стало|→|->|раньше|прежде|вырос", re.IGNORECASE)
# Требование к тесту называет число проверяемым, а не обещаемым.
META = re.compile(r"количество действий = |число в ", re.IGNORECASE)
# Доля и подмножество: «695 действий не входят», «в 40 доменах из 49».
SUBSET = re.compile(r"не входят|из них|из \d+|пока не|входят в|исполняется|остальн", re.IGNORECASE)

# Где число — часть рассказа, а не обещание.
NARRATIVE = {"MASTER-PLAN-500.md", "CHANGELOG.md", "PLAN.md"}


def truth() -> tuple[int, int]:
    actions = json.loads((ROOT / "data" / "actions.json").read_text(encoding="utf-8"))
    return len(actions), len({row["domain"] for row in actions})


def check() -> list[str]:
    want_actions, want_domains = truth()
    problems: list[str] = []
    for path in sorted(DOCS.glob("*.md")):
        if path.name in NARRATIVE:
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if HISTORY.search(line) or META.search(line) or SUBSET.search(line):
                continue
            actions_here = [int(found.group(1)) for found in TOTAL_ACTIONS.finditer(line)]
            domains_here = [int(found.group(1)) for found in TOTAL_DOMAINS.finditer(line)]
            # Обещание — это пара итогов в одной строке. Одиночное число — частное
            # (порог, очередь, доля), и проверять его нечем: у него нет образца.
            if not actions_here or not domains_here:
                continue
            if want_actions not in actions_here:
                problems.append(
                    f"{path.name}:{number}: обещано {actions_here[0]} действий, в реестре {want_actions}"
                )
            if want_domains not in domains_here:
                problems.append(
                    f"{path.name}:{number}: обещано {domains_here[0]} доменов, в данных {want_domains}"
                )
    return problems


def selftest() -> int:
    """
    Проверка на проверке: правило обязано ловить подставное и пропускать частное.

    Без этого «сходится» ничего не значит: проверка, которая ничего не находит,
    всегда говорит «сходится».
    """
    cases = [
        # (строка, должен_ли_быть_провал, почему)
        ("Реестр: 835 действий, 49 доменов", False, "верная пара"),
        ("Экран: 49 доменов, 835 действий", False, "верная пара в обратном порядке"),
        ("Реестр: 829 действий и 44 доменов", True, "устаревшая пара"),
        ("Следующие 10 действий (в порядке пользы)", False, "очередь, а не итог"),
        ("Тонкие домены (< 8 действий)", False, "порог, а не итог"),
        ("695 действий реестра пока не входят ни в один рецепт", False, "подмножество"),
        ("Было 829 действий и 44 доменов, стало больше", False, "история"),
        ("Ширина есть, глубина — в 40 доменах из 49; 835 действий", False, "доля"),
    ]
    failures = 0
    for line, should_fail, why in cases:
        found = False
        if not HISTORY.search(line) and not META.search(line) and not SUBSET.search(line):
            a = [int(f.group(1)) for f in TOTAL_ACTIONS.finditer(line)]
            d = [int(f.group(1)) for f in TOTAL_DOMAINS.finditer(line)]
            if a and d:
                found = not (835 in a and 49 in d)
        if found != should_fail:
            failures += 1
            print(f"selftest: «{line}» — ожидалось {'провал' if should_fail else 'пропуск'} ({why})",
                  file=sys.stderr)
    if failures:
        return 1
    print(f"selftest: {len(cases)} случаев, все верны")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    problems = check()
    if problems:
        for problem in problems:
            print(f"документация обещает лишнее: {problem}", file=sys.stderr)
        return 1
    actions, domains = truth()
    print(f"документация сходится с данными: {actions} действий, {domains} доменов")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
