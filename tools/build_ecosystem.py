#!/usr/bin/env python3
"""Builder for the ecosystem catalogues (what we can take from the outside world).

Nine catalogues live in `data/ecosystem/`:

  mcp-servers  — MCP-серверы (что уже умеет говорить по протоколу)
  skills       — навыки: наши рецепты + внешние Agent Skills
  abilities    — умения: группы действий нашего реестра (домен × семейство)
  plugins      — пакеты-расширения, которые встраиваются в хост
  agents       — агенты и фреймворки агентов
  models       — модели по ролям (ASR/TTS/VLM/LLM/OCR/embed/…)
  tools        — CLI-утилиты и библиотеки
  assistants   — приложения-помощники и встроенные ассистенты
  connectors   — сервисы, к которым подключаемся (коннекторы)
  connections  — каналы подключения (протоколы, API, шины)

Everything is **mined from `research/`** where possible: 1461 MCP-сервер, 347 Agent Skills,
96 агентов, 880 пакетов npm/PyPI, 1645 источников. Curated lists (models, connections,
connectors, assistants) лежат в `data/ecosystem/_curated/*.json` и проверяются отдельно.

Rule: **ни одного придуманного имени**. У каждой записи есть `origin` (vault | curated |
registry | zshelper) и, для внешних, ссылка на источник. Записи без проверки помечены
`status: candidate` — их нельзя считать решением.

Запуск: python3 tools/build_ecosystem.py
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "ecosystem"
CURATED = OUT / "_curated"
DISC = ROOT / "research" / "discovery"
SOURCES = ROOT / "research" / "SOURCES.json"
ACTIONS = ROOT / "data" / "actions.json"
SKILLS = ROOT / "data" / "skills"
VERBS = ROOT / "data" / "verb_families.json"

CLEAN = re.compile(r"[*_`#>\[\]()!]|:\w+:|https?://\S+")


def clean(text: str, limit: int = 220) -> str:
    """Однострочное описание из README-строки: без разметки, эмодзи и ссылок."""
    s = CLEAN.sub(" ", text or "")
    s = re.sub(r"\s+", " ", s).strip(" -–—|")
    return s[:limit].rstrip()


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def vault_sources() -> list[dict]:
    return load(SOURCES)


def discovery(name: str) -> list[dict]:
    p = DISC / name
    if not p.exists():
        return []
    return load(p)["entries"]


# ---------------------------------------------------------------- mcp-servers

MCP_QUOTA = {
    "Developer Tools": 55,
    "Communication": 40,
    "Databases": 30,
    "Cloud Platforms": 30,
    "Browser Automation": 25,
    "Coding Agents": 20,
    "Command Line": 15,
    "Code Execution": 12,
    "Aggregators": 15,
    "Data Platforms": 11,
    "Accessibility": 4,
    "Art & Culture": 6,
    "Customer Data Platforms": 4,
}


def build_mcp() -> list[dict]:
    entries = discovery("mcp-servers.json") + discovery("mcp-servers-wong2.json")
    seen: set[str] = set()
    rows: list[dict] = []
    by_cat: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        repo = (e.get("repo") or "").lower()
        if not repo or repo in seen or e.get("archived"):
            continue
        seen.add(repo)
        by_cat[e.get("category", "Other")].append(e)
    for cat, quota in MCP_QUOTA.items():
        pool = sorted(by_cat.get(cat, []), key=lambda e: -(e.get("stars") or 0))
        for e in pool[:quota]:
            rows.append({
                "id": "mcp:" + e["repo"],
                "name": e["name"] if e["name"] not in ("", "Image") else e["repo"],
                "category": "mcp-servers",
                "subkind": cat.lower().replace(" ", "-").replace("&", "and"),
                "origin": "vault",
                "url": e.get("url"),
                "license": e.get("license"),
                "stars": e.get("stars"),
                "gives": clean(e.get("gh_description") or e.get("description") or ""),
                "channel": "mcp",
                "transport": "http" if re.search(r"remote|streamable|sse", (e.get("description") or ""), re.I) else "stdio",
                "status": "candidate",
                "needs_check": True,
            })
    # skills-центричные MCP из официального реестра тоже полезны — доберём по звёздам
    rows.sort(key=lambda r: -(r.get("stars") or 0))
    return rows


# ------------------------------------------------------------------- skills

def build_skills() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(SKILLS.glob("*.json")):
        s = load(path)
        rows.append({
            "id": "skill:zshelper:" + s["id"],
            "name": s["title"],
            "category": "skills",
            "subkind": "zshelper-recipe",
            "origin": "zshelper",
            "url": "docs/SKILLS.md#" + s["id"],
            "license": "own",
            "gives": s["scope"][:200],
            "phrases": s["phrases"][:3],
            "domains": s["domains"],
            "risk": s["risk"],
            "status": "selected",
            "needs_check": False,
        })
    seen: set[str] = set()
    external = sorted(
        (e for e in discovery("agent-skills.json") if e.get("category") in
         ("Community Skills", "Official Skills by", "TypeScript Skills")),
        key=lambda e: -(e.get("stars") or 0),
    )
    for e in external:
        repo = (e.get("repo") or "").lower()
        if not repo or repo in seen:
            continue
        seen.add(repo)
        rows.append({
            "id": "skill:" + e["repo"],
            "name": e.get("name") or e["repo"],
            "category": "skills",
            "subkind": "agent-skill",
            "origin": "vault",
            "url": e.get("url"),
            "license": e.get("license"),
            "stars": e.get("stars"),
            "gives": clean(e.get("gh_description") or e.get("description") or ""),
            "status": "candidate",
            "needs_check": True,
        })
        if len(rows) >= 245:
            break
    return rows


# ------------------------------------------------------------------- agents

def build_agents() -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()

    def add(repo: str, name: str, url: str, license_: str | None, stars, desc: str, subkind: str):
        key = repo.lower()
        if not key or key in seen:
            return
        seen.add(key)
        rows.append({
            "id": "agent:" + repo,
            "name": name or repo,
            "category": "agents",
            "subkind": subkind,
            "origin": "vault",
            "url": url,
            "license": license_,
            "stars": stars,
            "gives": clean(desc),
            "status": "candidate",
            "needs_check": True,
        })

    for e in sorted(discovery("ai-agents.json"), key=lambda x: -(x.get("stars") or 0)):
        add(e.get("repo", ""), e.get("repo", "").split("/")[-1], e.get("url", ""),
            e.get("license"), e.get("stars"), e.get("gh_description") or "", "framework")
    for e in sorted(discovery("claude-code.json"), key=lambda x: -(x.get("stars") or 0)):
        add(e.get("repo", ""), e.get("name", ""), e.get("url", ""), e.get("license"),
            e.get("stars"), e.get("gh_description") or e.get("description") or "", "claude-code")
    for src in vault_sources():
        if src.get("kind") != "github":
            continue
        if src.get("category") not in ("orchestration", "coding-agents"):
            continue
        add(src.get("repo", ""), src.get("repo", "").split("/")[-1], src.get("url", ""),
            src.get("license"), src.get("stars"), src.get("description") or "", "framework")
        if len(rows) >= 230:
            break
    return rows[:230]


# ------------------------------------------------------------------ plugins

PLUGIN_CATS = ("ui-ux", "packaging-and-ci", "electron-shell", "orchestration",
               "observability-evals", "memory-and-rag", "configuration")


def build_plugins() -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for e in sorted(discovery("claude-code.json"), key=lambda x: -(x.get("stars") or 0)):
        repo = (e.get("repo") or "").lower()
        if not repo or repo in seen:
            continue
        seen.add(repo)
        rows.append({
            "id": "plugin:claude-code:" + e["repo"],
            "name": e.get("name") or e["repo"],
            "category": "plugins",
            "subkind": "claude-code-plugin",
            "origin": "vault",
            "url": e.get("url"),
            "license": e.get("license"),
            "stars": e.get("stars"),
            "gives": clean(e.get("gh_description") or e.get("description") or ""),
            "status": "candidate",
            "needs_check": True,
        })
    for src in sorted(vault_sources(), key=lambda x: -(x.get("stars") or 0)):
        if src.get("kind") not in ("npm", "pypi"):
            continue
        if src.get("category") not in PLUGIN_CATS:
            continue
        pkg = src.get("package", "")
        if pkg.lower() in seen:
            continue
        seen.add(pkg.lower())
        rows.append({
            "id": "plugin:" + src["kind"] + ":" + pkg,
            "name": pkg,
            "category": "plugins",
            "subkind": src["kind"] + "-package",
            "origin": "vault",
            "url": src.get("url"),
            "license": src.get("license"),
            "gives": clean(src.get("summary") or ""),
            "channel": "library",
            "status": "candidate",
            "needs_check": True,
        })
        if len(rows) >= 210:
            break
    return rows


# -------------------------------------------------------------------- tools

TOOL_CATS = ("windows-automation", "system-control", "system-triage", "network-admin",
             "backup-archive", "documents-ocr", "media-production", "music-audio",
             "deployment-admin", "virtualization-remote", "screen-understanding",
             "devices-peripherals", "crypto-privacy", "home-iot", "adb-android",
             "inference-runtimes", "academic-writing", "office-automation")


def build_tools() -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for src in sorted(vault_sources(), key=lambda x: -(x.get("stars") or 0)):
        if src.get("kind") not in ("npm", "pypi", "github"):
            continue
        if src.get("category") not in TOOL_CATS:
            continue
        name = src.get("package") or src.get("repo") or ""
        key = name.lower()
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append({
            "id": "tool:" + src["kind"] + ":" + name,
            "name": name.split("/")[-1],
            "category": "tools",
            "subkind": {"npm": "npm-cli", "pypi": "pypi-lib", "github": "github-tool"}[src["kind"]],
            "origin": "vault",
            "url": src.get("url"),
            "license": src.get("license"),
            "stars": src.get("stars"),
            "gives": clean(src.get("summary") or src.get("description") or ""),
            "topic": src.get("category"),
            "status": "candidate",
            "needs_check": True,
        })
        if len(rows) >= 230:
            break
    return rows


# ----------------------------------------------------------------- abilities

DOMAIN_TITLES = None


def build_abilities() -> list[dict]:
    from tools_actions_titles import TITLES  # noqa: WPS433  (см. ниже)
    actions = load(ACTIONS)
    fam = load(VERBS)["families"]
    verb_family = {v: f for f, verbs in fam.items() for v in verbs}
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for a in actions:
        groups[(a["domain"], verb_family.get(a["verb"], "прочее"))].append(a)
    rows: list[dict] = []
    rank = {"read": 0, "write-local": 1, "external": 2, "destructive": 3, "identity": 4, "money": 5}
    for (domain, family), items in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        worst = max((a["risk"] for a in items), key=lambda r: rank[r])
        objects = sorted({a["object"] for a in items})
        rows.append({
            "id": f"ability:{domain}:{family}",
            "name": f"{TITLES.get(domain, domain)}: {family}",
            "category": "abilities",
            "subkind": family,
            "origin": "registry",
            "url": "docs/ACTIONS.md",
            "license": "own",
            "domain": domain,
            "actions": len(items),
            "gives": f"{len(items)} действий: " + ", ".join(objects[:6]),
            "examples": objects[:6],
            "tier": min(a["tier"] for a in items),
            "risk": worst,
            "status": "selected",
            "needs_check": False,
        })
    return rows


# ---------------------------------------------------------------- assistants

def build_assistant_roles() -> list[dict]:
    """Помощники-роли внутри ZShelper: один на домен реестра.

    Роль — это не приложение и не скилл, а «кто отвечает за домен»: какие действия
    он ведёт, что обязан проверить и чего не делает никогда (деньги, identity).
    """
    from tools_actions_titles import TITLES

    actions = load(ACTIONS)
    by_domain: dict[str, list[dict]] = defaultdict(list)
    for a in actions:
        by_domain[a["domain"]].append(a)
    rank = {"read": 0, "write-local": 1, "external": 2, "destructive": 3, "identity": 4, "money": 5}
    rows: list[dict] = []
    for domain, items in sorted(by_domain.items()):
        if len(items) < 8:
            continue
        worst = max((a["risk"] for a in items), key=lambda r: rank[r])
        forbidden = sorted({a["object"] for a in items if a["risk"] in ("money", "identity")})
        rows.append({
            "id": "assistant:role:" + domain,
            "name": f"Помощник: {TITLES.get(domain, domain)}",
            "category": "assistants",
            "subkind": "zshelper-role",
            "origin": "zshelper",
            "url": "docs/ACTIONS.md",
            "license": "own",
            "domain": domain,
            "gives": f"{len(items)} действий: " + ", ".join(sorted({a['object'] for a in items})[:6]),
            "refuses": ("не делает: " + ", ".join(forbidden)) if forbidden else "деньги и подпись — только человек",
            "risk": worst,
            "status": "selected",
            "needs_check": False,
        })
    return rows


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    builders = {
        "mcp-servers": build_mcp,
        "skills": build_skills,
        "agents": build_agents,
        "plugins": build_plugins,
        "tools": build_tools,
        "abilities": build_abilities,
    }
    for name, fn in builders.items():
        rows = fn()
        (OUT / f"{name}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{name:14s} {len(rows):4d}")

    # curated catalogues are copied as-is from _curated/ (validated by tools/ecosystem.py)
    for path in sorted(CURATED.glob("*.json")):
        rows = load(path)
        if path.stem == "assistants":
            rows = build_assistant_roles() + rows
        (OUT / (path.stem + ".json")).write_text(
            json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"{path.stem:14s} {len(rows):4d} (curated)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
