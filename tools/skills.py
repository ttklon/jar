#!/usr/bin/env python3
"""Skills: registry actions assembled into a finished piece of work.

The registry answers *what ZShelper can do* (`data/actions.psv`), profiles answer
*how to do it in one app* (`data/profiles/*.json`). A skill answers the question a
person actually asks: **«сделай мне вот это»** — and it is the only layer where a
result exists. «Нажал кнопку» и «трек готов» — разные вещи.

A skill is a recipe:
  1. `phrases`   — how a person says it (used for retrieval in the orchestrator);
  2. `steps`     — ordered, each with the registry actions it uses and how to verify;
  3. `done`      — criteria for the *result*, not for the clicks;
  4. `checkpoints` — where a human must confirm (required if any step is risky);
  5. `refuse`    — what the skill will not do even if asked;
  6. `limits`    — честная граница: что система не гарантирует.

Validated invariants (CI fails otherwise):
  * every referenced registry action exists (domain|verb[|object]);
  * every referenced profile file exists;
  * declared `domains` equal the domains actually used by the steps;
  * a skill with any destructive/external/money/identity step lists checkpoints;
  * every step has a verification (unverified step is not a step).

It also renders `docs/SKILLS.md` with coverage: which registry actions are used by at
least one skill, and which are still only a row in a table.

Usage: python3 tools/skills.py [--check]
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "data" / "skills"
PROFILES = ROOT / "data" / "profiles"
ACTIONS = ROOT / "data" / "actions.json"
OUT = ROOT / "docs" / "SKILLS.md"

RISK_RANK = {"read": 0, "write-local": 1, "external": 2, "destructive": 3, "identity": 4, "money": 5}
RISKY = {"external", "destructive", "identity", "money"}
REQUIRED = ("id", "title", "phrases", "scope", "inputs", "outputs", "domains", "steps", "done", "checkpoints", "refuse")


def load_actions() -> list[dict]:
    return json.loads(ACTIONS.read_text(encoding="utf-8"))


def match(rows: list[dict], ref: str) -> list[dict]:
    """Rows matching 'domain|verb' or 'domain|verb|object-substring'."""
    parts = ref.split("|")
    if len(parts) < 2:
        return []
    dom, verb = parts[0], parts[1]
    obj = parts[2] if len(parts) > 2 else None
    return [
        r for r in rows
        if r["domain"] == dom and r["verb"] == verb and (obj is None or obj in r["object"])
    ]


def load_skills() -> list[dict]:
    out = []
    for path in sorted(SKILLS.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        data["_file"] = path.name
        out.append(data)
    return out


def check(skills: list[dict], rows: list[dict], profiles: set[str]) -> tuple[list[str], list[dict]]:
    errs: list[str] = []
    enriched: list[dict] = []
    seen_ids: dict[str, str] = {}

    for s in skills:
        name = s["_file"]
        sid = s.get("id", "")
        if not sid:
            errs.append(f"{name}: missing id")
            continue
        if sid != name[:-5]:
            errs.append(f"{name}: id '{sid}' does not match file name")
        if sid in seen_ids:
            errs.append(f"{name}: duplicate id '{sid}' (also in {seen_ids[sid]})")
        seen_ids[sid] = name

        for key in REQUIRED:
            if key not in s:
                errs.append(f"{name}: missing key '{key}'")
        if any(k not in s for k in REQUIRED):
            continue

        step_risks: list[str] = []
        used_domains: set[str] = set()
        used_rows: list[dict] = []

        for i, step in enumerate(s["steps"], 1):
            tag = f"{name} шаг {i} ({step.get('step', '?')})"
            for key in ("step", "actions", "verify"):
                if not step.get(key):
                    errs.append(f"{tag}: missing '{key}'")
            if not step.get("actions") or not step.get("verify"):
                continue
            for ref in step["actions"]:
                hits = match(rows, ref)
                if not hits:
                    errs.append(f"{tag}: no registry row for '{ref}'")
                    continue
                used_domains.add(hits[0]["domain"])
                used_rows.extend(hits)
                worst = max(hits, key=lambda r: RISK_RANK[r["risk"]])
                step_risks.append(worst["risk"])

        for prof in s.get("profiles", []):
            if prof not in profiles:
                errs.append(f"{name}: no profile file data/profiles/{prof}.json")

        declared = set(s["domains"])
        if declared != used_domains:
            missing = sorted(used_domains - declared)
            extra = sorted(declared - used_domains)
            errs.append(f"{name}: domains mismatch (не объявлены: {missing}; объявлены без действий: {extra})")

        computed = max(step_risks, key=lambda r: RISK_RANK[r]) if step_risks else "read"
        if computed in RISKY and not s["checkpoints"]:
            errs.append(f"{name}: risk '{computed}' but no human checkpoints")
        if computed != s.get("risk"):
            errs.append(f"{name}: declared risk '{s.get('risk')}' != computed '{computed}' from actions")
        if not s["done"]:
            errs.append(f"{name}: no done criteria")

        enriched.append({
            "id": sid, "title": s["title"], "phrases": s["phrases"], "scope": s["scope"],
            "inputs": s["inputs"], "outputs": s["outputs"], "domains": sorted(declared),
            "profiles": s.get("profiles", []), "time": s.get("time", "—"), "risk": computed,
            "steps": s["steps"], "done": s["done"], "checkpoints": s["checkpoints"],
            "refuse": s["refuse"], "limits": s.get("limits", ""),
            "rows": used_rows,
        })
    return errs, enriched


def render(skills: list[dict], rows: list[dict]) -> str:
    covered: set[int] = set()
    for s in skills:
        for r in s["rows"]:
            covered.add(id(r))
    total_steps = sum(len(s["steps"]) for s in skills)
    per_domain: Counter = Counter()
    for s in skills:
        for d in s["domains"]:
            per_domain[d] += 1
    used_domains = {r["domain"] for r in rows if id(r) in covered}
    risk_count = Counter(s["risk"] for s in skills)

    L: list[str] = []
    L += [
        f"# Скиллы: как {len(rows)} действий превращаются в работу",
        "",
        "Реестр отвечает «что умею», профили — «как в этой программе». Скилл отвечает на то, "
        "что человек реально просит: **«сделай мне вот это»**. Здесь собраны рецепты, у каждого — "
        "шаги из реестра, проверка результата, точки остановки и границы.",
        "",
        "Файл генерируется `python3 tools/skills.py`; данные — `data/skills/*.json`.",
        "",
        f"**Скиллов: {len(skills)}** · шагов: **{total_steps}** · "
        f"действий реестра задействовано: **{len(covered)} из {len(rows)}** · "
        f"доменов задействовано: **{len(used_domains)} из {len({r['domain'] for r in rows})}**",
        "",
        "## Зачем отдельный слой",
        "",
        "| Вопрос | Артефакт | Что проверяется |",
        "| --- | --- | --- |",
        "| «Что система умеет?» | `data/actions.psv` | строка реестра валидна |",
        "| «Как это в Photoshop?» | `data/profiles/*.json` | шаги + `verify` в живом окне |",
        "| «Сделай трек / сдай курсовую / приведи систему в порядок» | `data/skills/*.json` | критерии результата (`done`), а не нажатия |",
        "",
        "Без этого слоя получается ассистент, который умеет нажимать кнопки и не умеет делать работу: "
        "у него есть операции, но нет понятия «готово».",
        "",
        "## Список",
        "",
        "| Скилл | Фразы-триггеры | Шагов | Домены | Риск | Время |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for s in skills:
        phrases = ", ".join(f"«{p}»" for p in s["phrases"][:2])
        L.append(
            f"| [{s['title']}](#{s['id']}) | {phrases} | {len(s['steps'])} | "
            f"{', '.join('`'+d+'`' for d in s['domains'])} | `{s['risk']}` | {s['time']} |"
        )

    L += [
        "",
        "## Покрытие: что уже собрано в работу",
        "",
        "| Домен | Скиллов, которые его используют |",
        "| --- | --- |",
    ]
    for d, n in per_domain.most_common():
        L.append(f"| `{d}` | {n} |")

    L += [
        "",
        f"Риск по скиллам: " + ", ".join(f"`{k}` — {v}" for k, v in risk_count.most_common()) + ".",
        "",
        "Домены, которых пока не касается ни один скилл, — это не долг: реестр шире, чем десяток "
        "типовых работ. Но если домен широкий и в скиллах его нет, это сигнал, что способности "
        "лежат без применения.",
        "",
        "## Рецепты",
        "",
    ]

    for s in skills:
        L += [f"### {s['title']} <a id=\"{s['id']}\"></a>", "", s["scope"], ""]
        L += [f"**Фразы:** " + ", ".join(f"«{p}»" for p in s["phrases"]) + "  "]
        L += [f"**Вход:** " + "; ".join(s["inputs"]) + "  "]
        L += [f"**Выход:** " + "; ".join(s["outputs"]) + "  "]
        L += [f"**Время:** {s['time']} · **риск:** `{s['risk']}` · "
              f"**профили:** " + (", ".join(f"`{p}`" for p in s["profiles"]) or "—"), ""]
        L += ["| # | Шаг | Действия реестра | Проверка |", "| --- | --- | --- | --- |"]
        for i, step in enumerate(s["steps"], 1):
            acts = "<br>".join(f"`{a}`" for a in step["actions"])
            L.append(f"| {i} | {step['step']} | {acts} | {step['verify']} |")
        L += ["", "**Готово, когда:**"]
        L += [f"- {d}" for d in s["done"]]
        if s["checkpoints"]:
            L += ["", "**Остановки на подтверждение человеком:**"]
            L += [f"- {c}" for c in s["checkpoints"]]
        L += ["", "**Не делает:** " + "; ".join(s["refuse"]) + "."]
        if s["limits"]:
            L += ["", f"**Граница:** {s['limits']}."]
        L += [""]

    unused = [r for r in rows if id(r) not in covered]
    by_domain = defaultdict(int)
    for r in unused:
        by_domain[r["domain"]] += 1
    L += [
        "## Что ещё не собрано в скиллы",
        "",
        f"{len(unused)} действий реестра пока не входят ни в один рецепт. Крупнейшие домены без скилла:",
        "",
        "| Домен | Действий без скилла |",
        "| --- | --- |",
    ]
    for d, n in sorted(by_domain.items(), key=lambda kv: -kv[1])[:12]:
        L.append(f"| `{d}` | {n} |")
    L += [
        "",
        "Очередь пополнения: брать не «домен целиком», а работу, которую человек формулирует одной "
        "фразой. Рецепт без проверки результата не добавляется — как и профиль без `verify`.",
        "",
    ]
    return "\n".join(L)


def main() -> int:
    rows = load_actions()
    profiles = {p.stem for p in PROFILES.glob("*.json") if not p.name.startswith("_")}
    skills = load_skills()
    if not skills:
        print("skills: no data/skills/*.json found")
        return 1
    errs, ok = check(skills, rows, profiles)
    if errs:
        for e in errs:
            print("ERROR:", e)
        return 1
    text = render(ok, rows)
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            print("skills: docs/SKILLS.md is stale — run python3 tools/skills.py")
            return 1
        print("skills: docs/SKILLS.md is up to date")
        return 0
    OUT.write_text(text, encoding="utf-8")
    total_steps = sum(len(s["steps"]) for s in ok)
    print(f"skills: {len(ok)}, steps: {total_steps} -> docs/SKILLS.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
