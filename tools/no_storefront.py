#!/usr/bin/env python3
"""

Регрессия D-006: у этого инструмента есть самопроверка (`--selftest` или
`--reproducible`), названная номером дефекта — шаг 254.
Никаких «рекомендованных» платных сервисов в интерфейсе (шаг 218).

Зачем. В словаре уже есть правило («нужно/не нужно», а не «рекомендуем») и даже
строка «списка рекомендованных ссылок нет намеренно». Но правило, записанное в
комментарии, живёт до первого человека, который его не прочитал: одна кнопка
«Попробовать Pro» в мастере первого запуска — и витрина собрана.

Что проверяется во **всех** строках интерфейса (`src/i18n/ru.ts`) и в разметке
экранов:

  1. **нет витринных глаголов**: «рекомендуем», «советуем», «лучше взять»,
     «попробуйте Pro/подписку» — приглашение купить, а не сообщение;
  2. **нет имён платных сервисов** как предложения: OpenAI, Anthropic, ChatGPT,
     Claude, Gemini, Copilot и т. п. Не запрет упоминания слова — запрет
     **предложения**; поэтому ищем их в паре с приглашением;
  3. **нет тарифной лексики**: «Тариф», «подписка», «Premium», «Pro-версия»
     в утверждении о продукте;
  4. **нет цен и «от … ₽/мес»** в интерфейсе;
  5. **нет партнёрских ссылок**: `?ref=`, `utm_`, `affiliate` в адресах.

Чего проверка **не** делает: не запрещает слово «подписка» в объяснении
«подписки нет» — честный отказ от подписки и витрина подписки это разные вещи.
Поэтому каждая находка проходит через `excused()`.

Usage:
    python3 tools/no_storefront.py             # печатает итог
    python3 tools/no_storefront.py --quiet     # молчит, если чисто
    python3 tools/no_storefront.py --selftest  # проверяет саму проверку
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
DICT = SRC / "i18n" / "ru.ts"

# Глаголы витрины. «Рекомендуемая небольшая модель для первого разговора» — это
# про размер и локальность, а не про покупку; поэтому проверяется пара с деньгами
# или сервисом, а не слово само по себе: см. `excused`.
# Только **приглашение купить**. «Подставить рекомендуемую небольшую модель» —
# это про размер и локальность, а не про покупку; прежняя версия ловила его и
# тем учила бы не читать предупреждения.
STORE_VERBS = re.compile(
    r"(рекомендуем\s+(подключ|купить|оформ|попроб)|"
    r"советуем\s+(подключ|купить|взять\s+(pro|подписку))|"
    r"попробуйте\s+(pro|plus|premium|тариф|подписку))",
    re.I,
)

# Платные сервисы. Упоминание в честном «наружу не уходит» — законно; в
# «подключите» — витрина. Поэтому проверяется окружение.
SERVICES = re.compile(
    r"(openai|anthropic|chatgpt|claude|gemini|copilot|mistral\s+ai|deepseek|"
    r"yandex\s*cloud|sber(?:bank)?|gigachat|chatglm)",
    re.I,
)
INVITE = re.compile(r"(подключ|подпиш|купи|оформ|попробуй|зарегистр|войд|тариф|стоимость)", re.I)

# Тарифная лексика: слово само по себе, но только в утверждении о продукте.
PLAN = re.compile(r"(тариф|подписк|premium|pro-верси|pro\s+верси)", re.I)
# Отрицание и честные объяснения — не витрина.
DENIAL = re.compile(
    r"(нет\s+подписк|подписки\s+нет|платить\s+некому|бесплатн|не\s+прода|"
    r"ни\s+одного|никаких|не\s+нужн|отдельно\s+не\s+плат|(?<![\d,.])0\s*₽)",
    re.I,
)

# Деньги. «0 ₽ — сейчас, через месяц и через год» — это утверждение о
# бесплатности, а не витрина, поэтому ноль исключён. «Цена» ищется отдельным
# словом: буквальное совпадение находило «с**цена**рий» и давало 8 ложных
# срабатываний — проверка, которая врёт, обесценивает и верные.
MONEY = re.compile(
    r"((?<!0 )\b\d[\d\s]*\s*(₽|руб|рублей|\$|€)(\s*/\s*мес)?|"
    r"стоимость\s*:|"
    # «Цена» — отдельным словом, но **не** «цена ошибки/отказа/бездействия»:
    # это про вред, а не про рубли, и путать их — значит врать в обе стороны.
    r"(?<![а-яё])цена(?![а-яё])(?!\s+(ошибк|отказ|бездейств|решени|доверия|молчани)))",
    re.I,
)
AFFILIATE = re.compile(r"(utm_|ref=|affiliate|partner_id)", re.I)


def excused(line: str) -> bool:
    """Честное объяснение, а не витрина. Названо явно, а не угадано."""
    return bool(DENIAL.search(line))


def check_text(text: str, where: str) -> list[str]:
    problems: list[str] = []
    # Комментарии бывают и внутри JSX: `{/* … */}` — строка начинается с фигурной
    # скобки, и прежний фильтр её не видел, поэтому «цена, а не мораль о шутках»
    # считалась интерфейсом. Поэтому считаем состояние блочного комментария, а не
    # угадываем по началу строки.
    inside_block = False
    for number, line in enumerate(text.splitlines(), start=1):
        stripped = line.strip()
        if inside_block:
            if "*/" in stripped:
                inside_block = False
            continue
        if not stripped or stripped.startswith(("*", "//", "/*")):
            continue
        if "{/*" in stripped or stripped.startswith("/*"):
            # Однострочный `{/* … */}` — весь комментарий; многострочный — до `*/`.
            if stripped.count("/*") > stripped.count("*/"):
                inside_block = True
            continue
        if excused(stripped):
            continue
        if STORE_VERBS.search(stripped):
            problems.append(f"{where}:{number}: витринный глагол — «{STORE_VERBS.search(stripped).group(0)}»")
        if SERVICES.search(stripped) and INVITE.search(stripped):
            problems.append(
                f"{where}:{number}: платный сервис предлагается — «{SERVICES.search(stripped).group(0)}»"
            )
        if PLAN.search(stripped) and not DENIAL.search(stripped):
            problems.append(f"{where}:{number}: тарифная лексика — «{PLAN.search(stripped).group(0)}»")
        if MONEY.search(stripped):
            problems.append(f"{where}:{number}: цена в интерфейсе — «{MONEY.search(stripped).group(0)}»")
        if AFFILIATE.search(stripped):
            problems.append(f"{where}:{number}: партнёрская метка в адресе")
    return problems


def check() -> list[str]:
    problems: list[str] = []
    problems.extend(check_text(DICT.read_text(encoding="utf-8"), "src/i18n/ru.ts"))
    for path in sorted(SRC.rglob("*.tsx")):
        if path.name.endswith((".test.tsx",)):
            continue
        problems.extend(check_text(path.read_text(encoding="utf-8"), str(path.relative_to(ROOT))))
    return problems


def selftest() -> int:
    import tempfile

    cases: list[tuple[str, bool]] = [
        ('const a = "Рекомендуем подключить OpenAI для лучших ответов";', True),
        ('const a = "Тариф Pro: 500 ₽/мес";', True),
        ('const a = "Ссылка: https://example.com/x?utm_source=app";', True),
        ('const a = "Подписки нет и платить некому";', False),
        ('const a = "Списка «рекомендованных» ссылок нет намеренно";', False),
        ('const a = "Наружу не уходит ничего: запросы идут на 127.0.0.1";', False),
        ('const a = "Никаких платных сервисов: модель работает локально";', False),
        ('const a = "Сценарий — это несколько инструментов подряд";', False),
        ('const a = "Можно подставить рекомендуемую небольшую модель";', False),
        ('const a = "0 ₽ — сейчас, через месяц и через год";', False),
    ]
    failed = 0
    for body, should_fail in cases:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
            handle.write(body)
            temp = Path(handle.name)
        try:
            found = check_text(temp.read_text(encoding="utf-8"), "selftest")
        finally:
            temp.unlink()
        if bool(found) != should_fail:
            print(f"selftest: «{body[:48]}…» ожидалось {'провал' if should_fail else 'чисто'}", file=sys.stderr)
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
            print(f"витрина: {line}", file=sys.stderr)
        return 1
    if not args.quiet:
        print("витрины нет: ни одного «рекомендуем», тарифа, цены или партнёрской метки")
    return 0


if __name__ == "__main__":
    sys.exit(main())
