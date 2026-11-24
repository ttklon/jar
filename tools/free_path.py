#!/usr/bin/env python3
"""Платного нет на пути по умолчанию — и это проверка сборки.

Зачем. «Бесплатно» легко становится обещанием из README: достаточно добавить
одну строку — ключ API, адрес облака, поле `api_key` — и путь по умолчанию
уже ведёт к чужому счёту. Сборка этого не заметит, тесты тоже: они идут по
локальному пути и не спрашивают, почему он локальный.

Что проверяется:

* **каждый адрес, который приложение открывает, — бесплатный источник.**
  Список разрешённых хостов маленький и лежит здесь же; всё остальное —
  провал. Адреса берутся из `data/readiness.json` (каталог первого запуска)
  и из `src-tauri/src/*.rs` — по литералам `https://…`;
* **ни ключей, ни биллинга.** Адрес модели на Hugging Face не должен нести
  `?token=`, а в каталоге не должно быть полей вида `api_key`/`token`/`billing`:
  платный сервис узнаётся не по имени, а по тому, что просит ключ.

Чего проверка не делает: не ходит в сеть (иначе сама была бы запросом) и не
судит лицензии — это `data/readiness.json` и его тесты. Она отвечает на один
вопрос: **уводит ли путь по умолчанию к чужому счёту.**

`--selftest` обязателен: валидатор, который не проверен в обе стороны, молчит
и тогда, когда должен кричать.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Хосты, с которых приложение что-то берёт. Все — бесплатные: исходники
# моделей, релизы движков. Список короткий намеренно: добавить в него хост —
# значит сказать «с него можно скачивать», и это решение, а не мелочь.
ALLOWED_HOSTS = [
    "huggingface.co",  # модели и веса распознавания
    "github.com",  # релизы llama.cpp и whisper.cpp
    "objects.githubusercontent.com",  # редирект ассетов GitHub Releases
    "raw.githubusercontent.com",  # файлы из репозиториев
    "codeload.github.com",  # архивы тегов
]

# Локальные адреса — не «платно» и не «бесплатно»: это свой компьютер.
# Движок разговаривает с моделью через 127.0.0.1, и в этом весь смысл.
LOCAL_HOSTS = ["127.0.0.1", "localhost", "::1", "0.0.0.0", "[::1]"]

# Что в адресе выдаёт платный или личный доступ.
PAID_MARKERS = [
    "api_key",
    "apikey",
    "access_token",
    "?token=",
    "&token=",
    "subscription",
    "billing",
    "invoice",
]

# Поля каталога, которых не должно быть: они про чужой счёт, а не про файл.
FORBIDDEN_FIELDS = [
    "api_key",
    "apikey",
    "access_token",
    "bearer",
    "subscription_id",
    "billing_id",
]

URL = re.compile(r"https?://([A-Za-z0-9._-]+)", re.ASCII)

# Адреса, которые встречаются в примерах, тестах и сообщениях об ошибках:
# они не открываются, поэтому проверять у них хост бессмысленно. Список
# точный, а не по маске «example», — иначе «пример» однажды окажется
# настоящим.
EXAMPLES = {
    "example.com",
    "example.invalid",
    # Сами по себе строки вида «https://» без хоста — заготовки для разбора.
}


def host_of(url: str) -> str | None:
    match = URL.match(url.strip())
    return match.group(1).lower() if match else None


def check_host(url: str) -> str | None:
    """Проблема с адресом или None, если он бесплатный."""
    host = host_of(url)
    if host is None:
        return f"не разобрать адрес: {url}"
    if host in EXAMPLES or host in LOCAL_HOSTS:
        return None
    if host not in ALLOWED_HOSTS:
        return f"хост вне бесплатного списка: {host} ({url})"
    lowered = url.lower()
    for marker in PAID_MARKERS:
        if marker in lowered:
            return f"адрес просит ключ или счёт ({marker}): {url}"
    return None


def check_catalog(data: dict) -> list[str]:
    problems: list[str] = []
    for key, value in data.items():
        if isinstance(value, dict):
            for field in value:
                if field.lower() in FORBIDDEN_FIELDS:
                    problems.append(f"data/readiness.json: {key}.{field} — поле про чужой счёт")
            url = value.get("url")
            if isinstance(url, str):
                problem = check_host(url)
                if problem:
                    problems.append(f"data/readiness.json: {key}: {problem}")
        elif isinstance(value, list):
            for index, item in enumerate(value):
                if isinstance(item, dict):
                    url = item.get("url")
                    if isinstance(url, str):
                        problem = check_host(url)
                        if problem:
                            problems.append(f"data/readiness.json: {key}[{index}]: {problem}")
    return problems


def production_part(text: str) -> str:
    """Только то, что поедет в сборку: тестовые модули отрезаются.

    В тестах адреса бывают заведомо ненастоящими (`http://x`) — они не
    открываются, а служат входом для разбора. Считать их сетью приложения
    значило бы требовать «правильных» адресов в проверках, которые как раз
    и проверяют неправильные.
    """
    marker = text.find("#[cfg(test)]")
    return text[:marker] if marker != -1 else text


def check_sources() -> list[str]:
    """Адреса в Rust: все, кроме примеров и локальных, — из бесплатного списка."""
    problems: list[str] = []
    folder = ROOT / "src-tauri" / "src"
    if not folder.exists():
        return problems
    for path in sorted(folder.rglob("*.rs")):
        text = production_part(path.read_text(encoding="utf-8", errors="ignore"))
        # Адрес в **тексте для человека** — не то же, что адрес в загрузчике.
        #
        # Правило этого модуля: приложение ничего не берёт с платных источников.
        # Ссылка в инструкции («скачайте runtime отсюда») — не загрузка: её
        # открывает человек в своём браузере, и приложение с неё не берёт ни
        # байта. Смешивать эти случаи значило бы запретить честную инструкцию
        # или разрешить платную загрузку — и то и другое хуже.
        for problem in check_text(text):
            where = path.relative_to(ROOT)
            problems.append(f"{where}: {problem}")
    return problems


def check_text(text: str) -> list[str]:
    """
    Адреса одного исходника: загрузки — по списку, инструкции — нет.

    Отдельной функцией, потому что селфтест обязан звать **тот же путь**, что и
    настоящая проверка. Первая версия проверяла `split_instructions` напрямую и
    осталась зелёной, когда `check_sources` перестал её вызывать: тест проверял
    функцию, которой уже никто не пользуется, — то есть ничего не проверял.
    """
    text = production_part(text)
    download_part, _instruction = split_instructions(text)
    problems: list[str] = []
    for match in URL.finditer(download_part):
        problem = check_host(match.group(0))
        if problem:
            problems.append(problem)
    return problems


def text_for_check(text: str) -> tuple[str, str]:
    """Тот же путь, что и в `check_sources`: одна функция, а не две правды."""
    return split_instructions(text)


def split_instructions(text: str) -> tuple[str, str]:
    """
    Разделить код на «загрузочную» часть и **тексты для человека**.

    Правило модуля: приложение ничего не берёт с платных источников. Ссылка в
    инструкции («скачайте runtime отсюда») — не загрузка: её открывает человек в
    своём браузере, и приложение с неё не берёт ни байта. Смешивать эти случаи
    значило бы либо запретить честную инструкцию, либо разрешить платную
    загрузку — и то и другое хуже.

    Текст для человека — строковые литералы в константе, в имени которой есть
    `INSTRUCTION`. Всё остальное — код, и с него адреса проверяются как раньше.
    """
    text_lines: list[str] = []
    code_lines: list[str] = []
    inside = False
    for line in text.splitlines():
        starts = "const" in line and "INSTRUCTION" in line
        if starts:
            inside = True
        # Принадлежность решается **до** смены состояния: первая версия
        # выключала флаг раньше, чем добавить строку, и строка с адресом
        # («https://developer.microsoft.com/...») попадала в код — то есть
        # ровно та, ради которой всё и делалось.
        here = inside
        if inside and not starts:
            # Константа кончается на первой строке, оканчивающейся `;` без `\`
            # в конце — многострочный литерал продолжается обратным слэшем.
            stripped = line.rstrip()
            ends = stripped.endswith(";")
            continues = stripped.endswith("\\")
            if ends or not (continues or stripped.startswith('"') or stripped):
                inside = False
        (text_lines if here else code_lines).append(line)
    return "\n".join(code_lines), "\n".join(text_lines)


INSTRUCTION_CASES: list[tuple[str, bool]] = [
    # (текст, должен_ли_адрес считаться загрузкой)
    ('pub const INSTRUCTION: &str = "скачайте https://developer.microsoft.com/webview2/";', False),
    ('const DOWNLOAD: &str = "https://api.openai.com/v1";', True),
    # Адрес в коде — загрузка независимо от хоста; но «провал» здесь означает
    # «считается загрузкой», а не «хост плохой»: huggingface и example.com в
    # бесплатном списке. Проверяется **разделение**, а не список.
    ('let url = "https://api.openai.com/v1";', True),
    ('pub const HELP: &str = "см. https://api.openai.com";', True),
]


CASES: list[tuple[str, bool]] = [
    # (адрес, должно ли проваливать проверку)
    ("https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/x.gguf", False),
    ("https://github.com/ggml-org/llama.cpp/releases/download/b12535/x.zip", False),
    ("https://objects.githubusercontent.com/abc", False),
    ("https://api.openai.com/v1/chat/completions", True),
    ("https://api.anthropic.com/v1/messages", True),
    ("https://huggingface.co/x?token=hf_secret", True),
    ("https://example.com/m.gguf", False),
    ("http://127.0.0.1:8080/health", False),  # свой компьютер, а не чужой счёт
]


def selftest() -> int:
    failures = 0
    for url, should_fail in CASES:
        got = check_host(url) is not None
        if got != should_fail:
            failures += 1
            print(f"  САМОТЕСТ: {url} — ждали провал={should_fail}, получили {got}", file=sys.stderr)
    # Поле про чужой счёт в каталоге.
    fake = {"model": {"url": "https://huggingface.co/x", "api_key": "sk-1"}}
    if not check_catalog(fake):
        failures += 1
        print("  САМОТЕСТ: поле api_key в каталоге не поймано", file=sys.stderr)
    # Адрес из тестового модуля не должен считаться сетью приложения.
    if production_part('http://x\n#[cfg(test)]\nhttp://api.openai.com') != "http://x\n":
        failures += 1
        print("  САМОТЕСТ: тестовый модуль не отрезан", file=sys.stderr)
    # Шаг 225: адрес в **инструкции человеку** — не загрузка. Ссылка открывается
    # в браузере человека, приложение с неё не берёт ни байта. И наоборот: даже
    # похожий адрес в коде остаётся загрузкой — лазейка не должна быть шире.
    for text, is_download in INSTRUCTION_CASES:
        found = bool(check_text(text))
        if found != is_download:
            failures += 1
            print(
                f"  САМОТЕСТ: «{text[:40]}…» — адрес "
                f"{'в коде' if is_download else 'в инструкции'} не распознан",
                file=sys.stderr,
            )
    total = len(CASES) + 2 + len(INSTRUCTION_CASES)
    if failures:
        print(f"самотест провален: {failures} из {total}", file=sys.stderr)
        return 1
    print(f"самотест: {total}/{total} — ловит и молчит как задумано")

    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()

    problems: list[str] = []
    catalog = ROOT / "data" / "readiness.json"
    if catalog.exists():
        problems += check_catalog(json.loads(catalog.read_text(encoding="utf-8")))
    problems += check_sources()

    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        print(f"\nплатный путь по умолчанию: {len(problems)}", file=sys.stderr)
        return 1

    if "--quiet" not in sys.argv:
        print("платного нет: все адреса — бесплатные источники")
    return 0


if __name__ == "__main__":
    sys.exit(main())
