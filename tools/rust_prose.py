#!/usr/bin/env python3
"""Двойные пробелы в русских фразах внутри Rust-кода.

Зачем. Литерал, разбитый по ширине строки, выглядит в исходнике нормально, а
человеку показывается с дюжиной пробелов посреди фразы:

    "Пробный запуск идёт с ограниченным              токеном"

Так уже случилось дважды — в контейнере и в заметке о битой базе. Ошибка не
ломает сборку, не ловится типами и не видна в отчёте тестов: её видит только
человек, которому текст показывают.

Что считается нарушением: **два и более пробела подряд** внутри строкового
литерала, который содержит кириллицу. Литерал с кириллицей — это текст для
человека, а не путь, не регулярка и не кусок PowerShell.

Чего валидатор не делает:

* **не смотрит на литералы без кириллицы.** `"    REG_SZ"`, `"  - кнопка"` в
  образцах разметки и отступы в шаблонах — это данные, а не проза. Требовать от
  них одиночных пробелов значило бы ломать разбор ради косметики;
* **не смотрит на комментарии.** В них двойные пробелы — выравнивание, и
  исправлять его значит портить таблицы в коде;
* **не считает `\\n` и `\\t`.** Экранированные символы внутри литерала — уже не
  проза, а знаки; `\\n\\n` — это пустая строка в тексте, и она нужна.

Обязательный `--selftest`: проверка, которая не проверена в обе стороны
(«ловит» и «молчит»), проходит всегда и потому бесполезна. Здесь 12 случаев:
4 должны ловиться, 8 — нет.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src-tauri" / "src"

# Строковые литералы: обычный `"…"` и raw `r"…"` / `r#"…"#`. Raw-строки
# пропускаются: там обычно шаблоны и команды, где пробелы значимы.
LITERAL = re.compile(r'(?<![r#])"(?:[^"\\]|\\.)*"')
RAW = re.compile(r'r#*".*?"#*')
CYRILLIC = re.compile(r"[а-яА-ЯёЁ]")


def prose_only(literal: str) -> str:
    """Содержимое литерала без экранированных знаков.

    `\\n`, `\\t`, `\\"` — это знаки, а не проза: пустая строка из двух `\\n`
    законна, и отступ из `\\t` тоже.
    """
    return re.sub(r"\\.", "", literal)


# Знаки, которые могут стоять вплотную к дыре, не разрывая фразу: слева —
# конец слова с запятой («временной,»), справа — открывающая кавычка или скобка.
TAIL = ",.;:!?»)\"'"
HEAD = "«(\"' "


def _ends_with_word(text: str) -> bool:
    """Кончается ли фраза русским словом (возможно, со знаком препинания)."""
    trimmed = text.rstrip(TAIL).rstrip()
    return bool(trimmed) and bool(CYRILLIC.match(trimmed[-1]))


def _starts_with_word(text: str) -> bool:
    """Начинается ли фраза русским словом (возможно, с кавычки или скобки)."""
    trimmed = text.lstrip(HEAD)
    return bool(trimmed) and bool(CYRILLIC.match(trimmed[0]))


def doubled(literal: str) -> bool:
    """Есть ли в литерале дыра: два и более пробела внутри русской фразы.

    Три исключения, и каждое — из наблюдённого случая, а не из осторожности:

    * **пробелы по краям** — отступ. `tidy("  Сохранить  ")` проверяет обрезку,
      и требовать от него одного пробела значило бы запретить проверку;
    * **пробелы после `\\n`** — отступ пунктов списка: `"…\\n  - кнопка"` —
      свёрнутый экран, где каждый пункт начинается с двух пробелов;
    * **пробелы не между двумя словами** — отступ и выравнивание колонок в
      машинном выводе («Другое    REG_SZ»). «Чинить» фикстуру `reg query`
      значило бы ломать разбор ради косметики.

    Дыра — это когда пробелы стоят между словами фразы, которую читает
    человек: «ограниченным              токеном».
    """
    # Экранированный знак разделяет фразу: перенос строки — уже не проза.
    for segment in re.split(r"\\.", literal[1:-1]):
        for run in re.finditer(r" {2,}", segment):
            if _ends_with_word(segment[: run.start()]) and _starts_with_word(
                segment[run.end() :]
            ):
                return True
    return False


def scan_line(line: str) -> bool:
    """Нарушение в одной строке исходника."""
    # Raw-строки вырезаем целиком, иначе кавычки внутри них считаются литералами.
    line = RAW.sub('r""', line)
    for match in LITERAL.finditer(line):
        literal = match.group(0)
        if CYRILLIC.search(literal) and doubled(literal):
            return True
    return False


def scan_text(text: str) -> list[tuple[int, str]]:
    """Все нарушения в тексте: номер строки и сама строка (обрезанная)."""
    found: list[tuple[int, str]] = []
    for number, line in enumerate(text.splitlines(), 1):
        if scan_line(line):
            found.append((number, line.strip()[:120]))
    return found


# Чужая письменность внутри русской фразы. Появилась на деле: в комментарий
# попал китайский иероглиф «硬盘» вместо «диск», и никакая проверка этого не
# увидела — код собрался, тесты прошли, прочитал это человек.
FOREIGN = re.compile(
    "["
    "\u4e00-\u9fff"  # китайские иероглифы
    "\u3040-\u30ff"  # хирагана и катакана
    "\uac00-\ud7af"  # хангыль
    "\u0600-\u06ff"  # арабский
    "\u0590-\u05ff"  # иврит
    "\u0e00-\u0e7f"  # тайский
    "]"
)


def foreign_in_prose(text: str) -> bool:
    """Есть ли чужая письменность в строке, где есть кириллица."""
    return bool(CYRILLIC.search(text)) and bool(FOREIGN.search(text))


def scan_foreign(text: str) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    for number, line in enumerate(text.splitlines(), 1):
        if foreign_in_prose(line):
            found.append((number, line.strip()[:120]))
    return found


CASES: list[tuple[str, bool]] = [
    # (строка, должно ли ловиться)
    ('"ограниченным              токеном"', True),
    ('"прошлые                  параметры и история"', True),
    ('format!("клетка не открывается: {reason}. Пробный              запуск")', True),
    ('let note = "работаю на временной,  и прошлые настройки";', True),
    ('let out = "    ZShelper    REG_SZ    \\"C:\\\\Users\\\\Иван\\"";', False),  # колонки reg query
    ('let screen = "Вход\\n  - кнопка «Войти»\\n  - поле «Пароль»";', False),  # список
    ('"ограниченным \\\n             токеном"', False),  # перенос строки — законно
    ('"    ZShelper    REG_SZ"', False),  # данные без кириллицы
    ('"  - кнопка «Войти» [invoke]"', False),  # пробелы по краям — отступ разметки
    ('assert_eq!(tidy("  Сохранить  "), "Сохранить");', False),  # проверка обрезки
    ('"первая строка\\n\\nвторая строка"', False),  # \\n\\n — пустая строка
    ('// комментарий  с выравниванием', False),  # комментарий
    ('r"шаблон  с пробелами"', False),  # raw-строка
    ('let raw = r#"{"a":  "b"}"#;', False),  # raw с кавычками внутри
]


def selftest() -> int:
    failures = 0
    for line, expected in CASES:
        got = scan_line(line)
        if got != expected:
            failures += 1
            print(
                f"  САМОТЕСТ: {line!r} — ждали {expected}, получили {got}",
                file=sys.stderr,
            )
    if failures:
        print(f"самотест провален: {failures} из {len(CASES)}", file=sys.stderr)
        return 1
    print(f"самотест: {len(CASES)}/{len(CASES)} — ловит и молчит как задумано")
    return 0


FOREIGN_CASES: list[tuple[str, bool]] = [
    ("// на硬盘 у кого-то 1.2 ГБ", True),  # настоящий случай
    ("«Скачать модель»", False),
    ("let x = \"硬盘\";", False),  # без кириллицы — это данные, а не проза
    ("// Tokyo — 東京", False),  # комментарий без кириллицы
]


def selftest_foreign() -> int:
    failures = 0
    for line, expected in FOREIGN_CASES:
        got = foreign_in_prose(line)
        if got != expected:
            failures += 1
            print(f"  САМОТЕСТ (чужая письменность): {line!r} — ждали {expected}, получили {got}", file=sys.stderr)
    if failures:
        print(f"самотест чужой письменности провален: {failures} из {len(FOREIGN_CASES)}", file=sys.stderr)
        return 1
    print(f"самотест чужой письменности: {len(FOREIGN_CASES)}/{len(FOREIGN_CASES)}")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        first = selftest()
        return first or selftest_foreign()

    files = sorted(SRC.rglob("*.rs"))
    total = 0
    for path in files:
        for number, line in scan_foreign(path.read_text(encoding="utf-8")):
            print(f"{path.relative_to(ROOT)}:{number}: {line}")
            total += 1
    for path in files:
        found = scan_text(path.read_text(encoding="utf-8"))
        for number, line in found:
            print(f"{path.relative_to(ROOT)}:{number}: {line}")
            total += 1

    if total:
        print(f"\nдвойных пробелов в русских фразах: {total}", file=sys.stderr)
        return 1
    if "--quiet" not in sys.argv:
        print(f"двойных пробелов в русских фразах нет ({len(files)} файлов)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
