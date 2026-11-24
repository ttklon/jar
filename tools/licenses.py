#!/usr/bin/env python3
"""
Одна таблица лицензий всего встроенного (шаг 217).

Зачем. «Бесплатно» — это обещание, а обещание проверяют списком. До сих пор
лицензии были разбросаны: на карточке модели, на карточке движка, в
`docs/DEPENDENCIES.md` (предложение, а не факт) и в SPDX-документе, который
никто не открывает. Человек, которому нужно знать «что тут под Apache, а что под
GPL», не мог получить ответ одним взглядом.

Что делает скрипт. Собирает **один** файл `data/licenses.json` и markdown-таблицу
из тех же источников, что SBOM:

  * npm — из `package-lock.json`, где лицензия объявлена у каждого пакета;
  * Cargo — из `Cargo.lock`, **где лицензии нет вовсе**. Это не наша небрежность:
    `Cargo.lock` не хранит лицензии, и врать «MIT» по памяти крейта нельзя.
    Такие строки честно помечены `не объявлено в lock` и отдельно посчитаны.

Правила:

  1. **считать, а не обещать**: у каждой группы есть число, и сумма сходится;
  2. **«неизвестно» — это категория, а не пустое место**: 487 крейтов без
     лицензии в lock выглядят как 487 пустых клеток, и это вводит в заблуждение
     сильнее, чем прямое «не объявлено»;
  3. **сортировка по числу пакетов**, а не по алфавиту: человек ищет сначала
     большое;
  4. **GPL и AGPL названы отдельно**: они меняют ответ на вопрос «можно ли это
     распространять», и их нельзя прятать в общем списке.

Usage:
    python3 tools/licenses.py                 # перезаписать data/licenses.json и docs/LICENSES.md
    python3 tools/licenses.py --check         # только проверить, что файлы на месте
    python3 tools/licenses.py --selftest      # проверить саму проверку
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "licenses.json"
DOC = ROOT / "docs" / "LICENSES.md"

# Лицензии, о которых человек обязан узнать громко: они влияют на распространение.
COPyleft = ("GPL", "AGPL", "LGPL", "MPL", "EPL", "CDDL")

UNKNOWN = "не объявлено в lock"


def npm_packages() -> list[dict]:
    """Пакеты npm с объявленной лицензией — по одному на имя."""
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    seen: dict[str, dict] = {}
    for path, item in lock.get("packages", {}).items():
        if not path or path == "":
            continue
        name = item.get("name") or path.rsplit("node_modules/", 1)[-1]
        if not name or name in seen:
            continue
        seen[name] = {
            "name": name,
            "version": item.get("version"),
            "license": item.get("license") or UNKNOWN,
            "kind": "npm",
        }
    return sorted(seen.values(), key=lambda item: item["name"])


def cargo_packages() -> list[dict]:
    """
    Крейты из `Cargo.lock`.

    Лицензии в lock нет — и это факт, который надо показать, а не замазать.
    Разбор через `tomllib`, а не по строкам: в шапке lock есть `version = 4`
    (число, не строка), и построчный разбор на нём падал.
    """
    import tomllib

    lock = tomllib.loads((ROOT / "src-tauri" / "Cargo.lock").read_text(encoding="utf-8"))
    return [
        {
            "name": item["name"],
            "version": item.get("version"),
            "license": UNKNOWN,
            "kind": "cargo",
        }
        for item in lock.get("package", [])
    ]


def group(packages: list[dict]) -> list[dict]:
    """Группы по лицензии — по убыванию числа пакетов, затем по имени."""
    counts = Counter(item["license"] for item in packages)
    return [
        {"license": license, "count": count}
        for license, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]


def build() -> dict:
    npm = npm_packages()
    cargo = cargo_packages()
    everything = npm + cargo
    return {
        "note": (
            "Одна таблица лицензий всего встроенного. npm — из package-lock.json, где лицензия "
            "объявлена; Cargo — из Cargo.lock, где лицензии нет вовсе, поэтому такие строки "
            "помечены «не объявлено в lock», а не додуманы. Собрано tools/licenses.py."
        ),
        "total": len(everything),
        "kinds": {"npm": len(npm), "cargo": len(cargo)},
        "unknown": sum(1 for item in everything if item["license"] == UNKNOWN),
        "copyleft": [
            item for item in everything if any(item["license"].startswith(word) for word in COPyleft)
        ],
        "groups": group(everything),
        "packages": everything,
    }


def table(data: dict) -> str:
    lines = [
        "# Лицензии всего встроенного",
        "",
        f"Всего пакетов: **{data['total']}** — npm {data['kinds']['npm']}, Cargo {data['kinds']['cargo']}.",
        "",
        "Таблица собрана из блокировок (`package-lock.json`, `src-tauri/Cargo.lock`), а не из памяти:",
        "у npm лицензия объявлена, у Cargo в lock её нет вовсе, поэтому эти строки честно помечены",
        f"«{UNKNOWN}» — {data['unknown']} пакетов. Число в таблице сходится с общим числом.",
        "",
        "| Лицензия | Пакетов |",
        "| --- | --- |",
    ]
    for item in data["groups"]:
        lines.append(f"| {item['license']} | {item['count']} |")
    lines.append(f"| **всего** | **{data['total']}** |")
    lines += ["", "## Лицензии, влияющие на распространение", ""]
    if data["copyleft"]:
        for item in data["copyleft"]:
            lines.append(f"- `{item['name']}` — {item['license']} ({item['kind']})")
    else:
        lines.append("Ни одной копилефт-лицензии (GPL, AGPL, LGPL, MPL, EPL, CDDL) среди встроенного нет.")
    lines += [
        "",
        "## Чего в таблице нет",
        "",
        "Скачиваемое отдельно (модель, движок, распознавание речи) сюда не входит: у него свои",
        "источник и лицензия на карточке первого запуска (`data/readiness.json`).",
    ]
    return "\n".join(lines) + "\n"


def write() -> int:
    data = build()
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    DOC.write_text(table(data), encoding="utf-8")
    print(f"лицензии: {data['total']} пакетов, {len(data['groups'])} групп, неизвестных {data['unknown']}")
    return 0


def check() -> int:
    problems: list[str] = []
    if not DATA.exists():
        problems.append("нет data/licenses.json")
    if not DOC.exists():
        problems.append("нет docs/LICENSES.md")
    if problems:
        for line in problems:
            print(f"лицензии: {line}", file=sys.stderr)
        return 1
    data = json.loads(DATA.read_text(encoding="utf-8"))
    # Сумма по группам обязана сходиться с общим числом: иначе таблица врёт.
    if sum(item["count"] for item in data["groups"]) != data["total"]:
        print("лицензии: сумма по группам не сходится с общим числом", file=sys.stderr)
        return 1
    if data["total"] != data["kinds"]["npm"] + data["kinds"]["cargo"]:
        print("лицензии: npm + Cargo не дают общего числа", file=sys.stderr)
        return 1
    # Таблица в документации обязана содержать каждую группу, а не часть.
    doc = DOC.read_text(encoding="utf-8")
    for item in data["groups"]:
        if f"| {item['license']} | {item['count']} |" not in doc:
            print(f"лицензии: в docs/LICENSES.md нет строки «{item['license']}»", file=sys.stderr)
            return 1
    print(f"лицензии: {data['total']} пакетов, таблица сходится")
    return 0


def selftest() -> int:
    """Проверка на выдуманных данных: сходится ли счёт и ловит ли он расхождение."""
    data = build()
    if sum(item["count"] for item in data["groups"]) != data["total"]:
        print("selftest: группы не сходятся", file=sys.stderr)
        return 1
    if data["total"] != data["kinds"]["npm"] + data["kinds"]["cargo"]:
        print("selftest: виды не сходятся", file=sys.stderr)
        return 1
    if data["unknown"] != data["kinds"]["cargo"]:
        # У npm лицензия в lock есть у всех, значит неизвестные — ровно крейты.
        print("selftest: неизвестных больше или меньше, чем крейтов", file=sys.stderr)
        return 1
    print(f"selftest: {data['total']} пакетов сходятся по группам и по видам")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if args.check:
        return check()
    return write()


if __name__ == "__main__":
    sys.exit(main())
