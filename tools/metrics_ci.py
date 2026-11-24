#!/usr/bin/env python3
"""
Метрики качества в CI: сколько фраз понято, сколько дел дошло до конца (шаг 244).

Зачем отдельный шаг в CI, а не «метрика в тесте». Тест метрики проверяет
**формулу**; в CI нужно другое — что числа вообще считаются каждый прогон и что
их видно человеку. Метрика, которую никто не печатает, не существует: о падении
узнают по жалобе, а не по сборке.

Откуда числа. Здесь — из журнала дел (`data/metrics.jsonl`), который пишется
прогонами сценариев: одна строка на фразу. Пустой журнал — это **не ноль**:
«нечего считать» и «перестали понимать» — разные вещи, и путать их значит
поднимать тревогу на пустом месте и молчать на настоящей поломке. Поэтому пустой
журнал даёт `null`, а не `0%`, и прогон проходит с честной строкой «не измеряли».

Пороги: понимание ≥ 85%, доведение ≥ 70%. Ниже — выход с кодом 1 и причиной
словами, что именно это значит для человека.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "data" / "metrics.jsonl"

FLOORS = {"understood": 0.85, "finished": 0.70}

MEANS = {
    "understood": "перестали понимать: человек повторяет просьбу дважды",
    "finished": "стали бросать на середине: время потрачено, результата нет",
}


def lines() -> list[dict]:
    """Записи журнала. Битые строки называются, а не проглатываются."""
    if not LOG.exists():
        return []
    out = []
    for number, raw in enumerate(LOG.read_text(encoding="utf-8").splitlines(), 1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            out.append(json.loads(raw))
        except json.JSONDecodeError as error:
            raise SystemExit(f"metrics: строка {number} не читается: {error}") from error
    return out


def rate(name: str, hit: int, of: int) -> dict:
    # `of == 0` → None, а не 0: ноль означает «перестали», и это не то же самое,
    # что «нечего считать».
    return {"name": name, "value": None if of == 0 else hit / of, "of": of}


def compute(rows: list[dict]) -> list[dict]:
    understood = rate("understood", sum(1 for row in rows if row.get("understood")), len(rows))
    started = [row for row in rows if row.get("started")]
    finished = rate("finished", sum(1 for row in started if row.get("finished")), len(started))
    return [understood, finished]


def say(metric: dict) -> tuple[str, bool]:
    """Строка для человека и «прошло ли»."""
    label = "фраз понято" if metric["name"] == "understood" else "дел доведено"
    if metric["value"] is None:
        return (f"{label}: не измеряли — записей нет (это не 0%, а «нечего считать»)", True)
    percent = round(metric["value"] * 1000) / 10
    floor = round(FLOORS[metric["name"]] * 100)
    if metric["value"] >= FLOORS[metric["name"]]:
        return (f"{label}: {percent}% из {metric['of']} — ok", True)
    return (
        f"{label}: {percent}% из {metric['of']} — ниже порога {floor}%: "
        f"{MEANS[metric['name']]}",
        False,
    )


def main() -> int:
    rows = lines()
    results = [say(metric) for metric in compute(rows)]
    for text, _ in results:
        print(f"  {text}")
    bad = [text for text, ok in results if not ok]
    if bad:
        print(f"metrics: провалено {len(bad)} из {len(results)}")
        return 1
    print(f"metrics: {len(results)} из {len(results)} в порядке")
    return 0


if __name__ == "__main__":
    sys.exit(main())
