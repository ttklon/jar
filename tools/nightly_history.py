#!/usr/bin/env python3
"""
История ночных прогонов: одна строка на ночь (шаг 256).

Зачем это отдельно от артефактов. Артефакт живёт 14 дней и отвечает на вопрос
«прошло ли вчера». Спрашивают другое: **когда перестало проходить**. Для этого
нужен ряд, а не набор файлов: строка на ночь, дата, коммит, итог каждого прогона.
Артефакт `nightly-history` — снимок того же ряда, чтобы он пережил и ретеншн.

Правило, без которого история хуже её отсутствия: **упавшая ночь тоже
записывается**. Иначе в ряду остаются только успешные ночи, и «когда перестало»
превращается в «никогда» — самый частый способ соврать историей.

Формат — JSON Lines: одна строка на ночь, дописывается, читается без загрузки
всего файла.

Usage:
    python3 tools/nightly_history.py --app success --validate success
    python3 tools/nightly_history.py --app failure --validate skipped --commit abc1234
    python3 tools/nightly_history.py --check          # проверка ряда
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HISTORY = ROOT / "data" / "nightly.jsonl"

# Итоги, которые GitHub отдаёт в `needs.*.result`. Незнакомый итог не
# выбрасывается: он попадает в историю как есть, иначе история станет врать
# умолчанием.
RESULTS = {"success", "failure", "cancelled", "skipped"}

# Сколько строк держать. Год ночей — этого хватает, чтобы увидеть сезонность и
# не вырастить файл, который никто не читает.
KEEP = 400


def commit() -> str:
    """Коммит прогона: из окружения, потом из git, потом честное «неизвестно»."""
    from_env = os.environ.get("GITHUB_SHA", "").strip()
    if from_env:
        return from_env[:12]
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "неизвестно"


def parse(rows: list[str]) -> list[dict]:
    """Прочитать ряд. Битая строка называется, а не проглатывается."""
    out = []
    for number, raw in enumerate(rows, 1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            out.append(json.loads(raw))
        except json.JSONDecodeError as error:
            raise SystemExit(f"nightly: строка {number} не читается: {error}") from error
    return out


def append(entry: dict, path: Path = HISTORY) -> Path:
    """Дописать ночь. Повтор той же ночи заменяет строку, а не плодит вторую."""
    rows = parse(path.read_text(encoding="utf-8").splitlines()) if path.exists() else []
    rows = [row for row in rows if row.get("night") != entry["night"]]
    rows.append(entry)
    rows = rows[-KEEP:]
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")
    return path


def check(rows: list[dict]) -> list[str]:
    """Проверка ряда: у каждой ночи есть дата, коммит и оба итога."""
    problems: list[str] = []
    if not rows:
        # Пустая история — не «всё хорошо»: значит её никто не пишет.
        return ["истории нет: ни одна ночь не записана"]
    for row in rows:
        night = row.get("night", "")
        if not night or not night.startswith("20"):
            problems.append(f"{night or '?'}: дата не в виде ГГГГ-ММ-ДД")
        if not str(row.get("commit", "")).strip():
            problems.append(f"{night}: коммит не записан — ночь нельзя привязать к версии")
        for key in ("app", "validate"):
            if str(row.get(key, "")) not in RESULTS:
                problems.append(f"{night}: итог «{key}» = «{row.get(key)}» — не из известных")
    return problems


def streak(rows: list[dict], key: str = "app") -> int:
    """Сколько последних ночей подряд `key` проходит. Ноль — сегодня упало."""
    count = 0
    for row in reversed(rows):
        if str(row.get(key)) == "success":
            count += 1
        else:
            break
    return count


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", default="", help="итог прогона ядра и интерфейса")
    parser.add_argument("--validate", default="", help="итог прогона данных и документов")
    parser.add_argument("--commit", default="", help="коммит (иначе из окружения или git)")
    parser.add_argument("--check", action="store_true", help="только проверить ряд")
    parser.add_argument("--night", default="", help="дата ночи (для проверки)")
    args = parser.parse_args()

    if args.check:
        rows = parse(HISTORY.read_text(encoding="utf-8").splitlines()) if HISTORY.exists() else []
        problems = check(rows)
        if problems:
            for problem in problems:
                print(f"  {problem}")
            print(f"nightly: нарушений {len(problems)}")
            return 1
        print(
            f"nightly: ночей {len(rows)}, подряд проходят {streak(rows)}, "
            f"последняя {rows[-1].get('night')}"
        )
        return 0

    for name, value in (("app", args.app), ("validate", args.validate)):
        if not value:
            raise SystemExit(f"nightly: не назван итог «{name}»")
        # Незнакомое значение не приводится к «failure»: тогда история соврёт в
        # одну сторону понятным словом.
        if value not in RESULTS:
            raise SystemExit(f"nightly: итог «{value}» не из известных: {sorted(RESULTS)}")

    night = args.night or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entry = {
        "night": night,
        "commit": args.commit or commit(),
        "app": args.app,
        "validate": args.validate,
        "decided_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    path = append(entry)
    rows = parse(path.read_text(encoding="utf-8").splitlines())
    passed = all(row.get("app") == "success" and row.get("validate") == "success" for row in rows)
    print(
        f"nightly: записано {night} ({args.app}/{args.validate}), "
        f"ночей {len(rows)}, подряд проходят {streak(rows)} -> {path.relative_to(ROOT)}"
    )
    # Код возврата — по **сегодняшней** ночи: история пишется и при падении, но
    # прогон при этом всё равно краснеет, иначе падение спрячется за записью.
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
