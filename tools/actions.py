#!/usr/bin/env python3
"""
Action registry for ZShelper.

`data/actions.psv` is the single source of truth for **every operation ZShelper is supposed
to be able to perform**. This script:

  1. parses the pipe-separated registry into `data/actions.json` (machine-readable);
  2. renders `docs/ACTIONS.md` — a skimmable catalogue with stats and a coverage matrix;
  3. reports gaps: domains that are thin, verbs used nowhere, statuses.

Why a registry instead of prose: the same records later generate
  * the capability registry (risk / permissions / tier gating),
  * the planner's tool cards (title + whenToUse),
  * the eval suites (one scenario per action family),
  * the settings screen ("what can my machine do?").

Format of a line (10 fields, `|`-separated):
  domain | verb | object | example | how | risk | tier | human | status | notes

risk:   R read · W write-local · D destructive · E external · M money · I identity
human:  c = человек может · h = редко/сложно · n = человек не может (суперспособность)
status: v1 · v2 · later · never
"""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PSV = ROOT / "data" / "actions.psv"
JSON_OUT = ROOT / "data" / "actions.json"
MD_OUT = ROOT / "docs" / "ACTIONS.md"

DOMAIN_TITLES = {
    "files": "Файлы",
    "storage-backup": "Диски, бэкапы, восстановление",
    "text-docs": "Текстовые документы (Word)",
    "sheets-data": "Таблицы и данные",
    "slides-pdf-print": "Презентации, PDF, печать, сканирование",
    "images": "Изображения",
    "audio": "Аудио и речь",
    "video": "Видео",
    "web": "Веб и браузер",
    "email": "Почта",
    "chat-social": "Мессенджеры и соцсети",
    "calendar-tasks": "Календарь, задачи, напоминания",
    "apps-windows": "Приложения и окна",
    "input": "Ввод (мышь, клавиатура, буфер)",
    "system-power": "Питание, экран, сессии",
    "processes-services": "Процессы, службы, автозапуск",
    "network": "Сеть",
    "devices": "Устройства (USB, телефон, принтер, камера)",
    "display-sound": "Дисплей и звук",
    "security-access": "Безопасность и доступ",
    "accounts-updates": "Учётные записи и обновления",
    "dev-code": "Разработка и код",
    "databases": "Базы данных",
    "ai-ml": "ИИ и модели",
    "automation": "Автоматизация и скрипты",
    "monitoring-triage": "Мониторинг и диагностика",
    "virtualization-remote": "Виртуализация и удалённый доступ",
    "accessibility": "Доступность",
    "business-finance": "Бизнес и финансы",
    "learning-research": "Учёба и исследования",
    "creative-3d": "Дизайн, графика, 3D",
    "games": "Игры",
    "superhuman": "Чего человек не может (суперспособности)",
}

RISK_LABEL = {
    "R": "read", "W": "write-local", "D": "destructive",
    "E": "external", "M": "money", "I": "identity", "—": "—",
}
HUMAN_LABEL = {"c": "может", "h": "сложно", "n": "не может", "—": "—"}


def load() -> list[dict]:
    rows: list[dict] = []
    for i, line in enumerate(PSV.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 10:
            raise ValueError(f"line {i}: expected 10 fields, got {len(parts)}: {line[:90]}")
        domain, verb, obj, example, how, risk, tier, human, status, notes = parts
        rows.append({
            "id": f"{domain}-{i:03d}",
            "domain": domain,
            "verb": verb,
            "object": obj,
            "example": example,
            "implementation": [h.strip() for h in how.split(";") if h.strip()],
            "risk": RISK_LABEL.get(risk, risk),
            "tier": tier if tier.startswith("T") else "—",
            "human": HUMAN_LABEL.get(human, human),
            "human_code": human,
            "status": status,
            "notes": notes,
        })
    return rows


def render(rows: list[dict]) -> str:
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_domain[r["domain"]].append(r)

    threats = Counter(r["risk"] for r in rows)
    tiers = Counter(r["tier"] for r in rows)
    statuses = Counter(r["status"] for r in rows)
    verbs = Counter(r["verb"] for r in rows)

    out: list[str] = [
        "# Реестр действий ZShelper",
        "",
        "Полный, систематический перечень того, что приложение должно уметь делать. "
        "Источник — [`data/actions.psv`](../data/actions.psv); файл генерируется "
        "`python3 tools/actions.py`, руками не править.",
        "",
        f"**Всего действий: {len(rows)}** · доменов: **{len(by_domain)}** · "
        f"уникальных глаголов: **{len(verbs)}**",
        "",
        "Обозначения: `risk` — R(чтение) / W(запись локально) / D(разрушительное) / "
        "E(внешний эффект) / M(деньги) / I(идентичность); `tier` — минимальное железо (T0…T3); "
        "`человек` — может / сложно / **не может** (то, ради чего продукт и нужен).",
        "",
        "## Сводка",
        "",
        "| Риск | Действий | | Tier | Действий | | Статус | Действий |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    risk_items = list(threats.most_common())
    tier_items = list(tiers.most_common())
    st_items = list(statuses.most_common())
    for i in range(max(len(risk_items), len(tier_items), len(st_items))):
        cells = []
        for coll in (risk_items, tier_items, st_items):
            if i < len(coll):
                k, v = coll[i]
                cells += [f"`{k}`", str(v)]
            else:
                cells += ["", ""]
        out.append("| " + " | ".join(cells) + " |")

    out += [
        "",
        "## Карта покрытия: домен × риск",
        "",
        "| Домен | Действий | R | W | D | E | M | I | T0 | T1+ | «не может» |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for domain in sorted(by_domain, key=lambda d: -len(by_domain[d])):
        items = by_domain[domain]
        c = Counter(r["risk"] for r in items)
        t0 = sum(1 for r in items if r["tier"] == "T0")
        th = sum(1 for r in items if r["tier"] in ("T1", "T2", "T3"))
        sup = sum(1 for r in items if r["human"] == "не может")
        out.append(
            f"| {DOMAIN_TITLES.get(domain, domain)} | {len(items)} | {c['read']} | {c['write-local']} | "
            f"{c['destructive']} | {c['external']} | {c['money']} | {c['identity']} | {t0} | {th} | {sup} |"
        )

    out += ["", "## Каталог по доменам", ""]
    for domain in sorted(by_domain, key=lambda d: (-len(by_domain[d]), d)):
        items = by_domain[domain]
        out += [f"### {DOMAIN_TITLES.get(domain, domain)} ({len(items)})", "",
                "| # | Действие | Пример команды | Реализация | Риск | Tier | Человек | Статус |",
                "| --- | --- | --- | --- | --- | --- | --- | --- |"]
        for r in items:
            impl = ", ".join(r["implementation"])[:70]
            note = f" — {r['notes']}" if r["notes"] else ""
            out.append(
                f"| {r['id'].split('-')[-1]} | **{r['verb']}** {r['object']} | _{r['example']}_ | "
                f"{impl} | {r['risk']} | {r['tier']} | {r['human']} | {r['status']}{note} |"
            )
        out.append("")

    # глаголы
    out += ["## Индекс глаголов", "",
            "Один и тот же глагол применяется к разным объектам — так мы проверяем "
            "систематичность покрытия.", "",
            "| Глагол | Действий | Где встречается |", "| --- | --- | --- |"]
    for verb, n in verbs.most_common():
        doms = sorted({r["domain"] for r in rows if r["verb"] == verb})
        out.append(f"| {verb} | {n} | {', '.join(doms[:6])}{'…' if len(doms) > 6 else ''} |")

    out += ["", "## Чего в реестре ещё нет (честные пробелы)", "",
            "1. **Профили конкретных приложений** (CapCut, Photoshop, 1С, Premiere, Excel-надстройки) — "
            "описываются отдельными файлами `profiles/*.json`, а не строками реестра.",
            "2. **Операции внутри веб-сервисов** (конкретные кнопки в Notion/Google Docs) — "
            "покрываются браузерным агентом, а не реестром.",
            "3. **Оборудование за пределами ПК** (промышленные контроллеры, лабораторные приборы) — "
            "только через плагины/MCP.",
            "4. **Действия, требующие ключей конкретных сервисов** — есть в реестре, но зависят "
            "от подключённого коннектора.",
            "",
            "Правило проекта: **новая фича без строки в этом реестре и тест-кейса не существует.**",
            ""]
    return "\n".join(out)


def check_unique_keys(rows: list[dict]) -> None:
    """Профили и скиллы ссылаются на действие строкой `domain|verb|object`.

    Если таких строк две, ссылка становится неоднозначной: валидатор разрешит её
    в первую попавшуюся, и профиль молча начнёт описывать не то действие. Поэтому
    ключ обязан быть уникальным — различия в оттенке смысла выражаются объектом
    («громкость» против «громкость по LUFS»), а не повтором.
    """
    seen: dict[tuple[str, str, str], str] = {}
    for row in rows:
        key = (row["domain"], row["verb"], row["object"])
        if key in seen:
            raise SystemExit(
                f"actions: дубль ключа {'|'.join(key)} — у {seen[key]} и {row['id']}. "
                "Уточни объект, чтобы ссылки из профилей и скиллов были однозначны."
            )
        seen[key] = row["id"]


def main() -> None:
    rows = load()
    check_unique_keys(rows)
    JSON_OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    MD_OUT.write_text(render(rows), encoding="utf-8")
    by_domain = Counter(r["domain"] for r in rows)
    print(f"actions: {len(rows)} in {len(by_domain)} domains -> "
          f"{MD_OUT.relative_to(ROOT)}, {JSON_OUT.relative_to(ROOT)}")
    thin = [d for d, n in by_domain.items() if n < 8]
    if thin:
        print("thin domains:", ", ".join(thin))


if __name__ == "__main__":
    main()
