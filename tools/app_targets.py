#!/usr/bin/env python3
"""
Target catalogue: which Windows applications ZShelper must be able to drive, and how.

A "profile" per app does not scale by hand to the long tail, so targets carry a **tier**:

  A — ручной профиль (якоря, шаги, проверки) — топ-приложения;
  B — профиль генерируется автоматически из UIA-дампа + подтверждение человеком;
  C — только визуальный агент (скриншот → OCR/VLM → клик), профиля нет.

`automation` показывает предпочтительный канал: api/cli/com/web/midi > uia > vision.
Чем раньше канал в этом списке, тем надёжнее и дешевле.

The tool validates the catalogue and renders docs/APP-COVERAGE.md, including an invariant:
**каждое приложение tier A обязано иметь профиль в data/profiles/**.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PSV = ROOT / "data" / "app_targets.psv"
PROFILES = ROOT / "data" / "profiles"
OUT = ROOT / "docs" / "APP-COVERAGE.md"

FIELDS = ("id", "app", "category", "exe", "automation", "tier", "priority", "notes")
CHANNELS = {"api", "cli", "com", "web", "midi", "uia", "jsx", "remote"}
TIERS = {"A", "B", "C"}
PRIORITIES = {"P0", "P1", "P2", "P3"}
# Порядок надёжности каналов: чем меньше индекс, тем предпочтительнее.
RELIABILITY = ["api", "cli", "com", "web", "midi", "jsx", "remote", "uia"]


def load() -> tuple[list[dict], list[str]]:
    rows, errs = [], []
    for i, line in enumerate(PSV.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("|")
        if len(parts) != len(FIELDS):
            errs.append(f"line {i}: expected {len(FIELDS)} fields, got {len(parts)}")
            continue
        row = dict(zip(FIELDS, parts))
        tokens = [t.strip() for t in row["automation"].split("+")]
        bad = [t for t in tokens if t not in CHANNELS]
        if bad:
            errs.append(f"line {i} ({row['id']}): unknown channel(s) {bad}")
        if row["tier"] not in TIERS:
            errs.append(f"line {i} ({row['id']}): bad tier '{row['tier']}'")
        if row["priority"] not in PRIORITIES:
            errs.append(f"line {i} ({row['id']}): bad priority '{row['priority']}'")
        row["channels"] = tokens
        rows.append(row)
    return rows, errs


def profile_exes() -> set[str]:
    out: set[str] = set()
    for path in PROFILES.glob("*.json"):
        if path.name.startswith("_"):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for exe in data.get("exe", []):
            out.add(exe.lower())
    return out


def render(rows: list[dict], errs: list[str], have: set[str]) -> str:
    tier = Counter(r["tier"] for r in rows)
    prio = Counter(r["priority"] for r in rows)
    primary = Counter(r["channels"][0] for r in rows)
    cats = Counter(r["category"] for r in rows)

    tier_a = [r for r in rows if r["tier"] == "A"]
    missing = [r for r in tier_a if r["exe"].lower() not in have]

    L = [
        "# Каталог приложений: что ZShelper должен уметь автоматизировать",
        "",
        "Данные — [`data/app_targets.psv`](../data/app_targets.psv), файл генерируется",
        "`python3 tools/app_targets.py`, руками не править.",
        "",
        f"**Приложений в каталоге: {len(rows)}** · категорий: **{len(cats)}** · "
        f"с готовым профилем: **{len(rows) - len(missing)}**",
        "",
        "## Три уровня покрытия (почему не «профиль на каждую программу руками»)",
        "",
        "| Tier | Что это | Сколько | Как появляется |",
        "| --- | --- | --- | --- |",
        "| **A** | ручной профиль: якоря, шаги, проверки | "
        f"{tier['A']} | пишется человеком/агентом по UIA-дампу |",
        "| **B** | авто-профиль из UIA + подтверждение | "
        f"{tier['B']} | `tools/uia_probe` → кандидаты → подтверждение |",
        "| **C** | только визуальный агент (скриншот→OCR/VLM→клик) | "
        f"{tier['C']} | профиля нет, работает универсальный цикл |",
        "",
        "Подробно — [`PROFILE-STRATEGY.md`](PROFILE-STRATEGY.md). Правило: приложение без профиля",
        "всё равно **работает**, просто медленнее и с меньшей надёжностью.",
        "",
        "## Каналы автоматизации",
        "",
        "Предпочтение: **api → cli → com → web → midi → jsx → remote → uia → vision**.",
        "",
        "| Основной канал | Приложений |",
        "| --- | --- |",
    ]
    for ch, n in primary.most_common():
        L.append(f"| `{ch}` | {n} |")

    L += ["", "## Приоритеты", "", "| Приоритет | Приложений |", "| --- | --- |"]
    for p in ("P0", "P1", "P2", "P3"):
        L.append(f"| {p} | {prio.get(p, 0)} |")

    L += ["", "## Инвариант: tier A ⇒ есть профиль", ""]
    if missing:
        L.append("**Нарушение** — перечисленные приложения объявлены tier A, но профиля нет:")
        for r in missing:
            L.append(f"- `{r['app']}` (`{r['exe']}`) — `{r['id']}`")
        L.append("")
        L.append("Либо добавить профиль, либо понизить tier до B.")
    else:
        L.append("Все приложения tier A имеют профиль в `data/profiles/`. ✅")

    L += ["", "## Полный каталог", ""]
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_cat[r["category"]].append(r)
    for cat in sorted(by_cat, key=lambda c: -len(by_cat[c])):
        L += [f"### {cat} ({len(by_cat[cat])})", "",
              "| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |",
              "| --- | --- | --- | --- | --- | --- | --- |"]
        for r in sorted(by_cat[cat], key=lambda x: (x["priority"], x["app"])):
            has = "✅" if r["exe"].lower() in have else "—"
            L.append(
                f"| {r['app']} | `{r['exe']}` | {r['automation']} | {r['tier']} | "
                f"{r['priority']} | {has} | {r['notes']} |"
            )
        L.append("")

    L += [
        "## Как каталог пополняется",
        "",
        "1. Пользователь просит «сделай что-то в программе X».",
        "2. Программа определяется по имени процесса (или файла).",
        "3. Если её нет в каталоге — ZShelper спрашивает разрешение на «осмотр» окна,",
        "   снимает UIA-дерево, создаёт черновик профиля tier B и работает через него.",
        "4. После подтверждения человеком черновик становится tier A (с `verified_at`).",
        "5. Если UIA-дерева нет (игра, канвас) — включается визуальный агент (tier C).",
        "",
        "Так «умеет всё» становится процессом, а не обещанием: каталог растёт сам, по мере",
        "реальных запросов, и каждое новое приложение оставляет после себя артефакт.",
        "",
        "## Проблемы данных",
        "",
    ]
    L += [f"- {e}" for e in errs] if errs else ["Нет."]
    L.append("")
    return "\n".join(L)


def main() -> int:
    rows, errs = load()
    have = profile_exes()
    OUT.write_text(render(rows, errs, have), encoding="utf-8")
    tier_a = [r for r in rows if r["tier"] == "A"]
    missing = [r for r in tier_a if r["exe"].lower() not in have]
    print(f"targets: {len(rows)}, tier A: {len(tier_a)} (missing profiles: {len(missing)}), "
          f"errors: {len(errs)} -> {OUT.relative_to(ROOT)}")
    for m in missing:
        print("  ! no profile for", m["app"], f"({m['exe']})")
    return 1 if (errs or missing) else 0


if __name__ == "__main__":
    raise SystemExit(main())
