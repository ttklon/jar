#!/usr/bin/env python3
"""
Снимок отчёта в артефактах CI, чтобы сравнивать версии (шаг 257).

Зачем. В CI лежат артефакты сборки, снимки экрана и SBOM — но **отчёта** среди
них нет. Поэтому на вопрос «что изменилось между 1.1.0 и 1.2.0» отвечают diff'ом
кода: он говорит, что правили, и молчит о том, что **изменилось для человека**.
Новый домен, пропавшее действие, отключённый навык — всё это видно в отчёте и
невидимо в diff'е.

Что здесь снимается. Числа, которые уже считаются в репозитории, — действия,
профили, скиллы, тулзы, экраны, тесты, дефекты, — в один JSON. Не «пересказ
документации», а те же числа из тех же источников: снимок обязан совпасть с
`dashboard.py`, иначе появится третья правда.

Правило, без которого снимок бесполезен: **сравнение называет разницу по
смыслу**. «Стало 836 вместо 835» — не ответ; ответ — «появился домен `voice`:
+4 действия, −1 профиль». Поэтому `compare()` показывает, **где** изменение, а не
только сколько.

Usage:
    python3 tools/report_snapshot.py --write         # записать dist/report.json
    python3 tools/report_snapshot.py --check         # сверить с репозиторием
    python3 tools/report_snapshot.py --diff before.json after.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "report.json"

# Источники снимка: имя → файл или папка. Один список, чтобы «что попало в
# отчёт» было видно человеку, а не выводилось из кода.
SOURCES = {
    "actions": ("data/actions.json", lambda path: len(json.loads(path.read_text(encoding="utf-8")))),
    "profiles": ("data/profiles", lambda path: len(list(path.glob("*.json")))),
    "skills": ("data/skills", lambda path: len(list(path.glob("*.json")))),
    "defects": ("data/defects.json", lambda path: len(json.loads(path.read_text(encoding="utf-8"))["defects"])),
    "evals": ("data/evals.json", lambda path: json.loads(path.read_text(encoding="utf-8"))["count"]),
    "screens": ("src/screens", lambda path: len(list(path.glob("*.tsx")))),
    # Число тестовых **файлов**, а не тестов: оно меняется только вместе с
    # новой темой, а не с каждой новой проверкой. Иначе сверка снимка требовала
    # бы перегенерации после каждой строки `it(...)`, и её бы отключили.
    #
    # Это осознанный компромисс: снимок отвечает на «сколько тем проверено», а
    # не «сколько проверок» (для второго есть `docs/COVERAGE.md`).
    "tests": ("src", lambda path: len(list(path.rglob("*.test.*")))),
}


def measure() -> dict[str, int]:
    """Снять числа. Отсутствующий источник — ошибка, а не ноль.

    Пропустить источник молча значит показать «0 действий» и не заметить, что
    файл переименовали. Ноль и «не нашли» — разные вещи.
    """
    got: dict[str, int] = {}
    for name, (relative, count) in SOURCES.items():
        path = ROOT / relative
        if not path.exists():
            raise SystemExit(f"report: источник «{name}» ({relative}) не найден — это не ноль")
        got[name] = count(path)
    return got


def domains() -> dict[str, int]:
    """Действия по доменам — то, что меняется чаще всего и по частям."""
    rows = json.loads((ROOT / "data" / "actions.json").read_text(encoding="utf-8"))
    out: dict[str, int] = {}
    for row in rows:
        out[row["domain"]] = out.get(row["domain"], 0) + 1
    return dict(sorted(out.items()))


def snapshot() -> dict:
    return {
        "numbers": measure(),
        "domains": domains(),
    }


def compare(before: dict, after: dict) -> list[str]:
    """Разница по смыслу: где именно изменилось, а не только сколько."""
    out: list[str] = []
    was = before.get("numbers", {})
    now = after.get("numbers", {})
    for key in sorted(set(was) | set(now)):
        old, new = was.get(key), now.get(key)
        if old == new:
            continue
        if old is None:
            out.append(f"{key}: появился ({new})")
        elif new is None:
            out.append(f"{key}: пропал (было {old})")
        else:
            out.append(f"{key}: {old} → {new} ({new - old:+d})")

    # Домены сравниваются отдельно: «действий столько же» скрывает, что четыре
    # ушли из `files` и четыре пришли в `voice`.
    was_dom = before.get("domains", {})
    now_dom = after.get("domains", {})
    for domain in sorted(set(was_dom) | set(now_dom)):
        old, new = was_dom.get(domain, 0), now_dom.get(domain, 0)
        if old == new:
            continue
        out.append(f"домен {domain}: {old} → {new} ({new - old:+d})")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="записать dist/report.json")
    parser.add_argument("--check", action="store_true", help="сверить с репозиторием")
    parser.add_argument("--diff", nargs=2, metavar=("BEFORE", "AFTER"), help="сравнить два снимка")
    args = parser.parse_args()

    if args.diff:
        before = json.loads(Path(args.diff[0]).read_text(encoding="utf-8"))
        after = json.loads(Path(args.diff[1]).read_text(encoding="utf-8"))
        changes = compare(before, after)
        if not changes:
            print("report: без изменений")
            return 0
        for change in changes:
            print(f"  {change}")
        print(f"report: изменений {len(changes)}")
        return 0

    current = snapshot()
    if args.write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(current, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"report: снимок записан -> {OUT.relative_to(ROOT)}")
        return 0

    # `--check` — сверка с тем, что лежит в репозитории: если снимок устарел,
    # сравнивать версии нельзя, потому что сравнивают не то.
    if not OUT.exists():
        print("report: снимка нет — сначала --write")
        return 1
    saved = json.loads(OUT.read_text(encoding="utf-8"))
    changes = compare(saved, current)
    if not changes:
        print("report: снимок совпадает с репозиторием")
        return 0
    for change in changes:
        print(f"  {change}")
    print(f"report: снимок устарел, различий {len(changes)}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
