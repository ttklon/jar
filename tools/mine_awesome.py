#!/usr/bin/env python3
"""
Mine "awesome" lists that we already downloaded into the vault.

Turns a 1500-line awesome README into:
  * research/discovery/<name>.md   — categorized inventory, sorted by stars
  * research/discovery/<name>.json — machine-readable, for the tool catalog

Why: the MCP ecosystem moves weekly; a human-curated awesome list is the
cheapest way to get a *current* inventory of servers, their categories and
their popularity, without burning an agent's context.

Usage:
    GITHUB_TOKEN=... python3 tools/mine_awesome.py \
        research/sources/mcp-and-tools/punkpeye__awesome-mcp-servers/README.md --name mcp-servers
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISCOVERY = ROOT / "research" / "discovery"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
UA = "this-helper-research-collector/1.0"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

LINK_RE = re.compile(r"\[([^\]]{0,120})\]\((https://github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+))[^)]*\)(.*)")
HEAD_RE = re.compile(r"^(#{2,4})\s+(.+?)\s*$")
BAD_PARTS = {
    "topics", "search", "sponsors", "marketplace", "features", "about", "pricing",
    "orgs", "login", "join", "site", "collections", "trending", "settings", "apps",
}


CACHE_PATH = ROOT / "research" / "discovery" / "_repo_cache.json"


def _load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return {}
    return {}


_CACHE = _load_cache()


def save_cache() -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(_CACHE, indent=1, ensure_ascii=False), encoding="utf-8")


def clean_cat(text: str) -> str:
    text = re.sub(r"<a[^>]*></a>|<[^>]+>", " ", text)
    text = re.sub(r"[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200d]", "", text)
    text = re.sub(r"[\[\]()`*_]", "", text)
    text = re.sub(r"\s+", " ", text).strip(" -—:|")
    return text or "Прочее"


def parse(path: Path) -> list[dict]:
    entries: dict[str, dict] = {}
    category = "Прочее"
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        head = HEAD_RE.match(line.strip())
        if head:
            title = clean_cat(head.group(2))
            if title and len(title) < 90 and not title.lower().startswith(("contents", "table of")):
                category = title
            continue
        m = LINK_RE.search(line)
        if not m:
            continue
        name, url, owner, repo = m.group(1), m.group(2), m.group(3), m.group(4)
        if owner.lower() in BAD_PARTS:
            continue
        slug = f"{owner}/{repo}"
        desc = re.sub(r"\s+", " ", m.group(5)).strip(" -—:–|,.")
        desc = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", desc)
        desc = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", desc)
        prev = entries.get(slug)
        if prev is None:
            entries[slug] = {"repo": slug, "name": clean_cat(name)[:80], "category": category,
                             "description": desc[:220], "url": f"https://github.com/{slug}"}
        elif len(prev["description"]) < len(desc) < 300:
            prev["description"] = desc[:220]
    return list(entries.values())


def meta_for(repo: str) -> dict:
    if repo in _CACHE:
        return dict(_CACHE[repo])
    url = f"https://api.github.com/repos/{repo}"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.github+json"})
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read())
                out = {
                    "stars": d.get("stargazers_count", 0),
                    "license": ((d.get("license") or {}) .get("spdx_id") or ""),
                    "pushed_at": (d.get("pushed_at") or "")[:10],
                    "archived": bool(d.get("archived")),
                    "language": d.get("language") or "",
                    "gh_description": (d.get("description") or "")[:220],
                    "topics": (d.get("topics") or [])[:10],
                }
                _CACHE[repo] = out
                return dict(out)
        except Exception:  # noqa: BLE001
            time.sleep(1 + attempt * 2)
    return {"stars": -1, "error": True}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("readme", type=Path)
    ap.add_argument("--name", required=True)
    ap.add_argument("--limit", type=int, default=1200)
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    entries = parse(args.readme)[: args.limit]
    print(f"parsed {len(entries)} unique repos from {args.readme.name}")
    DISCOVERY.mkdir(parents=True, exist_ok=True)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(meta_for, e["repo"]): e for e in entries}
        done = 0
        for fut in as_completed(futs):
            e = futs[fut]
            e.update(fut.result())
            done += 1
            if done % 100 == 0:
                print(f"  metadata {done}/{len(entries)}", flush=True)

    save_cache()
    ok = [e for e in entries if not e.get("error")]
    ok.sort(key=lambda e: (clean_cat(e["category"]).lower(), -int(e.get("stars") or 0)))

    by_cat: dict[str, list[dict]] = {}
    for e in ok:
        by_cat.setdefault(clean_cat(e["category"]), []).append(e)

    lines = [
        f"# Инвентаризация: `{args.name}`",
        "",
        f"Источник: `{os.path.relpath(args.readme.resolve(), ROOT)}` · собрано {NOW} · "
        f"репозиториев: **{len(ok)}** (ошибок метаданных: {len(entries) - len(ok)}).",
        "",
        "Сортировка внутри категорий — по звёздам. `arch` = архивный/заброшенный репозиторий, "
        "такие не берём в прод без причины.",
        "",
    ]
    for cat in sorted(by_cat, key=lambda k: -len(by_cat[k])):
        lines += ["", f"## {cat} ({len(by_cat[cat])})", "",
                  "| ★ | Репозиторий | Лицензия | Апдейт | Описание |",
                  "| --- | --- | --- | --- | --- |"]
        for e in by_cat[cat]:
            flag = " ⚠️arch" if e.get("archived") else ""
            desc = (e.get("description") or e.get("gh_description") or "").replace("|", "\\|")[:160]
            lines.append(
                f"| {int(e['stars']):,} | [{e['repo']}]({e['url']}){flag} | "
                f"{e.get('license') or '-'} | {e.get('pushed_at') or ''} | {desc} |"
            )
    out_md = DISCOVERY / f"{args.name}.md"
    out_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    (DISCOVERY / f"{args.name}.json").write_text(
        json.dumps({"name": args.name, "captured_at": NOW, "source": str(args.readme), "entries": ok},
                   indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out_md.relative_to(ROOT)} ({len(by_cat)} categories)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
