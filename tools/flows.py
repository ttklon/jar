#!/usr/bin/env python3
"""
Проверяет `data/flows.json` — сценарии: несколько «рук» подряд, как одна процедура.

Зачем: сценарий — это обещание («освободи место»), собранное из отдельных шагов.
Ошибка в нём не падает — она тихо ломается на середине у пользователя: шаг ссылается
на несуществующий инструмент, параметр назван иначе, риск сценария ниже, чем у его
же шагов. Поэтому инварианты проверяются здесь, до сборки.

Инварианты:
  1. файл — массив; `id` — слаг (`a-z`, `0-9`, `-`) и уникален;
  2. обязательные поля: id/title/summary/registry/risk/inputs/steps; `steps` непустой;
  3. `registry` сценария существует в реестре, не `never`, риск не `identity`/`money`;
  4. объявленный риск равен максимальному риску шагов (сценарий не может обещать
     меньше, чем делает);
  5. каждый шаг ссылается на инструмент из `data/tools.json`;
  6. параметры шага — только объявленные у инструмента, обязательные заполнены;
  7. значения `$имя` ссылаются на объявленный вход, каждый вход используется хотя бы раз;
  8. у каждого шага есть `note` — человек видит, что произойдёт, а не имя инструмента.

Usage:
    python3 tools/flows.py    # exit 1 при нарушении
"""

from __future__ import annotations

import json
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FLOWS = ROOT / "data" / "flows.json"
TOOLS = ROOT / "data" / "tools.json"
ACTIONS = ROOT / "data" / "actions.json"

SLUG = re.compile(r"^[a-z][a-z0-9-]*$")
PLACEHOLDER = re.compile(r"^\$([a-z][a-z0-9_]*)$")
FORBIDDEN_RISK = {"identity", "money"}
RISK_ORDER = ["read", "write-local", "external", "destructive", "identity", "money"]
REQUIRED_FIELDS = ("id", "title", "summary", "registry", "risk", "inputs", "steps")


def load_actions() -> dict[str, dict]:
    rows = json.loads(ACTIONS.read_text(encoding="utf-8"))
    return {f"{r['domain']}|{r['verb']}|{r['object']}": r for r in rows}


def load_tools() -> dict[str, dict]:
    rows = json.loads(TOOLS.read_text(encoding="utf-8"))
    return {r["registry"]: r for r in rows}


def max_risk(risks: list[str]) -> str:
    best = "read"
    for risk in risks:
        if RISK_ORDER.index(risk) > RISK_ORDER.index(best):
            best = risk
    return best


def check_flow(index: int, flow: dict, actions: dict[str, dict], tools: dict[str, dict]) -> list[str]:
    tag = f"flows[{index}]"
    errors: list[str] = []

    for field in REQUIRED_FIELDS:
        if field not in flow:
            errors.append(f"{tag}: нет поля '{field}'")

    flow_id = flow.get("id", "")
    if not SLUG.match(flow_id):
        errors.append(f"{tag}: id '{flow_id}' должен быть слагом (a-z, 0-9, дефис)")

    for field in ("title", "summary"):
        value = flow.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{tag}: поле '{field}' пустое")

    registry = flow.get("registry", "")
    action = actions.get(registry)
    if action is None:
        errors.append(f"{tag}: '{registry}' нет в реестре — сценарий обязан опираться на строку actions.psv")
    else:
        if action["risk"] in FORBIDDEN_RISK:
            errors.append(f"{tag}: '{registry}' имеет риск '{action['risk']}' — такие действия не выполняются")
        if action["status"] == "never":
            errors.append(f"{tag}: '{registry}' помечен never")

    inputs = flow.get("inputs")
    if not isinstance(inputs, list):
        errors.append(f"{tag}: 'inputs' должен быть списком")
        inputs = []

    declared: set[str] = set()
    for position, item in enumerate(inputs):
        if not isinstance(item, dict):
            errors.append(f"{tag}.inputs[{position}]: ожидался объект")
            continue
        name = item.get("name", "")
        if not re.match(r"^[a-z][a-z0-9_]*$", name):
            errors.append(f"{tag}.inputs[{position}]: имя '{name}' должно быть латиницей (a-z, 0-9, _)")
        if name in declared:
            errors.append(f"{tag}.inputs[{position}]: вход '{name}' объявлен дважды")
        declared.add(name)
        if not isinstance(item.get("label"), str) or not item["label"].strip():
            errors.append(f"{tag}.inputs[{name}]: пустая подпись")
        if not isinstance(item.get("required"), bool):
            errors.append(f"{tag}.inputs[{name}]: 'required' должен быть true/false")

    steps = flow.get("steps")
    if not isinstance(steps, list) or not steps:
        errors.append(f"{tag}: 'steps' должен быть непустым списком")
        return errors

    used: set[str] = set()
    step_risks: list[str] = []

    for position, step in enumerate(steps):
        where = f"{tag}.steps[{position}]"
        if not isinstance(step, dict):
            errors.append(f"{where}: ожидался объект")
            continue

        note = step.get("note")
        if not isinstance(note, str) or not note.strip():
            errors.append(f"{where}: пустой 'note' — человек не увидит, что произойдёт")

        tool_key = step.get("tool", "")
        tool = tools.get(tool_key)
        if tool is None:
            errors.append(f"{where}: инструмента '{tool_key}' нет в data/tools.json")
            continue

        tool_action = actions.get(tool_key)
        if tool_action is not None:
            step_risks.append(tool_action["risk"])

        params = step.get("params", {})
        if not isinstance(params, dict):
            errors.append(f"{where}: 'params' должен быть объектом")
            continue

        known = {p["name"]: p for p in tool.get("params", [])}
        for name, value in params.items():
            if name not in known:
                errors.append(f"{where}: у инструмента '{tool_key}' нет параметра '{name}'")
                continue
            placeholder = PLACEHOLDER.match(str(value))
            if placeholder:
                if placeholder.group(1) not in declared:
                    errors.append(f"{where}.{name}: '${placeholder.group(1)}' не объявлен во inputs")
                else:
                    used.add(placeholder.group(1))
            elif not str(value).strip():
                errors.append(f"{where}.{name}: пустое значение")

        for name, spec in known.items():
            if spec.get("required") and name not in params:
                errors.append(f"{where}: не заполнен обязательный параметр '{name}'")

    for name in sorted(declared - used):
        errors.append(f"{tag}: вход '{name}' объявлен, но ни один шаг его не использует")

    declared_risk = flow.get("risk", "")
    if step_risks:
        expected = max_risk(step_risks)
        if declared_risk != expected:
            errors.append(
                f"{tag}: риск сценария '{declared_risk}', а самый опасный шаг — '{expected}' — "
                "политика не должна выглядеть мягче, чем действие"
            )

    return errors


def check(flows: list[dict], actions: dict[str, dict], tools: dict[str, dict]) -> list[str]:
    errors: list[str] = []
    seen: dict[str, int] = {}

    for index, flow in enumerate(flows):
        if not isinstance(flow, dict):
            errors.append(f"flows[{index}]: ожидался объект")
            continue
        flow_id = flow.get("id", "")
        if flow_id in seen:
            errors.append(f"flows[{index}]: id '{flow_id}' уже занят в flows[{seen[flow_id]}]")
        seen[flow_id] = index
        errors.extend(check_flow(index, flow, actions, tools))

    return errors


def main() -> int:
    flows = json.loads(FLOWS.read_text(encoding="utf-8"))
    if not isinstance(flows, list):
        print("flows: data/flows.json должен быть массивом")
        return 1

    actions = load_actions()
    errors = check(flows, actions, load_tools())

    if errors:
        print(f"flows: {len(errors)} ошибок в data/flows.json")
        for error in errors:
            print(f"  - {error}")
        return 1

    steps = sum(len(flow["steps"]) for flow in flows)
    confirming = sum(
        1
        for flow in flows
        for step in flow["steps"]
        if actions[step["tool"]]["risk"] != "read"
    )
    print(
        f"flows: {len(flows)} сценариев, {steps} шагов "
        f"({confirming} с подтверждением), риск сценария = самый опасный шаг"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
