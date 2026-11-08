#!/usr/bin/env python3
"""
Regenerates the status block inside AGENTS.md.

Why this exists: AGENTS.md is the single entrypoint for anyone (human or a model
with no context) who opens this repository. Numbers in such a file rot within a
week. So the numbers are not written by hand — they are rendered from the data
files and checked in CI, exactly like docs/ACTIONS.md and docs/PROFILES.md.

The block lives between `<!-- STATUS:BEGIN -->` and `<!-- STATUS:END -->`.
Everything outside those markers is hand-written guidance and is left untouched.

Usage:
    python3 tools/status.py            # rewrite the block in AGENTS.md
    python3 tools/status.py --check    # exit 1 if the block is stale
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "AGENTS.md"
ACTIONS = ROOT / "data" / "actions.json"
PROFILES = ROOT / "data" / "profiles"
TARGETS = ROOT / "data" / "app_targets.psv"
POLICY = ROOT / "data" / "domain_profile_policy.json"
EVALS = ROOT / "data" / "evals.json"
SOURCES = ROOT / "tools" / "sources.json"

BEGIN = "<!-- STATUS:BEGIN -->"
END = "<!-- STATUS:END -->"


RESEARCH_SOURCES = ROOT / "research" / "SOURCES.json"


def count_sources() -> tuple[int, int]:
    """(sources, categories) — from research/SOURCES.json (ground truth), else registry."""
    if RESEARCH_SOURCES.exists():
        metas = json.loads(RESEARCH_SOURCES.read_text(encoding="utf-8"))
        cats = {m.get("category") for m in metas if m.get("category")}
        return len(metas), len(cats)
    if not SOURCES.exists():
        return 0, 0
    data = json.loads(SOURCES.read_text(encoding="utf-8"))
    cats = data.get("categories", {})
    total = sum(
        len(items.get(k, []) or [])
        for name, items in cats.items()
        if not name.startswith("$") and isinstance(items, dict)
        for k in ("github", "pypi", "npm")
    )
    return total, len([n for n in cats if not n.startswith("$")])


def build_block() -> str:
    actions = json.loads(ACTIONS.read_text(encoding="utf-8"))
    domains = {r["domain"] for r in actions}
    verbs = {r["verb"] for r in actions}

    infos = []
    for path in sorted(PROFILES.glob("*.json")):
        if path.name.startswith("_"):
            continue
        d = json.loads(path.read_text(encoding="utf-8"))
        infos.append((path.name, d.get("kind", "app"), len(d.get("operations", []))))
    ops_total = sum(i[2] for i in infos)
    kinds = Counter(i[1] for i in infos)

    prof_ops: Counter = Counter()
    for path in sorted(PROFILES.glob("*.json")):
        if path.name.startswith("_"):
            continue
        d = json.loads(path.read_text(encoding="utf-8"))
        for op in d.get("operations", []):
            ref = op.get("registry", "")
            if "|" in ref:
                prof_ops[ref.split("|")[0]] += 1

    by_domain: dict[str, int] = defaultdict(int)
    for r in actions:
        by_domain[r["domain"]] += 1
    policy = json.loads(POLICY.read_text(encoding="utf-8")).get("domains", {}) if POLICY.exists() else {}
    no_prof = [d for d in by_domain if not prof_ops.get(d)]
    queue = [d for d in no_prof if policy.get(d, {}).get("needs_profile")]
    by_design = [d for d in no_prof if d in policy and not policy[d].get("needs_profile")]

    depth = []
    for d, n in by_domain.items():
        if n >= 8 and not (d in policy and not policy[d].get("needs_profile")):
            depth.append((prof_ops.get(d, 0) / n, prof_ops.get(d, 0), n, d))
    depth.sort()

    rows = []
    if TARGETS.exists():
        for line in TARGETS.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            f = line.split("|")
            if len(f) == 8:
                rows.append(f)
    tier = Counter(r[5] for r in rows)
    exes = set()
    for path in sorted(PROFILES.glob("*.json")):
        if path.name.startswith("_"):
            continue
        for e in json.loads(path.read_text(encoding="utf-8")).get("exe", []):
            exes.add(e.lower())
    covered = sum(1 for r in rows if r[3].lower() in exes)

    evals_raw = json.loads(EVALS.read_text(encoding="utf-8")) if EVALS.exists() else {}
    if isinstance(evals_raw, dict):
        n_evals = int(evals_raw.get("count", len(evals_raw.get("evals", []))))
        n_curated = len(evals_raw.get("curated", []))
    else:
        n_evals, n_curated = len(evals_raw), 0
    src_total, src_cats = count_sources()

    L = [
        BEGIN,
        "## Состояние проекта (генерируется `python3 tools/status.py`, руками не править)",
        "",
        "| Что | Значение |",
        "| --- | --- |",
        f"| Действий в реестре | **{len(actions)}** · доменов {len(domains)} · глаголов {len(verbs)} |",
        f"| Профилей | **{len(infos)}** (`app` — {kinds.get('app', 0)}, `tool` — {kinds.get('tool', 0)}, "
        f"`system` — {kinds.get('system', 0)}) |",
        f"| Операций в профилях | **{ops_total}** |",
        f"| Приложений в каталоге | **{len(rows)}** (tier A — {tier.get('A', 0)}, B — {tier.get('B', 0)}, "
        f"C — {tier.get('C', 0)}; профиль найден по процессу у {covered}) |",
        f"| Доменов без профиля | **{len(no_prof)}** — в очереди {len(queue)}, по решению {len(by_design)} |",
        f"| Сценариев в плане проверок | **{n_evals}** (+ {n_curated} обязательных) |",
        f"| Источников в каталоге | **{src_total}** в {src_cats} категориях |",
        "",
        "**Очередь на углубление** (домены с наименьшим отношением «операции профилей / действия реестра», "
        "без доменов, закрываемых не профилем):",
        "",
        "| Домен | Действий | Операций | Глубина |",
        "| --- | --- | --- | --- |",
    ]
    for ratio, ops, n, d in depth[:5]:
        L.append(f"| `{d}` | {n} | {ops} | {ratio:.2f} |")
    if queue:
        L += ["", "**Домены в очереди на профиль:** " + ", ".join(f"`{d}`" for d in queue) + "."]
    else:
        L += ["", "**Домены в очереди на профиль:** нет — все оставшиеся классифицированы как решения."]
    L.append(END)
    return "\n".join(L)


def check_links(text: str) -> list[str]:
    """Every relative markdown link in AGENTS.md must resolve — a broken link there
    is fatal for someone reading this repository for the first time."""
    broken = []
    for label, target in re.findall(r"\[([^\]]+)\]\(([^)]+)\)", text):
        if target.startswith(("http://", "https://", "#", "mailto:")):
            continue
        path = (ROOT / target.split("#")[0]).resolve()
        if not path.exists():
            broken.append(f"{label} -> {target}")
    return broken


def main() -> int:
    if not AGENTS.exists():
        print("AGENTS.md not found", file=sys.stderr)
        return 2
    text = AGENTS.read_text(encoding="utf-8")
    if BEGIN not in text or END not in text:
        print(f"AGENTS.md must contain {BEGIN} and {END}", file=sys.stderr)
        return 2
    broken = check_links(text)
    if broken:
        print("broken links in AGENTS.md:", file=sys.stderr)
        for b in broken:
            print("  -", b, file=sys.stderr)
        return 1

    head, rest = text.split(BEGIN, 1)
    _, tail = rest.split(END, 1)
    new = head + build_block() + tail
    if "--check" in sys.argv:
        if new != text:
            print("AGENTS.md status block is stale — run python3 tools/status.py", file=sys.stderr)
            return 1
        print("AGENTS.md status block is up to date")
        return 0
    AGENTS.write_text(new, encoding="utf-8")
    print(f"AGENTS.md updated ({len(new.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
