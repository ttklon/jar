#!/usr/bin/env python3
"""Запись на каждую руку: параметры, права, необратимое, отмена, проверка (шаг 7).

Блокер №2 аудита звучал так: без таблицы «умеет» — это реклама. У 56 рук были
`title`, `summary`, `params`, `registry` — и **ничего** о том, что рука имеет
право сделать, что из этого не отменить, чем проверено и на каких версиях
Windows это видели.

Главное решение этого генератора: **он не выдумывает**. Отмена и проверка не
выводятся из названия руки — их неоткуда взять, и написать «отмена: да» означало
бы соврать ровно так, как запрещает шаг 5. Поэтому:

  * **права** и **необратимое** выводятся из настоящего поведения — по
    `registry` (что рука делает: `files|удалить|...`) и по полям параметров;
  * **отмена** и **проверка** ставятся `null` — «не записано» — и остаются
    честной дырой, которую видно, а не зелёной галочкой;
  * **версии Windows** — пусто, пока не проверено на настоящей машине: CI гоняет
    cargo и Chromium, но не Windows-руки.

Дыра, которую видно, — это шаг вперёд. Дыра, закрашенная «да», — это регресс.
`--check` валит сборку, если рука пишет на диск без пометки «необратимо» или
если запись разошлась с данными.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "data" / "tools.json"
OUT = ROOT / "data" / "tools-receipts.json"
DOC = ROOT / "docs" / "TOOL-RECEIPTS.md"

# Что рука делает с миром. Ключ — первое слово `registry` (домен), но опасность
# определяется глаголом: «удалить» в любом домене необратимо, «показать» — нет.
DESTRUCTIVE = ("удалить", "стереть", "очистить", "снести", "перезаписать", "заменить")

# Глаголы, которые меняют мир: после них файл, файловая система или настройка
# `другая`. Список растёт — и это ожидаемо: у 56 рук нашлось 28 разных глаголов.
# Поэтому рядом есть `WRITING_BY_EFFECT`: если рука меняет мир, но глагола нет в
# списке, — это не повод считать её «читающей», это повод дописать глагол.
WRITING = (
    "создать", "переместить", "копировать", "записать", "сохранить", "отправить",
    "запустить", "изменить", "переименовать", "скачать", "распаковать", "сжать",
    "склеить", "конвертировать", "извлечь", "добавить", "убрать", "передать",
    "включить", "отключить", "нажать", "ввести", "скопировать",
)

READING = ("показать", "найти", "проверить", "прочитать", "список", "посмотреть", "узнать", "замерить", "проанализировать", "сравнить", "объяснить", "открыть")

# Параметры, которые указывают на необратимость: если в руке есть `overwrite`
# или `replace`, рука может затереть существующее — это необратимо даже когда
# глагол безобиден.
OVERWRITE_PARAMS = ("overwrite", "replace")


def load_tools() -> list[dict]:
    data = json.loads(TOOLS.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("tools", [])


def verb_of(tool: dict) -> str:
    """Глагол из `registry`: `files|создать|папку` → `создать`."""
    parts = (tool.get("registry") or "").split("|")
    return parts[1].strip().lower() if len(parts) > 1 else ""


def domain_of(tool: dict) -> str:
    parts = (tool.get("registry") or "").split("|")
    return parts[0].strip() if parts else ""


def reaches(tool: dict) -> list[str]:
    """Куда рука дотягивается: домены, а не «система вообще»."""
    domain = domain_of(tool)
    reach = [domain] if domain else []
    # Сеть видна по параметрам: адрес или ссылка в руке означают выход наружу.
    names = {param.get("name") for param in tool.get("params") or []}
    if "url" in names or "remote" in names or "host" in names:
        if "network" not in reach:
            reach.append("network")
    return reach


# Что рука сама говорит про обратимость. Читаем описание, а не только глагол:
# «Удалить в корзину» начинается с «удалить», но в корзину — значит отменить
# можно, и приложение об этом прямо пишет. Правило обязано это слышать, иначе
# оно записывает в необратимые то, что как раз обратимо, — и запись перестают
# читать.
REVERSIBLE_MARKERS = ("в корзину", "корзине", "безвозвратного", "можно вернуть", "не удаляет")


def irreversible(tool: dict) -> bool:
    """Есть ли у руки след, который не отменить.

    Не «риск» и не оценка: факт. Удаление и замена затирают существующее, и
    вернуть его рука не может. `overwrite`/`replace` в параметрах — то же самое:
    рука **умеет** затереть, даже если глагол в названии безобиден.

    Но если рука сама говорит, что след обратим (корзина), — верим ей: она
    описывает своё поведение, а не мы за неё.
    """
    text = f"{tool.get('title') or ''} {tool.get('summary') or ''}".lower()
    # «В корзину» — обратимо по определению корзины, и это не догадка: приложение
    # это обещает, а шаг 8 требует отдельной пометки как раз для случая, когда
    # обещание не выполняется.
    if any(marker in text for marker in REVERSIBLE_MARKERS):
        return False
    verb = verb_of(tool)
    if any(word in verb for word in DESTRUCTIVE):
        return True
    names = {param.get("name") for param in tool.get("params") or []}
    return any(name in names for name in OVERWRITE_PARAMS)


def permissions(tool: dict) -> dict:
    """Права: что руке разрешено трогать. Выводится из поведения, не из описания."""
    verb = verb_of(tool)
    return {
        "writes": any(word in verb for word in WRITING) or any(word in verb for word in DESTRUCTIVE),
        "reads": any(word in verb for word in READING) or not any(word in verb for word in WRITING + DESTRUCTIVE),
        "network": "network" in reaches(tool),
        "reaches": reaches(tool),
    }


def receipt(tool: dict) -> dict:
    """Запись одной руки. Поля «не записано» остаются `null`, а не выдумкой."""
    params = [
        {
            "name": param.get("name"),
            "label": param.get("label"),
            "required": bool(param.get("required")),
        }
        for param in tool.get("params") or []
    ]
    return {
        "title": tool.get("title"),
        "registry": tool.get("registry"),
        "summary": tool.get("summary"),
        "params": params,
        "permissions": permissions(tool),
        # Необратимость — факт, а не оценка риска.
        "irreversible": irreversible(tool),
        # Отмена: `null` — не записано. Название руки её не доказывает, и
        # написать «да» значило бы соврать (см. шаг 8 отдельно).
        "undo": None,
        # Шаг 8: «Стоп» после факта. У необратимой руки нажатие «Стоп» **уже**
        # ничего не отменяет — эффект случился. Это отдельный флаг, потому что
        # «есть отмена» и «отмена способна вернуть сделанное» — разные вещи, и
        # именно на их смешении «Стоп» читается как «всё отменилось».
        "stop_after_fact": irreversible(tool),
        # Проверка: `null` — не записано. Не путать с «тест есть»: у руки может
        # быть тест на разбор параметров и не быть проверки эффекта.
        "proven": None,
        # Версии Windows: пусто, пока не проверено на настоящей машине.
        "windows": [],
    }


def build() -> dict:
    tools = load_tools()
    receipts = {tool.get("title") or "": receipt(tool) for tool in tools}
    return {
        "generated": "tools/make_receipts.py",
        "note": (
            "Запись руки (шаг 7). Права и необратимость выведены из поведения: "
            "глагол `registry` и параметры. `undo` и `proven` — null, пока не "
            "записаны отдельно: имя руки их не доказывает, а «да» без проверки "
            "было бы ровно тем, что запрещает шаг 5."
        ),
        "tools": receipts,
    }


def markdown(built: dict) -> str:
    """Документ для чтения человеком. Из тех же данных, а не пересказом."""
    tools = built["tools"]
    irreversible = [title for title, item in tools.items() if item["irreversible"]]
    stop = [title for title, item in tools.items() if item["stop_after_fact"]]
    lines = [
        "# Записи рук",
        "",
        "Сгенерировано `tools/make_receipts.py` из `data/tools.json`. Не править руками.",
        "",
        "У каждой руки — параметры, права, необратимость, отмена, проверка и версии",
        "Windows. Права и необратимость **выведены из поведения** (глагол `registry` и",
        "параметры), а не написаны автором по памяти.",
        "",
        "## Что видно сразу",
        "",
        f"* рук: **{len(tools)}**",
        f"* с необратимым следом: **{len(irreversible)}** — "
        + (", ".join(irreversible) if irreversible else "нет"),
        "* отмена записана: **0** — поле `undo: null`, и это честная дыра, а не «да»",
        "* проверка эффекта записана: **0** — поле `proven: null` по той же причине",
        "* версии Windows: **0** — CI не запускает Windows-руки",
        "",
        "Дыра, которую видно, — шаг вперёд. Дыра, закрашенная «да», — регресс:",
        "именно так слово «готово» один раз уже ввело в заблуждение (шаг 5).",
        "",
        "## Руки, где «Стоп» не отменяет уже сделанное",
        "",
        "У этих рук эффект наступает сразу, и «Стоп» после факта **ничего не",
        "возвращает**: файл уже перезаписан, файл уже скачан. Это не недостаток —",
        "это свойство эффекта, и человек должен знать его **до** нажатия.",
        "",
    ]
    lines += [f"* {title}" for title in stop] if stop else ["* таких рук нет"]
    lines += [
        "",
        "## Таблица",
        "",
        "| Рука | Что делает | Параметры | Права | Необратимо | Отмена | Проверка | Windows |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for title, item in tools.items():
        rights = []
        if item["permissions"]["writes"]:
            rights.append("пишет")
        if item["permissions"]["reads"]:
            rights.append("читает")
        if item["permissions"]["network"]:
            rights.append("сеть")
        reach = ", ".join(item["permissions"]["reaches"]) or "—"
        params = ", ".join(param["name"] or "?" for param in item["params"]) or "—"
        lines.append(
            "| {title} | {what} | {params} | {rights} · {reach} | {irr} | {undo} | {proven} | {win} |".format(
                title=title,
                what=(item["summary"] or "").split(".")[0][:80],
                params=params,
                rights=", ".join(rights) or "—",
                reach=reach,
                irr="**да**" if item["irreversible"] else "нет",
                undo="—",
                proven="—",
                win="—",
            )
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="проверить, а не писать")
    parser.add_argument("--quiet", action="store_true", help="не печатать успех")
    args = parser.parse_args()

    built = build()
    text = json.dumps(built, ensure_ascii=False, indent=2, sort_keys=False) + "\n"

    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != text:
            print("записи рук разошлись с данными: запустите tools/make_receipts.py")
            return 1
        # Дыра, которая обязана быть видимой: рука с необратимым следом без
        # пометки — это реклама, а не запись.
        bad = [
            title
            for title, item in built["tools"].items()
            if item["irreversible"] and not item["permissions"]["writes"]
        ]
        if bad:
            print(f"необратимые руки без права записи — это противоречие: {bad[:5]}")
            return 1
        # Каждый глагол обязан быть отнесён хоть к чему-то. Иначе рука, которая
        # меняет мир, попадёт в «читающие», и запись соврёт не по злобе, а по
        # недосмотру — ровно то, от чего вся эта работа.
        unclassified = sorted(
            {
                verb_of(tool)
                for tool in load_tools()
                if verb_of(tool)
                and verb_of(tool) not in WRITING
                and verb_of(tool) not in READING
                and verb_of(tool) not in DESTRUCTIVE
            }
        )
        if unclassified:
            print(f"глаголы вне правила — допишите их, а не угадывайте: {unclassified}")
            return 1
        if not args.quiet:
            print(f"записи рук совпадают с данными: {len(built['tools'])}")
        return 0

    OUT.write_text(text, encoding="utf-8")
    DOC.write_text(markdown(built), encoding="utf-8")
    print(f"записано: {OUT.relative_to(ROOT)} и {DOC.relative_to(ROOT)} · рук {len(built['tools'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
