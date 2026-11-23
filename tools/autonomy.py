#!/usr/bin/env python3
"""Отчёт «что приложение делает само, без спроса» (шаг 20).

Требование: автономность не должна быть **незаметной**. В отчёте либо пусто, либо
названо — но никогда не «кое-что по мелочи». Незаметное действие опаснее
названного: названное человек может запретить, а о незаметном не знает.

Как это проверяется без запуска приложения. Ищутся **эффекты при монтировании и
сетевые вызовы вне обработчика нажатия** — то есть код, который выполняется сам:

  * `useEffect` в `app.tsx` и на экранах: перечисляются как места, где может
    быть действие без спроса;
  * `fetch(`/`invoke(` **вне** `onClick`/`onChange`/`onPointer`/обработчика:
    сетевой вызов, начатый не по нажатию.

Почему список, а не «ноль находок». Ноль был бы ложью: приложение читает статус
готовности и реестр при открытии — это и есть действие без спроса, но безвредное
(чтение) и **нужное** (без него экран пустой). Такое называется в списке с
пометкой «только читает». Опасное (пишет, ходит в сеть) обязано иметь пометку
«по нажатию» или быть названо как автономное.

Отчёт пишется в `docs/AUTONOMY.md` и проверяется `--check`: если появилось новое
действие без записи, сборка падает. Это и есть «незаметной автономности нет».
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "AUTONOMY.md"
SRC = ROOT / "src"

# Где ищем: интерфейс. Ядро (Rust) в этом окружении не запускается, но сетевой
# вызов там один и уже ограничен двумя проверками (`one_door.py`, `no_telemetry.py`).
FILES = ["app.tsx", "screens", "components", "lib", "ipc"]

# Сетевой вызов или запись **на диск** — то, что меняет мир или уходит наружу.
#
# Чего здесь нет нарочно: `save`/`remove`/`filter` — это имена чистых функций над
# очередью и списками (`remove(items, id)` возвращает новый массив). Первый
# прогон пометил их «САМО», и это было ложной тревогой: отчёт, который кричит на
# `filter`, перестают читать через неделю. `localStorage` тоже не диск: он
# ограничен приложением и не трогает файлы человека.
RISKY = re.compile(
    r"\b(fetch|invoke|download|writeFile|fs\.write|create_dir|remove_dir|unlink)\s*\(",
    re.IGNORECASE,
)
EFFECT = re.compile(r"useEffect\s*\(")


def source_files() -> list[Path]:
    out: list[Path] = []
    for name in FILES:
        path = SRC / name
        if path.is_file():
            out.append(path)
        elif path.is_dir():
            out.extend(sorted(path.rglob("*.tsx")))
            out.extend(sorted(path.rglob("*.ts")))
    # Тесты не описывают поведение приложения.
    return [path for path in out if ".test." not in path.name and ".pw." not in path.name]


def scan() -> tuple[list[tuple[str, int, str]], list[tuple[str, int, str]]]:
    """(эффекты при монтировании, опасные вызовы вне обработчика)."""
    effects: list[tuple[str, int, str]] = []
    risky: list[tuple[str, int, str]] = []
    for path in source_files():
        lines = path.read_text(encoding="utf-8").split("\n")
        relative = str(path.relative_to(ROOT))
        for index, line in enumerate(lines, start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*"):
                continue
            if EFFECT.search(line):
                effects.append((relative, index, stripped[:100]))
            if RISKY.search(line):
                # Обёртка, а не действие: `return invoke("download_runtime", …)`
                # внутри `export function downloadRuntime` — это объявление
                # функции, которая сработает, когда её позовут. Считать её
                # «приложение делает само» — неправда, и первый прогон так и
                # сказал про две обёртки в `ipc/tauri.ts`.
                if re.search(r"^\s*return\s+(invoke|fetch|download)", stripped):
                    continue
                # Обработчик — это `on…={` на той же строке или выше в пределах
                # 8 строк: кнопка в JSX обычно занимает несколько строк.
                window = "\n".join(lines[max(0, index - 9) : index])
                by_hand = re.search(r"on(Click|Change|Pointer|Key|Submit|Input|Open|Select)", window)
                risky.append((relative, index, "по нажатию" if by_hand else "САМО"))
    return effects, risky


def markdown(effects: list[tuple[str, int, str]], risky: list[tuple[str, int, str]]) -> str:
    self_started = [item for item in risky if item[2] == "САМО"]
    by_hand = [item for item in risky if item[2] == "по нажатию"]
    lines = [
        "# Что приложение делает само, без спроса",
        "",
        "Сгенерировано `tools/autonomy.py`. Не править руками.",
        "",
        "Правило шага 20: автономность не должна быть незаметной. Здесь либо пусто,",
        "либо названо — но никогда не «кое-что по мелочи». Незаметное действие",
        "опаснее названного: названное человек может запретить.",
        "",
        "## Итог",
        "",
        f"* действий **по нажатию**: {len(by_hand)} — их человек вызывает сам;",
        f"* действий **само**: {len(self_started)} — "
        + ("их надо назвать ниже, и каждое объяснить." if self_started else "ни одного."),
        "",
        "## Эффекты при открытии экрана",
        "",
        "Места, где код выполняется сам при появлении экрана. Сами по себе они не",
        "опасны: чтение статуса нужно, иначе экран пустой. Опасным было бы **писать**",
        "или **ходить в сеть** из такого эффекта — и вот этого здесь быть не должно.",
        "",
    ]
    for relative, line, text in effects:
        lines.append(f"* `{relative}:{line}` — {text}")
    if not effects:
        lines.append("* эффектов нет")
    lines += [
        "",
        "## Сетевые вызовы и запись",
        "",
        "| Где | Строка | Как вызывается |",
        "| --- | --- | --- |",
    ]
    for relative, line, how in risky:
        lines.append(f"| `{relative}` | {line} | {how} |")
    if not risky:
        lines.append("| — | — | — |")
    lines += [
        "",
        "## Что это значит",
        "",
        "Если в колонке «как вызывается» появилось **САМО** у вызова, который пишет",
        "или ходит в сеть, — это и есть незаметная автономность, и `--check` валит",
        "сборку. Чтение состояния из эффекта при открытии — не она: без него экран",
        "пуст, и оно ничего не меняет.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    check = "--check" in sys.argv
    effects, risky = scan()
    text = markdown(effects, risky)

    self_started = [item for item in risky if item[2] == "САМО"]
    # Опасное «само» — валим всегда, независимо от того, записан ли отчёт: это
    # не документация, а дефект.
    danger = [
        item
        for item in self_started
        if not re.search(r"readinessStatus|registrySnapshot|appStatus|autostartStatus|voiceTrayStatus|listModels|engineStatus|status\(", item[2] + " ".join(map(str, item)))
    ]

    if check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("отчёт об автономности разошёлся с кодом: запустите tools/autonomy.py")
            return 1
        if danger:
            print("приложение делает само то, что меняет мир или ходит в сеть:")
            for relative, line, _text in danger[:10]:
                print(f"  {relative}:{line}")
            return 1
        if "--quiet" not in sys.argv:
            print(f"автономность названа: само — {len(self_started)}, по нажатию — {len(risky) - len(self_started)}")
        return 0

    OUT.write_text(text, encoding="utf-8")
    print(f"записано: {OUT.relative_to(ROOT)} · само {len(self_started)}, по нажатию {len(risky) - len(self_started)}")
    return 1 if danger else 0


if __name__ == "__main__":
    raise SystemExit(main())
