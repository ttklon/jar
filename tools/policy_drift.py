#!/usr/bin/env python3
"""
Политика не расширяется молча (шаг 178).

Почему отдельная проверка, а не тест в vitest. Политика — таблица «риск →
решение» в `src-tauri/src/policy.rs`, и она меняется **в Rust**, то есть в файле,
которого сборка интерфейса не касается. Тест на TypeScript увидит изменение
только если кто-то не забудет его прогнать; эта проверка стоит в `check_all.py`
рядом с остальными и срабатывает на каждом прогоне.

Что считается расширением:

  * `deny` → `confirm`/`allow` — система раньше не могла, теперь может;
  * `confirm` → `allow` — подтверждение больше не спрашивается;
  * ветка исчезла — политика про этот риск молчит (в Rust `match` тогда не
    собирается, но и «стало строже» это не значит).

Сужение (`allow` → `confirm` → `deny`) не падает никогда: закрывать дыры должно
быть легко, иначе их не закроют.

Usage:
    python3 tools/policy_drift.py           # печатает итог
    python3 tools/policy_drift.py --quiet    # молчит, если чисто
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "src-tauri" / "src" / "policy.rs"

# Объявленная граница: что обещано человеку. Не «что в коде» — код сверяется с этим.
DECLARED = {
    "read": "allow",
    "write-local": "confirm",
    "external": "confirm",
    "destructive": "confirm",
    "identity": "deny",
    "money": "deny",
}

# Больше — мягче. Незнакомое слово — самое мягкое (9): опечатка `Deni` не должна
# читаться как отказ.
SOFT = {"deny": 0, "confirm": 1, "allow_with_notice": 2, "allow": 2}


def softness(decision: str) -> int:
    return SOFT.get(decision.strip().lower(), 9)


def read_policy(text: str) -> dict[str, str]:
    """Прочитать `Risk::X => Decision::Y` из текста политики."""
    table: dict[str, str] = {}
    for match in re.finditer(r"Risk::(\w+)\s*=>\s*Decision::(\w+)", text):
        name = re.sub(r"(?<=[a-z0-9])([A-Z])", r"-\1", match.group(1)).lower()
        table[name] = match.group(2).lower()
    return table


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    if not POLICY.exists():
        print(f"policy drift: {POLICY} not found", file=sys.stderr)
        return 1

    table = read_policy(POLICY.read_text(encoding="utf-8"))
    if not table:
        # Пустая таблица — не «всё хорошо», а «разбор сломался».
        print("policy drift: no `Risk::… => Decision::…` rows found in policy.rs", file=sys.stderr)
        return 1

    widened: list[str] = []
    for risk, was in DECLARED.items():
        now = table.get(risk)
        if now is None:
            widened.append(f"{risk}: ветки нет — объявлено «{was}»")
        elif softness(now) > softness(was):
            widened.append(f"{risk}: было «{was}», стало «{now}»")

    if widened:
        print("политика расширилась: " + "; ".join(widened), file=sys.stderr)
        return 1

    if not args.quiet:
        print(f"политика не расширилась: {len(DECLARED)} рисков сверены с policy.rs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
