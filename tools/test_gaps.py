#!/usr/bin/env python3
"""
Отчёт «что не покрыто тестами» вместо процента из воздуха (шаг 255).

Дефект. Процент покрытия отвечает на вопрос «сколько строк выполнилось» и не
отвечает на вопрос «что не проверено». Хуже: он **успокаивает** — 84% звучит как
«почти всё», хотя 16% могут быть ровно теми экранами, где живут опасные действия.
И процент не называет ни одного имени: по нему нельзя пойти и дописать тест.

Что делает скрипт. Идёт по исходникам и по тестам и составляет **список имён**:

  * модули в `src/lib` без парного `*.test.ts`;
  * экраны в `src/screens` без парного `*.test.tsx`;
  * компоненты в `src/components` без парного теста;
  * у каждого пропуска — **сколько в нём опасного**: `destructive`, `money`,
    `identity`, `never`, `fetch`/`download`, `remove`, `delete`, `rm -rf`;
  * сортировка — по опасности, а не по алфавиту: сначала то, где ошибка дороже.

Правила:

  1. **имя, а не процент**: «не покрыт `src/lib/foo.ts`» ведёт к правке, «84%» —
     никуда;
  2. **опасное вперёд**: непокрытый `foo.ts` с `rm -rf` важнее десяти `bar.ts` с
     форматированием строки;
  3. **«покрыт» значит «есть тест рядом»**, а не «есть хоть один импорт»: тест,
     который ничего не проверяет, хуже отсутствия теста — он создаёт видимость;
  4. **файлы, покрытые косвенно, названы отдельно**: экран, который проверяется
     через общий тест приложения (`app.test.tsx`), не в списке пропусков, но и не
     «покрыт полностью» — он в отдельном разделе.

Usage:
    python3 tools/test_gaps.py            # список и итог
    python3 tools/test_gaps.py --quiet    # только итог
    python3 tools/test_gaps.py --selftest # проверка на проверке
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# Что считается опасным в исходнике — и сколько это «стоит».
DANGER = [
    (re.compile(r"\b(destructive|rm -rf|removeAll)\b"), 5, "разрушительное"),
    (re.compile(r"\b(money|оплат|списан)\w*", re.I), 4, "деньги"),
    (re.compile(r"\b(identity|подпис)\w*", re.I), 4, "личность"),
    (re.compile(r"\b(never|никогда)\b"), 3, "запретное"),
    (re.compile(r"\b(download|fetch|загруз)\w*", re.I), 2, "сеть"),
    (re.compile(r"\b(remove|delete|удал)\w*", re.I), 1, "удаление"),
]

# Где тесты, которые проверяют экран через приложение, а не напрямую.
INDIRECT = ("src/app.test.tsx", "src/a11y.test.tsx", "src/firstMinute.test.tsx", "src/keyboardFlow.test.tsx")


def danger(text: str) -> tuple[int, list[str]]:
    """Сколько опасного и какие слова. Пусто — безопасный модуль."""
    score = 0
    words: list[str] = []
    for pattern, weight, name in DANGER:
        if pattern.search(text):
            score += weight
            words.append(name)
    return score, words


def sources() -> list[Path]:
    found: list[Path] = []
    for folder in ("lib", "screens", "components"):
        base = SRC / folder
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if path.suffix not in {".ts", ".tsx"}:
                continue
            if path.name.endswith((".test.ts", ".test.tsx")):
                continue
            found.append(path)
    return found


def has_test(path: Path) -> bool:
    """
    Есть ли парный тест.

    Три вида пары: `foo.test.ts`, `foo.test.tsx`, `foo.plan.test.tsx` (частичные
    тесты с уточнением). Все три — покрытие: тест рядом, а не «где-то».
    """
    stem = path.stem
    for suffix in (".test.ts", ".test.tsx"):
        if (path.parent / f"{stem}{suffix}").exists():
            return True
    return any(path.parent.glob(f"{stem}.*.test.ts")) or any(path.parent.glob(f"{stem}.*.test.tsx"))


def indirect(path: Path) -> bool:
    """Упоминается ли файл в общих тестах — то есть проверяется через приложение."""
    name = path.stem
    for item in INDIRECT:
        test = ROOT / item
        if not test.exists():
            continue
        if re.search(rf"(from|import)\s+[^;]*{re.escape(name)}", test.read_text(encoding="utf-8")):
            return True
    return False


def report() -> tuple[list[dict], list[dict], int]:
    """Пропуски (по опасности), косвенные и сколько всего файлов."""
    gaps: list[dict] = []
    covered_indirectly: list[dict] = []
    all_sources = sources()
    for path in all_sources:
        if has_test(path):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        score, words = danger(text)
        record = {"path": path.relative_to(ROOT).as_posix(), "score": score, "words": words}
        if indirect(path):
            covered_indirectly.append(record)
        else:
            gaps.append(record)
    # Сортировка по опасности: сначала то, где ошибка дороже, а не алфавит.
    gaps.sort(key=lambda item: (-item["score"], item["path"]))
    return gaps, covered_indirectly, len(all_sources)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()

    gaps, covered_indirectly, total = report()
    dangerous = [item for item in gaps if item["score"] >= 5]
    if not args.quiet:
        print(f"не покрыто тестами: {len(gaps)} из {total} файлов, из них опасных {len(dangerous)}")
        for item in gaps:
            mark = f" [{', '.join(item['words'])}]" if item["words"] else ""
            print(f"  {item['path']}{mark}")
        if covered_indirectly:
            print(f"проверяются только через приложение: {len(covered_indirectly)}")
            for item in covered_indirectly:
                print(f"  {item['path']}")
    if dangerous:
        print(
            f"тесты: {len(dangerous)} непокрытых файлов с опасным кодом — это и есть ответ на «что не проверено»",
            file=sys.stderr,
        )
        return 1
    print(f"тесты: опасного без теста нет (не покрыто {len(gaps)} из {total}, все без опасного кода)")
    return 0


def selftest() -> int:
    """Проверка на проверке: опасность считается, пары находятся, прямой тест важнее близости."""
    import tempfile

    failed = 0

    # 1. Опасность считается по словам, а не по длине файла.
    if danger("rm -rf /tmp/x")[0] < 5:
        print("selftest: разрушительное не посчитано", file=sys.stderr)
        failed += 1
    if danger("const a = format(x);")[0] != 0:
        print("selftest: форматирование строки посчитано опасным", file=sys.stderr)
        failed += 1

    # 2. Пара находится только рядом.
    with tempfile.TemporaryDirectory() as folder:
        base = Path(folder)
        (base / "foo.ts").write_text("export const x = 1;", encoding="utf-8")
        if has_test(base / "foo.ts"):
            print("selftest: файл без теста назван покрытым", file=sys.stderr)
            failed += 1
        (base / "foo.test.ts").write_text("it('x', () => {});", encoding="utf-8")
        if not has_test(base / "foo.ts"):
            print("selftest: парный тест не найден", file=sys.stderr)
            failed += 1
        # Частичный тест с уточнением — тоже покрытие.
        (base / "bar.ts").write_text("export const y = 2;", encoding="utf-8")
        (base / "bar.plan.test.ts").write_text("it('y', () => {});", encoding="utf-8")
        if not has_test(base / "bar.ts"):
            print("selftest: частичный тест не считается покрытием", file=sys.stderr)
            failed += 1

    if failed:
        return 1
    print("selftest: опасность и пары считаются верно")
    return 0


if __name__ == "__main__":
    sys.exit(main())
