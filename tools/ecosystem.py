#!/usr/bin/env python3
"""Ecosystem audit: what ZShelper can take from the outside world.

Ten catalogues in `data/ecosystem/` map the words people use when they say
«добавь всё»: скиллы, плагины, агенты, модели, MCP-серверы, инструменты,
помощники, умения, коннекторы, подключения.

Each record is **a pointer to a real thing** with provenance:

  origin: vault    — вынуто из research/ (README репозитория, каталог пакетов)
          curated  — список, собранный вручную по документации вендора/протокола
          registry — выведено из нашего реестра действий (умения, роли)
          zshelper — наши собственные рецепты и роли

Status is a promise, not decoration:

  candidate — найдено, но не проверено (`needs_check: true`); на него нельзя ссылаться
              как на решение;
  selected  — проверено и выбрано; только такие записи попадают в план работ.

Invariants (CI падает):
  * id уникален во всей экосистеме, `category` совпадает с именем файла;
  * `candidate` ⇒ `needs_check: true`, `selected` ⇒ `needs_check: false`;
  * у записи из vault есть http-ссылка; у record с полем `risk` — значение из набора;
  * в каждом каталоге не меньше 200 записей (цель, поставленная пользователем) —
    иначе печатается, сколько не хватает, и это не «нормально».

It renders `docs/ECOSYSTEM.md` (счётчики, распределения, шортлист) and is checked in CI.

Usage: python3 tools/ecosystem.py [--check]
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "data" / "ecosystem"
OUT = ROOT / "docs" / "ECOSYSTEM.md"

RISKS = {"read", "write-local", "external", "destructive", "identity", "money"}
REQUIRED = ("id", "name", "category", "subkind", "origin", "gives", "status", "needs_check")
MIN_PER_CATEGORY = 200

# слова пользователя → файл каталога
TITLES = {
    "mcp-servers": "MCP-серверы",
    "skills": "Навыки и скиллы",
    "abilities": "Умения (из реестра действий)",
    "plugins": "Плагины и пакеты-расширения",
    "agents": "Агенты и фреймворки",
    "models": "Модели",
    "tools": "Инструменты",
    "assistants": "Помощники",
    "connectors": "Коннекторы (сервисы)",
    "connections": "Подключения (каналы)",
}


def load() -> dict[str, list[dict]]:
    out = {}
    for path in sorted(DIR.glob("*.json")):
        out[path.stem] = json.loads(path.read_text(encoding="utf-8"))
    return out


def check(cats: dict[str, list[dict]]) -> tuple[list[str], Counter]:
    errs: list[str] = []
    ids: dict[str, str] = {}
    stats: Counter = Counter()
    for cat, rows in cats.items():
        if cat not in TITLES:
            errs.append(f"{cat}.json: неизвестный каталог")
        if len(rows) < MIN_PER_CATEGORY:
            errs.append(f"{cat}: {len(rows)} записей, нужно ≥{MIN_PER_CATEGORY}")
        for i, r in enumerate(rows, 1):
            tag = f"{cat}.json#{i} ({r.get('name', '?')})"
            for key in REQUIRED:
                if key not in r:
                    errs.append(f"{tag}: нет поля '{key}'")
            if any(k not in r for k in REQUIRED):
                continue
            if r["category"] != cat:
                errs.append(f"{tag}: category '{r['category']}' != файл '{cat}'")
            if r["id"] in ids:
                errs.append(f"{tag}: id уже есть в {ids[r['id']]}")
            ids[r["id"]] = cat
            if r["status"] not in ("candidate", "selected"):
                errs.append(f"{tag}: status '{r['status']}'")
            if r["status"] == "candidate" and not r["needs_check"]:
                errs.append(f"{tag}: candidate без needs_check")
            if r["status"] == "selected" and r["needs_check"]:
                errs.append(f"{tag}: selected с needs_check — неопределённость")
            if "risk" in r and r["risk"] not in RISKS:
                errs.append(f"{tag}: risk '{r['risk']}'")
            if r["origin"] == "vault":
                url = r.get("url") or ""
                if not url.startswith("http"):
                    errs.append(f"{tag}: origin=vault без http-ссылки")
            stats[(cat, r["status"])] += 1
            if not r.get("license"):
                stats[(cat, "no-license")] += 1
    return errs, stats


def render(cats: dict[str, list[dict]], stats: Counter) -> str:
    total = sum(len(v) for v in cats.values())
    candidates = sum(1 for rows in cats.values() for r in rows if r["status"] == "candidate")
    selected = total - candidates
    L: list[str] = [
        "# Экосистема: что можно взять снаружи",
        "",
        "Слово «добавь всё» разложено на десять каталогов. Каждая запись — **указатель на",
        "реальную вещь** с происхождением: README репозитория, документация вендора, протокол",
        "или строка нашего реестра. Ничего не выдумано: если записи нет в источнике, её нет здесь.",
        "",
        f"**Всего записей: {total}** · проверено и выбрано: **{selected}** · кандидатов на разбор: **{candidates}**",
        "",
        "| Каталог | Записей | Выбрано | Кандидатов | Что это |",
        "| --- | --- | --- | --- | --- |",
    ]
    for cat, rows in cats.items():
        sel = sum(1 for r in rows if r["status"] == "selected")
        L.append(f"| [`{cat}.json`](../data/ecosystem/{cat}.json) | {len(rows)} | {sel} | "
                 f"{len(rows) - sel} | {TITLES.get(cat, cat)} |")
    L += [
        "",
        "## Два статуса, и почему это важно",
        "",
        "| Статус | Что значит | Можно ли на это опираться |",
        "| --- | --- | --- |",
        "| `candidate` | найдено в каталоге/списке, но не проверено руками | нет: это заявка, а не решение |",
        "| `selected` | проверено и выбрано (умения, роли, наши скиллы) | да: на это можно ссылаться в плане |",
        "",
        "Правило: **кандидат не становится инструментом оттого, что попал в таблицу.** Переход",
        "`candidate → selected` — это отдельная работа: проверить лицензию, запуск на Windows,",
        "наличие CLI/API, риск и способ проверки результата.",
        "",
        "## Откуда что взято",
        "",
        "| Источник | Что даёт | Записей |",
        "| --- | --- | --- |",
    ]
    origins: Counter = Counter()
    for rows in cats.values():
        for r in rows:
            origins[r["origin"]] += 1
    src_note = {
        "vault": ("`research/` (1461 MCP-сервер, 347 Agent Skills, 96 агентов, 880 пакетов npm/PyPI)", origins["vault"]),
        "curated": ("списки по документации вендоров и протоколам (модели, коннекторы, каналы, приложения)", origins["curated"]),
        "registry": ("`data/actions.json` — наши действия, сгруппированные в умения", origins["registry"]),
        "zshelper": ("наши скиллы и роли помощников", origins["zshelper"]),
    }
    for origin, (note, n) in src_note.items():
        L.append(f"| `{origin}` | {note} | {n} |")

    L += ["", "## Каталоги", ""]
    for cat, rows in cats.items():
        subs = Counter(r["subkind"] for r in rows)
        L += [f"### {TITLES.get(cat, cat)} — {len(rows)}", ""]
        L.append("Распределение: " + ", ".join(f"`{k}` — {v}" for k, v in subs.most_common(12)) + ".")
        L += ["", "| # | Название | Тип | Что даёт | Статус |", "| --- | --- | --- | --- | --- |"]
        # показываем первые 25 (у выбранных приоритет) — полный список в JSON
        ordered = sorted(rows, key=lambda r: (r["status"] != "selected", -(r.get("stars") or 0), r["name"]))
        for i, r in enumerate(ordered[:25], 1):
            gives = (r["gives"] or "").replace("|", "/")[:120]
            L.append(f"| {i} | {r['name']} | `{r['subkind']}` | {gives} | `{r['status']}` |")
        if len(rows) > 25:
            L.append("")
            L.append(f"…и ещё {len(rows) - 25} в [`data/ecosystem/{cat}.json`](../data/ecosystem/{cat}.json).")
        L.append("")

    nostats = [(cat, n) for (cat, key), n in stats.items() if key == "no-license"]
    L += [
        "## Лицензии",
        "",
        f"Без указанной лицензии: **{sum(n for _, n in nostats)}** записей "
        + (("(" + ", ".join(f"`{c}` — {n}" for c, n in nostats) + ")") if nostats else "") + ".",
        "",
        "Правило проекта прежнее: берём только бесплатное и открытое; платное — как альтернатива",
        "с пометкой. Для записей без лицензии это **неизвестно, а не «можно»** — до проверки они",
        "остаются кандидатами.",
        "",
        "## Как это связано с остальными артефактами",
        "",
        "| Слой | Файл | Отвечает на вопрос |",
        "| --- | --- | --- |",
        "| Экосистема | `data/ecosystem/*.json` | «что вообще существует снаружи и стоит ли смотреть» |",
        "| Реестр | `data/actions.psv` | «что умеем мы сами» |",
        "| Профили | `data/profiles/*.json` | «как это в конкретной программе» |",
        "| Скиллы | `data/skills/*.json` | «как из этого получается работа» |",
        "",
        "Порядок пополнения: **нашли в экосистеме → проверили (лицензия, Windows, канал, риск) →",
        "описали строкой реестра → сделали профиль/скилл.** Каталог экосистемы не заменяет",
        "реестр: десять тысяч MCP-серверов не делают ассистента, который умеет работать.",
        "",
        "## Обновление",
        "",
        "```bash",
        "python3 tools/build_ecosystem.py   # пересобирает каталоги из research/ и _curated/",
        "python3 tools/ecosystem.py         # проверяет инварианты и рендерит этот файл",
        "```",
        "",
    ]
    return "\n".join(L)


def main() -> int:
    cats = load()
    if not cats:
        print("ecosystem: пусто — запусти tools/build_ecosystem.py")
        return 1
    errs, stats = check(cats)
    if errs:
        for e in errs[:40]:
            print("ERROR:", e)
        if len(errs) > 40:
            print(f"...и ещё {len(errs) - 40} ошибок")
        return 1
    text = render(cats, stats)
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("ecosystem: docs/ECOSYSTEM.md устарел — запусти python3 tools/ecosystem.py")
            return 1
        print("ecosystem: docs/ECOSYSTEM.md актуален")
        return 0
    OUT.write_text(text, encoding="utf-8")
    total = sum(len(v) for v in cats.values())
    print(f"ecosystem: {len(cats)} каталогов, {total} записей -> docs/ECOSYSTEM.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
