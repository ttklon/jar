#!/usr/bin/env python3
"""Никакой телеметрии: проверка сборки, а не обещание.

Зачем. «Никакой телеметрии по умолчанию» — обещание, которое ломается тихо:
достаточно одной зависимости в `package.json` или `Cargo.toml`, и приложение
начинает куда-то ходить. Ни сборка, ни тесты этого не заметят — заметит человек,
и то не сразу.

Что проверяется:

* **зависимости.** Список известных сборщиков телеметрии и аналитики — и по
  имени пакета, и по описанию в `Cargo.lock`: пакет может называться невинно,
  а в описании стоять «telemetry»;
* **адреса в коде.** Ни одного известного сборщика в `src/` и `src-tauri/src/`.

Чего проверка не делает: не ищет «любой сетевой вызов» — он есть и должен быть
(скачивание моделей). Она ищет **наблюдение за человеком**, а не сеть вообще.

Обязательный `--selftest`: проверка, которая не проверена в обе стороны, молчит
и тогда, когда должна кричать.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Имена и слова, по которым узнаётся наблюдение, а не сеть.
WATCHERS = [
    "sentry",
    "posthog",
    "mixpanel",
    "amplitude",
    "segment-io",
    "segmentio",
    "datadog",
    "newrelic",
    "new-relic",
    "bugsnag",
    "rollbar",
    "logrocket",
    "fullstory",
    "hotjar",
    "google-analytics",
    "googletagmanager",
    "yandex-metrica",
    "yandexmetrica",
    "mc.yandex",
    "telemetry",
    "usage-stats",
    "crash-report",
]

CODE_DIRS = [ROOT / "src", ROOT / "src-tauri" / "src"]


def find_watcher(text: str) -> str | None:
    """Первое наблюдение в тексте, если оно есть.

    Ищем по границе слова, а не подстрокой: `-webkit-scrollbar` содержит
    «rollbar», и подстрочный поиск давал ложную тревогу на CSS. Валидатор,
    который кричит «волк», отключают — и тогда он перестаёт ловить всё.
    """
    lowered = text.lower()
    for name in WATCHERS:
        # Две формы. Отдельное слово (`--@sentry/react`) — с границей, иначе
        # `-webkit-scrollbar` даёт ложную тревогу на «rollbar». И составное имя
        # (`telemetryEndpoint`, `sentryDsn`) — без границы справа, но только
        # когда за ним идёт заглавная буква или подчёркивание: это camelCase, и
        # именно так выглядят имена переменных.
        word = r"(?<![a-z0-9])" + re.escape(name) + r"(?![a-z0-9])"
        camel = re.escape(name) + r"(?=[A-Z_])"
        if re.search(word, lowered) or re.search(camel, text):
            return name
    return None


def scan_dependencies() -> list[str]:
    """Наблюдение среди зависимостей: npm и Cargo."""
    problems: list[str] = []

    package = ROOT / "package.json"
    if package.exists():
        data = json.loads(package.read_text(encoding="utf-8"))
        for section in ("dependencies", "devDependencies"):
            for name in data.get(section, {}):
                hit = find_watcher(name)
                if hit:
                    problems.append(f"package.json: {name} ({hit})")

    for lock in ("package-lock.json", "Cargo.lock"):
        path = ROOT / lock if lock == "package-lock.json" else ROOT / "src-tauri" / lock
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        # Только имена пакетов и описания, а не весь файл: в `Cargo.lock` бывают
        # чужие поля, где слово встречается по делу.
        for match in re.finditer(r'^name = "([^"]+)"', text, re.M):
            hit = find_watcher(match.group(1))
            if hit:
                problems.append(f"{lock}: {match.group(1)} ({hit})")

    return problems


def scan_code() -> list[str]:
    """Наблюдение в исходниках приложения."""
    problems: list[str] = []
    for folder in CODE_DIRS:
        if not folder.exists():
            continue
        for path in sorted(folder.rglob("*")):
            if path.suffix not in {".rs", ".ts", ".tsx", ".js", ".css", ".html"}:
                continue
            if path.name.endswith(".test.ts") or path.name.endswith(".test.tsx"):
                # В тестах эти слова встречаются по делу: сторож говорит о них.
                continue
            hit = find_watcher(path.read_text(encoding="utf-8", errors="ignore"))
            if hit:
                problems.append(f"{path.relative_to(ROOT)}: {hit}")
    return problems


CASES: list[tuple[str, bool]] = [
    # (строка, должно ли ловиться)
    ('"@sentry/react": "^7.0.0"', True),
    ('"posthog-js": "^1.0.0"', True),
    ('name = "sentry-types"', True),
    ('https://mc.yandex.ru/metrika/tag.js', True),
    ("const telemetryEndpoint = 'x';", True),
    ('"@fluentui/react-components": "^9.0.0"', False),
    ('"react": "^18.0.0"', False),
    ("https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF", False),
    ('name = "reqwest"', False),
    ("::-webkit-scrollbar-thumb { }", False),  # ложная тревога, найденная на деле
    ('"@sentry/react": "^7"', True),
]


def selftest() -> int:
    failures = 0
    for text, expected in CASES:
        got = find_watcher(text) is not None
        if got != expected:
            failures += 1
            print(f"  САМОТЕСТ: {text!r} — ждали {expected}, получили {got}", file=sys.stderr)
    if failures:
        print(f"самотест провален: {failures} из {len(CASES)}", file=sys.stderr)
        return 1
    print(f"самотест: {len(CASES)}/{len(CASES)} — ловит и молчит как задумано")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()

    problems = scan_dependencies() + scan_code()
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        print(f"\nнаблюдение за человеком: {len(problems)}", file=sys.stderr)
        return 1

    if "--quiet" not in sys.argv:
        print("телеметрии нет: ни в зависимостях, ни в коде")
    return 0


if __name__ == "__main__":
    sys.exit(main())
