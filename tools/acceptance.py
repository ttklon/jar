#!/usr/bin/env python3
"""
Шаг 249: еженедельный прогон живого сценария с записью результата.

Зачем отдельно от `vitest`. Тесты зелены — но «зелено» не хранится: следующий
прогон затирает прошлый, и на вопрос «а неделю назад сценарий проходил?» ответить
нечем. Этот скрипт прогоняет **живой сценарий** (тот же головной путь, что у
человека: фраза → найдено → права → план) и **дописывает** результат в
`data/acceptance.json`: дата, что проверяли, итог, при каком числе шагов.

Что считается приёмочным. Не «все тесты зелены» — это про код. Приёмочный —
сценарий целиком: у каждой из проверок есть имя по-русски, чтобы отчёт читал
человек, а не только CI.

Живой прогон не подменяется записью: скрипт действительно запускает `vitest` на
головных файлах и только потом пишет дату. Запись без прогона — это отчёт о том,
чего не было.

Запуск:
    python3 tools/acceptance.py            # прогнать и дописать запись
    python3 tools/acceptance.py --show     # показать историю, ничего не запуская
    python3 tools/acceptance.py --check    # свежий ли последний прогон (для CI)
    python3 tools/acceptance.py --selftest # проверка самой записи
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "data" / "acceptance.json"

# Живой сценарий: файлы, которыми он проверяется. Имя по-русски — для отчёта.
SCENARIO = {
    "name": "сказал → сделано",
    "what": "фраза находит действие, права названы причиной, план не подделывает исполнение",
    "files": [
        "src/lib/headline.test.ts",
        "src/lib/nothingExtra.test.ts",
        "src/lib/harshEnv.test.ts",
        "src/screens/Catalog.test.tsx",
    ],
}


def read_log() -> list[dict]:
    if not LOG.exists():
        return []
    return json.loads(LOG.read_text(encoding="utf-8")).get("runs", [])


def write_log(runs: list[dict]) -> None:
    LOG.write_text(
        json.dumps({"scenario": SCENARIO["name"], "runs": runs[-52:]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def just_run() -> int:
    found = [name for name in SCENARIO["files"] if not (ROOT / name).exists()]
    if found:
        print(f"живой сценарий: нет файлов {found}", file=sys.stderr)
        return 1
    result = subprocess.run(
        ["npx", "vitest", "run", *SCENARIO["files"]],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    passed = result.returncode == 0
    record = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scenario": SCENARIO["name"],
        "what": SCENARIO["what"],
        "files": SCENARIO["files"],
        "passed": passed,
    }
    runs = read_log()
    # Повтор в тот же день заменяет запись, а не добавляет вторую: «прогонов за
    # день» не бывает больше одного в приёмочном журнале.
    runs = [run for run in runs if run["date"] != record["date"]]
    runs.append(record)
    runs.sort(key=lambda run: run["date"])
    write_log(runs)
    # Провал не отменяет прошлых успехов и не затирает историю: журнал — летопись,
    # а не последний прогон.
    if passed:
        print(f"живой сценарий «{SCENARIO['name']}»: прошёл, запись от {record['date']}")
        return 0
    print(f"живой сценарий «{SCENARIO['name']}»: НЕ прошёл — запись от {record['date']}", file=sys.stderr)
    print(result.stdout[-2000:], file=sys.stderr)
    # Код выхода — часть результата: провал, записанный в журнал, но отданный
    # нулём, в CI выглядит как успех.
    return 1


def show() -> int:
    runs = read_log()
    if not runs:
        print("приёмочный журнал пуст: живого прогона ещё не было")
        return 1
    for run in runs:
        mark = "прошёл" if run["passed"] else "НЕ прошёл"
        print(f"{run['date']}  {mark}  {run['scenario']} — {run['what']}")
    return 0


def stale() -> int:
    """
    Недельный прогон, который не делали, — это провал, а не «нет новостей».

    Проверяется возраст последней записи: старше недели —CI обязан сказать это
    словами, а не молча показывать прошлогодний «прошёл».
    """
    runs = read_log()
    if not runs:
        print("приёмочного прогона не было ни разу", file=sys.stderr)
        return 1
    last = datetime.strptime(runs[-1]["date"], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    age = (datetime.now(timezone.utc) - last).days
    if age > 7:
        print(f"последний приёмочный прогон был {age} дн. назад — недельный пропущен", file=sys.stderr)
        return 1
    if not runs[-1]["passed"]:
        print(f"последний приёмочный прогон ({runs[-1]['date']}) НЕ прошёл", file=sys.stderr)
        return 1
    print(f"приёмочный прогон свежий: {runs[-1]['date']}, прошёл")
    return 0


def selftest() -> int:
    """
    Проверка на проверке: журнал обязан уметь сказать «пусто» и «не прошёл».

    Без этого `--show` всегда бы отвечал «прошёл» просто потому, что так записано.
    """
    failures = 0
    if read_log() is None:
        failures += 1
        print("selftest: журнал читается как None", file=sys.stderr)
    # Дата в записи обязана быть настоящей датой, а не «сегодня».
    for run in read_log():
        try:
            datetime.strptime(run["date"], "%Y-%m-%d")
        except (KeyError, ValueError):
            failures += 1
            print(f"selftest: в записи неверная дата: {run.get('date')}", file=sys.stderr)
        if not isinstance(run.get("passed"), bool):
            failures += 1
            print("selftest: в записи нет булева исхода", file=sys.stderr)
    if failures:
        return 1
    print(f"selftest: {len(read_log())} записей, даты и исходы читаются")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    if "--check" in sys.argv:
        return stale()
    if "--show" in sys.argv:
        return show()
    return just_run()


if __name__ == "__main__":
    raise SystemExit(main())
