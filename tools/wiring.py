#!/usr/bin/env python3
"""
Проверяет, что руки не только объявлены, но и подключены.

Зачем отдельно от `hands.py`. `data/tools.json` — это обещание («приложение умеет
вот это»), а умение живёт в двух других местах: в исполнении (`run()` в
`src-tauri/src/tools.rs`) и в доказательстве (`Evidence` в `step.rs`), которое
интерфейс переводит в слова (`src/lib/evidence.ts`). Если объявление есть, а ветки
исполнения нет, шаг падает с «объявлен, но не реализован» — и человек узнаёт об
этом не из проверки, а из проваленного дела. Если появился новый вид доказательства,
а перевода нет, экран молча ничего не скажет.

Что проверяется:

1. **объявлено → исполняется.** У каждой руки в `data/tools.json` есть ветка в
   `run()` и функция, на которую эта ветка ссылается;
2. **исполняется → объявлено.** В `run()` нет ветки для руки, которой нет в
   `data/tools.json`: иначе приложение умеет больше, чем обещает, и это тоже неправда;
3. **доказательство названо.** У каждого варианта `Evidence` есть `kind()` и строка;
4. **слово есть.** Каждый `kind` есть в типах интерфейса (`src/ipc/types.ts`) и
   переведён в человеческую фразу (`src/lib/evidence.ts`);
5. **параметры сходятся.** Каждый объявленный параметр читается своей функцией и
   наоборот: опечатка в имени даёт шаг, который молча работает с пустым значением.

Чего проверка не умеет и не притворяется, что умеет: она не знает, **какое**
доказательство возвращает конкретная рука, — это видно только в тестах Rust. Здесь
ловятся расхождения в списках, а не в поведении.

Usage:
    python3 tools/wiring.py    # exit 1 при расхождении
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "data" / "tools.json"
TOOLS_RS = ROOT / "src-tauri" / "src" / "tools.rs"
STEP_RS = ROOT / "src-tauri" / "src" / "step.rs"
TYPES_TS = ROOT / "src" / "ipc" / "types.ts"
EVIDENCE_TS = ROOT / "src" / "lib" / "evidence.ts"

ARM = re.compile(r'^\s*"([a-z0-9-]+\|[^"]+)"\s*=>', re.MULTILINE)
PARAM_READ = re.compile(r'param\(params,\s*"([a-z0-9_]+)"\)')
CALL = re.compile(r"([a-z_][a-z_0-9]*)\s*\(")
FUNCTION = re.compile(r"^fn ([a-z_0-9]+)\s*\(", re.MULTILINE)
KIND_ARM = re.compile(r'Evidence::([A-Za-z]+)\s*\{[^}]*\}\s*=>\s*"([a-z_]+)"')
TS_KIND = re.compile(r'\{\s*kind:\s*"([a-z_]+)"')
TS_CASE = re.compile(r'case\s+"([a-z_]+)":')
# Служебные вызовы, которые сами решают, чья это рука: у них ветка — блок, а не прямая функция.
HELPERS = {"simple", "native_result", "StepResult", "format", "vec"}


def match_block(source: str) -> str:
    """Тело `match registry { … }` внутри `run()` — там и живут ветки исполнения."""
    start = source.find("pub fn run(")
    if start < 0:
        raise SystemExit("tools.rs: не найдена функция run()")
    body = source[start:]
    match_at = body.find("match registry {")
    if match_at < 0:
        raise SystemExit("tools.rs: в run() нет match по реестру")
    tail = body[match_at:]
    depth = 0
    for index, char in enumerate(tail):
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return tail[:index]
    raise SystemExit("tools.rs: не найден конец match в run()")


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_branches(source: str) -> dict[str, str]:
    """Ветки `run()`: строка реестра → имя функции или служебный вызов."""
    block = match_block(source)
    found = list(ARM.finditer(block))
    branches: dict[str, str] = {}
    for index, arm in enumerate(found):
        tail = block[arm.end(): found[index + 1].start() if index + 1 < len(found) else len(block)]
        call = CALL.search(tail)
        if call is None:
            branches[arm.group(1)] = ""
            continue
        branches[arm.group(1)] = call.group(1)
    return branches


def defined_functions(source: str) -> set[str]:
    return set(FUNCTION.findall(source))


def evidence_variants(source: str) -> list[str]:
    """Варианты `pub enum Evidence`, в порядке объявления.

    Имена вариантов стоят в начале строки и начинаются с заглавной буквы; строки
    документации (`///`) и тела вариантов (`path: String`) именем не считаются.
    """
    start = source.find("pub enum Evidence")
    if start < 0:
        raise SystemExit("step.rs: не найден enum Evidence")
    names: list[str] = []
    for line in source[start:].splitlines()[1:]:
        if line.startswith("}"):
            break
        stripped = line.strip()
        if not stripped or stripped.startswith("///") or stripped.startswith("#"):
            continue
        name = stripped.split("{")[0].split(",")[0].strip()
        if re.fullmatch(r"[A-Z][A-Za-z0-9]*", name):
            names.append(name)
    return names


def declared_hands() -> list[dict]:
    data = json.loads(read(TOOLS))
    if not isinstance(data, list):
        raise SystemExit("data/tools.json: ожидался массив")
    return [tool for tool in data if isinstance(tool, dict)]


def function_body(source: str, name: str) -> str:
    """Тело функции `name` — от её заголовка до следующей функции верхнего уровня."""
    start = source.find(f"\nfn {name}(")
    if start < 0:
        return ""
    tail = source[start + 4 :]
    end = tail.find("\nfn ")
    return tail if end < 0 else tail[:end]


def main() -> int:
    tools_source = read(TOOLS_RS)
    step_source = read(STEP_RS)

    hands = declared_hands()
    registries = [hand.get("registry", "") for hand in hands]
    branches = run_branches(tools_source)
    functions = defined_functions(tools_source)

    errors: list[str] = []

    for registry in registries:
        if registry not in branches:
            errors.append(f"'{registry}' объявлена как рука, но ветки в run() нет")
            continue
        fn = branches[registry]
        if not fn:
            errors.append(f"'{registry}' — ветка без вызова: непонятно, что исполняется")
        elif fn not in HELPERS and fn not in functions:
            errors.append(f"'{registry}' ведёт на функцию {fn}(), а её в tools.rs нет")

    for registry in branches:
        if registry not in registries:
            errors.append(f"'{registry}' исполняется, но в data/tools.json её нет")

    # Имена параметров — единственное, что связывает данные с кодом: опечатка в одном
    # месте даёт шаг, который молча работает с пустым значением.
    for hand in hands:
        registry = hand.get("registry", "")
        declared = {param.get("name", "") for param in hand.get("params", [])}
        fn = branches.get(registry, "")
        if not fn or fn in HELPERS:
            continue
        used = set(PARAM_READ.findall(function_body(tools_source, fn)))
        for name in sorted(declared - used):
            errors.append(
                f"'{registry}': параметр '{name}' объявлен, но функция {fn}() его не читает"
            )
        for name in sorted(used - declared):
            errors.append(
                f"'{registry}': функция {fn}() читает параметр '{name}', а он не объявлен"
            )

    variants = evidence_variants(step_source)
    arms = dict(KIND_ARM.findall(step_source))
    for variant in variants:
        if variant not in arms:
            errors.append(f"Evidence::{variant} не назван в kind()")

    kinds = {kind for kind in arms.values()}
    ts_kinds = set(TS_KIND.findall(read(TYPES_TS)))
    translated = set(TS_CASE.findall(read(EVIDENCE_TS)))

    for kind in sorted(kinds - ts_kinds):
        errors.append(f"вид доказательства '{kind}' есть в Rust, но не объявлен в src/ipc/types.ts")
    for kind in sorted(ts_kinds - kinds):
        errors.append(f"вид доказательства '{kind}' объявлен в типах, но Rust его не называет")
    for kind in sorted(kinds - translated):
        errors.append(f"вид доказательства '{kind}' не переведён в слова в src/lib/evidence.ts")

    if errors:
        for error in errors:
            print(f"— {error}", file=sys.stderr)
        print(f"расхождений: {len(errors)}", file=sys.stderr)
        return 1

    print(
        f"wiring: {len(hands)} рук — у каждой ветка исполнения и её параметры; "
        f"доказательств {len(variants)} — у каждого название и перевод"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
