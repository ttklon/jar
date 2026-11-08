#!/usr/bin/env python3
"""
Coverage audit for the action registry.

Answers the only question that matters for "ZShelper должен уметь всё":
**где именно у нас дырки** — и делает это проверяемо, а не на глаз.

Checks (each produces a concrete, actionable line):
  1. thin domains          — меньше 8 действий: домен описан «для галочки»;
  2. family gaps           — у домена нет ни одного действия из семейства
                             (осмотр / создание / изменение / удаление / проверка / наблюдение);
  3. missing risk classes  — домен не умеет читать ИЛИ не умеет менять (значит описан односторонне);
  4. no-profile domains    — есть действия, но нет ни одной доведённой до кнопок операции;
  5. single-use verbs      — глагол встречается один раз: широта не превратилась в систему;
  6. status hygiene        — доля v1 / v2 / never и домены, где всё отложено в v2.

Writes `docs/COVERAGE.md` and exits non-zero only on hard errors (broken registry).
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIONS = ROOT / "data" / "actions.json"
PROFILES = ROOT / "data" / "profiles"
MD_OUT = ROOT / "docs" / "COVERAGE.md"

FAMILIES_FILE = ROOT / "data" / "verb_families.json"
DOMAIN_MATRIX = ROOT / "data" / "domain_families.json"
PROFILE_POLICY = ROOT / "data" / "domain_profile_policy.json"

THIN_LIMIT = 8


def main() -> int:
    if not ACTIONS.exists():
        print("run tools/actions.py first", file=sys.stderr)
        return 2
    rows = json.loads(ACTIONS.read_text(encoding="utf-8"))
    fam_data = json.loads(FAMILIES_FILE.read_text(encoding="utf-8"))["families"]
    matrix_raw = json.loads(DOMAIN_MATRIX.read_text(encoding="utf-8"))
    default_fams = matrix_raw.get("_default", [])
    domain_matrix: dict[str, list[str]] = matrix_raw.get("domains", {})
    verb_to_fams: dict[str, set[str]] = {}
    for fam, vs in fam_data.items():
        for v in vs:
            verb_to_fams.setdefault(v, set()).add(fam)

    by_domain: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_domain[r["domain"]].append(r)

    prof_ops: Counter = Counter()
    for path in sorted(PROFILES.glob("*.json")):
        if path.name.startswith("_"):
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for op in data.get("operations", []):
            dom = op["registry"].split("|")[0]
            prof_ops[dom] += 1

    verbs = Counter(r["verb"] for r in rows)
    single_use = sorted(v for v, n in verbs.items() if n == 1)

    # --- findings ---
    thin = sorted((d for d, rs in by_domain.items() if len(rs) < THIN_LIMIT),
                  key=lambda d: len(by_domain[d]))

    unmapped_verbs = sorted(v for v in verbs if v not in verb_to_fams)

    family_gaps: dict[str, list[str]] = {}
    for dom, rs in by_domain.items():
        present: set[str] = set()
        for r in rs:
            present |= verb_to_fams.get(r["verb"], set())
        required = domain_matrix.get(dom, default_fams)
        missing = [fam for fam in required if fam not in present]
        if missing:
            family_gaps[dom] = missing

    risk_gaps: dict[str, list[str]] = {}
    for dom, rs in by_domain.items():
        risks = {r["risk"] for r in rs}
        missing = []
        if "read" not in risks:
            missing.append("read")
        if not ({"write-local", "destructive"} & risks):
            missing.append("write")
        risk_gaps[dom] = missing

    all_deferred = sorted(
        d for d, rs in by_domain.items()
        if rs and all(r["status"] == "v2" for r in rs)
    )

    status = Counter(r["status"] for r in rows)
    risk = Counter(r["risk"] for r in rows)
    tier = Counter(r["tier"] for r in rows)
    human = Counter(r["human_code"] for r in rows)

    # --- render ---
    L = [
        "# Покрытие: где «умеет всё» пока не всё",
        "",
        "Аудит реестра действий и профилей. Генерируется `python3 tools/audit_actions.py`.",
        "",
        f"**Действий: {len(rows)}** · доменов: {len(by_domain)} · глаголов: {len(verbs)} · "
        f"профилей: {sum(1 for p in PROFILES.glob('*.json') if not p.name.startswith('_'))} · "
        f"операций в профилях: {sum(prof_ops.values())}",
        "",
        "## Статусы, риск, железо",
        "",
        "| Разрез | Значение | Кол-во |",
        "| --- | --- | --- |",
    ]
    for name, cnt in (("статус", status), ("риск", risk), ("tier", tier), ("человек", human)):
        for k, v in cnt.most_common():
            L.append(f"| {name} | `{k}` | {v} |")

    L += [
        "",
        "## 1. Тонкие домены (< 8 действий)",
        "",
    ]
    if thin:
        L += ["| Домен | Действий | Что добавить в первую очередь |", "| --- | --- | --- |"]
        for d in thin:
            L.append(f"| `{d}` | {len(by_domain[d])} | "
                     f"{by_domain[d][0]['verb']}… — расширить до CRUD и добавить проверку |")
    else:
        L.append("Нет. Все домены содержат ≥ 8 действий.")

    L += ["", "## 2. Дырки по семействам действий", "",
          "Семейства: " + ", ".join(fam_data) + ". Обязательные для домена семейства заданы в "
          "`data/domain_families.json` (по умолчанию: " + ", ".join(default_fams) + "). "
          "Дырка означает: семейство для этого домена обязательно, но действий в нём нет.", ""]
    if family_gaps:
        L += ["| Домен | Нет семейств |", "| --- | --- |"]
        for d in sorted(family_gaps):
            L.append(f"| `{d}` | {', '.join(family_gaps[d])} |")
    else:
        L.append("Нет.")

    if unmapped_verbs:
        L += ["", "**Глаголы без семейства (нужно добавить в `data/verb_families.json`):** "
              + ", ".join(f"`{v}`" for v in unmapped_verbs), ""]

    L += ["", "## 3. Односторонние домены (только чтение или только запись)", ""]
    if any(v for v in risk_gaps.values()):
        L += ["| Домен | Не хватает |", "| --- | --- |"]
        for d, miss in sorted(risk_gaps.items()):
            if miss:
                L.append(f"| `{d}` | {', '.join(miss)} |")
    else:
        L.append("Нет.")

    L += ["", "## 4. Домены без профиля", ""]
    no_prof = sorted((d for d in by_domain if not prof_ops.get(d)), key=lambda d: -len(by_domain[d]))
    policy = {}
    if PROFILE_POLICY.exists():
        policy = json.loads(PROFILE_POLICY.read_text(encoding="utf-8")).get("domains", {})
    unclassified = [d for d in no_prof if d not in policy]
    queue = [d for d in no_prof if policy.get(d, {}).get("needs_profile")]
    by_design = [d for d in no_prof if d in policy and not policy[d].get("needs_profile")]

    L += [
        "Правило проекта: **домен без профиля обязан быть классифицирован** в "
        "`data/domain_profile_policy.json`. Иначе непонятно, это долг или решение.",
        "",
        f"### 4.1 Нужен профиль (очередь) — {len(queue)}",
        "",
    ]
    L += [f"- `{d}` — {len(by_domain[d])} действий. *{policy[d]['why']}* → {policy[d].get('next', '—')}"
          for d in queue] or ["Нет."]
    L += [
        "",
        f"### 4.2 Профиль не нужен — домен закрывается другим артефактом — {len(by_design)}",
        "",
        "| Домен | Действий | Чем закрывается | Почему не профиль |",
        "| --- | --- | --- | --- |",
    ]
    for d in by_design:
        L.append(f"| `{d}` | {len(by_domain[d])} | {policy[d].get('fulfilled_by', '—')} | {policy[d]['why']} |")
    if not by_design:
        L.append("| — | — | — | — |")
    L += [
        "",
        f"С профилями: {', '.join(f'`{d}` ({n})' for d, n in prof_ops.most_common()) or '—'}.",
        "",
        f"Ширина есть, глубина — в {len({d for d in prof_ops})} доменах из {len(by_domain)}. "
        "Очередь закрывается через профили приложений: адресный список — "
        "`docs/APP-COVERAGE.md` (приоритеты P0…P3).",
        "",
        "## 5. Глаголы-одиночки (встречаются один раз)",
        "",
        f"Всего {len(single_use)} из {len(verbs)}. Это не ошибка: редкие глаголы нормальны, "
        "но если глагол нужен системе, он должен встречаться на нескольких объектах.",
        "",
        ", ".join(f"`{v}`" for v in single_use) or "—",
        "",
        "## 6. Гигиена статусов",
        "",
    ]
    if all_deferred:
        L.append("Домены, где **всё** отложено в v2 (обещание без реализации):")
        L += [f"- `{d}`" for d in all_deferred]
    else:
        L.append("Нет доменов, целиком отложенных в v2.")
    depth = []
    for d, rows_d in by_domain.items():
        n = len(rows_d)
        ops = prof_ops.get(d, 0)
        if n >= 8 and not (d in policy and not policy[d].get("needs_profile")):
            depth.append((ops / n, ops, n, d))
    depth.sort()
    L += [
        "",
        "## 7. Ширина против глубины (действия реестра vs операции профилей)",
        "",
        "Отношение показывает, насколько домен доведён «до кнопок»: 0 — есть только описание, "
        "1.0 — на каждое действие есть хотя бы одна операция в профиле.",
        "",
        "| Домен | Действий | Операций в профилях | Глубина |",
        "| --- | --- | --- | --- |",
    ]
    for ratio, ops, n, d in depth[:12]:
        L.append(f"| `{d}` | {n} | {ops} | {ratio:.2f} |")
    L += [
        "",
        "Ниже всех — те домены, где реестр обещает больше, чем умеют профили. Это и есть "
        "адресная очередь на углубление (а не список «домены, которых нет»). Домены, которые "
        "по решению закрываются другим артефактом (скилл, коннектор, бенчмарк, API), здесь "
        "не участвуют — иначе они вечно висели бы в конце таблицы с нулём.",
        "",
        "## 8. Что делать с этим списком",
        "",
        "1. Взять **самый широкий домен без профиля** и довести 5–8 операций (эффект выше, чем +20 строк реестра).",
        "2. Закрыть **семейство «проверка»** там, где его нет: без проверки действия не существует.",
        "3. Тонкие домены довести до CRUD, а не раздувать новыми доменами.",
        "4. Глаголы-одиночки либо подтвердить как редкие, либо применить к другим объектам.",
        "",
        f"Инвариант: **{len(rows)} строк реестра без проверок хуже, чем 100 строк с проверками.** "
        "Аудит существует, чтобы это соотношение не ухудшалось незаметно.",
        "",
    ]
    MD_OUT.write_text("\n".join(L), encoding="utf-8")

    if unclassified:
        print("UNCLASSIFIED DOMAINS (add to data/domain_profile_policy.json): "
              + ", ".join(unclassified), file=sys.stderr)
        return 1
    if unmapped_verbs:
        print("UNMAPPED VERBS:", ", ".join(unmapped_verbs), file=sys.stderr)
        return 1
    print(f"coverage: {len(rows)} actions / {len(by_domain)} domains, "
          f"thin={len(thin)}, family gaps={len(family_gaps)}, no-profile={len(no_prof)} "
          f"-> {MD_OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
