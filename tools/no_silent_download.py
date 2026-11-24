#!/usr/bin/env python3
"""
Скачивания — только по явному нажатию, никогда в фоне (шаг 214).

Почему отдельная проверка, когда есть `one_door.py`. Тот отвечает на вопрос «есть
ли единственная дверь в сеть», и ответ «да» ничего не говорит о том, **когда** в
неё входят. Дверь может открываться сама: в `useEffect` при монтировании, в
таймере, при обновлении окна, в автоповторе после ошибки. Именно так «бесплатно и
честно» превращается в «приложение само сходило за 4 ГБ, пока человек читал текст».

Что проверяется:

  1. **`useEffect` без нажатия не скачивает.** Внутри `useEffect` не должно быть
     вызова загрузки: ни `downloadModel`, ни `downloadRuntime`, ни `fetch`;
  2. **таймер не скачивает.** `setInterval`/`setTimeout` внутри `useEffect` — тот
     же фон, только отложенный;
  3. **повтор после ошибки не включается сам.** Автоповтор — тот же фон, и он
     ещё опаснее: сеть пропала, а он пошёл пятьдесят раз;
  4. **окно и счётчики просмотра не скачивают.** «Проверка обновлений» — отдельный
     вопрос (шаг 213), но она не имеет права скачивать пакет обновления молча.

Чего проверка **не** делает: не запрещает `ipc.downloadModel` вообще. Кнопка — это
нажатие; именно её наличие и требуется.

Usage:
    python3 tools/no_silent_download.py            # печатает итог
    python3 tools/no_silent_download.py --quiet     # молчит, если чисто
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# Что считается загрузкой. Список по имени функции, потому что это и есть дверь.
FETCHES = (
    "downloadModel",
    "downloadSpeechModel",
    "downloadRuntime",
    "downloadFile",
    "installRuntime",
)

# Где загрузка законна: обработчики нажатия и то, что они вызывают.
# Проверка не «все вызовы», а «вызовы не внутри фоновых обёрток».
# Закрытие эффекта бывает `}, []);` и `}, [dep]);` — а бывает и `}, []);` с
# точкой с запятой на той же строке. Первая версия требовала ровно `\n  }, [`,
# и настоящий фон в одну строку (`}, []);`) **не ловился**: сторож был слеп, а
# selftest этого не показывал, потому что случай был многострочный.
EFFECT = re.compile(
    r"useEffect\(\s*\(\s*\)\s*=>\s*\{(?P<body>[\s\S]*?)\}\s*,\s*\[[^\]]*\]\s*\)",
    re.M,
)
TIMERS = re.compile(r"\b(setInterval|setTimeout)\s*\(")

# Файлы, где загрузка по нажатию — сама суть экрана; их проверяем на то же
# правило, но с явным исключением: обработчик может лежать в стрелке внутри
# `onClick`, и это не фон.
TRIGGER = re.compile(r"onClick|onSubmit|onChange|onPointerDown")


def blocks(text: str) -> list[tuple[int, str]]:
    """Тела `useEffect` — номер строки и текст."""
    return [(text[: m.start()].count("\n") + 1, m.group("body")) for m in EFFECT.finditer(text)]


def where(path: Path) -> str:
    """Имя файла для сообщения: временный файл selftest лежит вне репозитория."""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return path.name


def check_file(path: Path) -> list[str]:
    problems: list[str] = []
    text = path.read_text(encoding="utf-8", errors="ignore")
    for line, body in blocks(text):
        # Внутри эффекта ищем загрузку. Нажатие внутри эффекта невозможно по
        # смыслу, поэтому `TRIGGER` здесь не спасает — и не должен.
        for name in FETCHES:
            if re.search(rf"\b{name}\b", body):
                problems.append(
                    f"{where(path)}:{line}: загрузка `{name}` внутри useEffect — это фон, а не нажатие"
                )
        # Таймер сам по себе — не фон: опрос прогресса и обновление статуса
        # законны. Фон — это когда таймер **запускает** загрузку. Смотреть на
        # файл целиком здесь было ошибкой: таймер опроса и кнопка «Скачать» живут
        # в одном файле, и проверка обвиняла опрос в том, что делает кнопка.
        if TIMERS.search(body) and any(re.search(rf"\b{name}\s*\(", body) for name in FETCHES):
            problems.append(
                f"{where(path)}:{line}: таймер запускает загрузку — отложенный фон"
            )
    # Автоповтор после ошибки: `retry` вне нажатия и без подтверждения.
    for match in re.finditer(r"\b(useRetry|autoRetry|retryDownload)\s*\(", text):
        line = text[: match.start()].count("\n") + 1
        start = text.rfind("\n", 0, match.start())
        snippet = text[max(0, start - 200) : match.start()]
        if not TRIGGER.search(snippet):
            problems.append(f"{where(path)}:{line}: автоповтор загрузки без нажатия")
    return problems


def check() -> list[str]:
    problems: list[str] = []
    for path in sorted(SRC.rglob("*")):
        if path.suffix not in {".ts", ".tsx"} or path.name.endswith((".test.ts", ".test.tsx")):
            continue
        problems.extend(check_file(path))
    return problems


def selftest() -> int:
    """Проверка на проверке: ловит ли она фон и не ловит ли нажатие."""
    cases: list[tuple[str, bool]] = [
        (
            "useEffect(() => {\n    void downloadModel(url, name);\n  }, []);",
            True,
        ),
        (
            "useEffect(() => {\n    const timer = setTimeout(() => void downloadRuntime(\"llama\"), 1000);\n  }, []);",
            True,
        ),
        (
            "useEffect(() => {\n    void downloadModel(url, name);\n  }, []);",
            True,
        ),
        (
            "<Button onClick={() => void downloadModel(url, name)}>Скачать</Button>",
            False,
        ),
        (
            "useEffect(() => {\n    setStatus(await readinessStatus());\n  }, []);",
            False,
        ),
    ]
    failed = 0
    for body, should_fail in cases:
        import tempfile

        with tempfile.NamedTemporaryFile("w", suffix=".tsx", delete=False, encoding="utf-8") as handle:
            handle.write(body)
            temp = Path(handle.name)
        try:
            found = check_file(temp)
        finally:
            temp.unlink()
        if bool(found) != should_fail:
            print(f"selftest: «{body[:40]}…» ожидалось {'провал' if should_fail else 'чисто'}", file=sys.stderr)
            failed += 1
    if failed:
        return 1
    print(f"selftest: {len(cases)} случаев верны")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        return selftest()

    problems = check()
    if problems:
        for line in problems:
            print(f"тихое скачивание: {line}", file=sys.stderr)
        return 1
    if not args.quiet:
        print("скачиваний в фоне нет: каждая загрузка — в обработчике нажатия")
    return 0


if __name__ == "__main__":
    sys.exit(main())
