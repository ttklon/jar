#!/usr/bin/env python3
"""
Счёт по плану: сколько шагов сдано — по **уникальным номерам**, а не по строкам.

Почему отдельный счётчик. В плане 516 строк, но номеров 500: пятнадцать номеров
встречаются дважды, а 198 — трижды (в разных разделах под одним номером оказались
разные работы). Пока счёт шёл по строкам, «516» выглядело как «пятьсот с лишним
шагов», хотя шагов ровно пятьсот:

  * дубли **завышали** знаменатель (516 вместо 500) — процент сданного был ниже;
  * и **занижали** числитель: если одна из двух строк с номером 96 сдана, а вторая
    нет, шаг не сдан — но строки считались двумя работами.

Правило: **шаг сдан, только если сданы все его строки**. Номер — это шаг; строки
под ним — части одной работы, и «одна из двух» не сдача.

Usage:
    python3 tools/plan_progress.py
    python3 tools/plan_progress.py --strict   # падать, если есть дубли без пометки
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / "docs" / "MASTER-PLAN-500.md"

# Номер может нести звёздочки: `96*` и `96**` — не «ещё раз 96», а дополнения к
# шагу (поток до ядра; озвучивание кусков). Считать их тем же номером значит
# терять работы; считать отдельными — не терять.
ROW = re.compile(r"^\|\s*(\d+)(\*{0,2})\s*\|")

# Раздел «Что уже сделано из этого плана» — **конспект**, а не шаги. Он
# пересказывает номера из разделов ниже, и счёт по нему удваивал бы всё, что уже
# сдано. Начинается с этого заголовка и кончается следующим `##`.
DIGEST = "## Что уже сделано из этого плана"
DONE = ("Сделано", "проверено, дефекта нет")


def is_done(body: str) -> bool:
    return any(mark in body for mark in DONE) or len(body) > 200


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--strict", action="store_true", help="падать на дублях без пометки")
    args = parser.parse_args()

    by_number: dict[str, list[str]] = defaultdict(list)
    in_digest = False
    for line in PLAN.read_text(encoding="utf-8").split("\n"):
        if line.startswith("## "):
            in_digest = line.strip().startswith(DIGEST)
            continue
        if in_digest:
            continue
        match = ROW.match(line)
        if not match:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 2:
            continue
        # Ключ — номер вместе со звёздочками: `96`, `96*`, `96**` — три работы.
        by_number[f"{int(match.group(1))}{match.group(2)}"].append(cells[1])

    steps = len(by_number)
    done = {n for n, bodies in by_number.items() if all(is_done(b) for b in bodies)}
    # Дубли — не ошибка данных, а факт плана; но их число должно быть названо.
    doubles = {n: len(b) for n, b in by_number.items() if len(b) > 1}

    if not args.quiet:
        print(f"шагов: {steps} | сдано: {len(done)} | не сдано: {steps - len(done)} ({round(len(done) * 100 / steps)}%)")
        if doubles:
            listed = ", ".join(f"{n}×{k}" for n, k in sorted(doubles.items(), key=lambda pair: int(pair[0].rstrip("*"))))
            print(f"номеров с несколькими строками: {len(doubles)} ({listed})")
        partial = {n for n, bodies in by_number.items() if any(is_done(b) for b in bodies) and n not in done}
        if partial:
            listed = ", ".join(str(n) for n in sorted(partial))
            print(f"сданы частично (одна строка из нескольких): {listed}")

    if args.strict:
        if doubles:
            print("strict: у шагов больше одной строки — это надо развести номерами", file=sys.stderr)
            return 1
        # План называется «на 500 шагов», и это должно быть правдой, а не
        # округлением: 499 или 501 — уже другой план.
        if steps != 500:
            print(f"strict: шагов {steps}, а план называется «на 500»", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
