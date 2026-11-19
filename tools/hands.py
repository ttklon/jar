#!/usr/bin/env python3
"""
Проверяет `data/tools.json` — список инструментов, которые приложение умеет
выполнять прямо сейчас («руки»).

Зачем отдельный валидатор: файл читают три стороны — Rust (исполнение),
интерфейс (экран «Руки») и CI. Если инструмент ссылается на действие, которого
нет в реестре, или обещает то, что реестр помечает как `identity`/`money`,
приложение тихо начинает врать. Ловим это здесь, а не в проде.

Инварианты:
  1. файл — массив объектов с полями registry/title/summary/implementation/params;
  2. ключ `registry` уникален и существует в `data/actions.json`;
  3. риск действия не `identity` и не `money` — такие система не выполняет;
  4. статус действия не `never`;
  5. имена параметров — латиница/цифры/подчёркивание и уникальны внутри инструмента
     (они же суффиксы переменных окружения `ZS_*`);
  6. обязательные параметры помечены `required: true`.

Usage:
    python3 tools/hands.py    # exit 1 при нарушении
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "data" / "tools.json"
ACTIONS = ROOT / "data" / "actions.json"

PARAM_NAME = re.compile(r"^[a-z][a-z0-9_]*$")
FORBIDDEN_RISK = {"identity", "money"}
REQUIRED_FIELDS = ("registry", "title", "summary", "implementation", "params")


def load_actions() -> dict[str, dict]:
    rows = json.loads(ACTIONS.read_text(encoding="utf-8"))
    return {f"{r['domain']}|{r['verb']}|{r['object']}": r for r in rows}


def check(tools: list[dict], actions: dict[str, dict]) -> list[str]:
    errors: list[str] = []
    seen: dict[str, int] = {}

    for index, tool in enumerate(tools):
        tag = f"tools[{index}]"

        if not isinstance(tool, dict):
            errors.append(f"{tag}: ожидался объект")
            continue

        for field in REQUIRED_FIELDS:
            if field not in tool:
                errors.append(f"{tag}: нет поля '{field}'")

        registry = tool.get("registry", "")
        if registry in seen:
            errors.append(f"{tag}: ключ '{registry}' уже объявлен в tools[{seen[registry]}]")
        seen[registry] = index

        for field in ("title", "summary", "implementation"):
            value = tool.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{tag}: поле '{field}' пустое")

        action = actions.get(registry)
        if action is None:
            errors.append(
                f"{tag}: '{registry}' нет в реестре — инструмент обязан опираться на строку actions.psv"
            )
        else:
            risk = action["risk"]
            if risk in FORBIDDEN_RISK:
                errors.append(f"{tag}: '{registry}' имеет риск '{risk}' — такие действия не выполняются")
            if action["status"] == "never":
                errors.append(f"{tag}: '{registry}' помечен never")

        params = tool.get("params")
        if not isinstance(params, list):
            errors.append(f"{tag}: 'params' должен быть списком")
            continue

        names: set[str] = set()
        for param in params:
            if not isinstance(param, dict):
                errors.append(f"{tag}: параметр должен быть объектом")
                continue
            name = param.get("name", "")
            if not PARAM_NAME.match(name):
                errors.append(f"{tag}: имя параметра '{name}' должно быть латиницей (a-z, 0-9, _)")
            if name in names:
                errors.append(f"{tag}: параметр '{name}' объявлен дважды")
            names.add(name)
            if not isinstance(param.get("label"), str) or not param["label"].strip():
                errors.append(f"{tag}.{name}: пустая подпись")
            if not isinstance(param.get("required"), bool):
                errors.append(f"{tag}.{name}: 'required' должен быть true/false")

    return errors


def main() -> int:
    tools = json.loads(TOOLS.read_text(encoding="utf-8"))
    if not isinstance(tools, list):
        print("hands: data/tools.json должен быть массивом")
        return 1

    actions = load_actions()
    errors = check(tools, actions)

    if errors:
        print(f"hands: {len(errors)} ошибок в data/tools.json")
        for error in errors:
            print(f"  - {error}")
        return 1

    with_params = sum(1 for tool in tools if tool.get("params"))
    print(
        f"hands: {len(tools)} инструментов ({with_params} с параметрами), "
        f"все опираются на реальные строки реестра"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
