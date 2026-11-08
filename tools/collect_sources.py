#!/usr/bin/env python3
"""
ZShelper — research source collector.

Pulls primary sources (GitHub READMEs + selected docs files, PyPI metadata,
npm metadata) into a stable, greppable, offline research vault under
`research/sources/`. Also runs GitHub *discovery* searches so the vault grows
beyond what we already knew about.

Design goals
------------
* Idempotent: re-running never re-downloads what is already on disk unless
  --force is passed.
* Cheap on context: everything lands in files; the script prints only a short
  summary. Agents later `grep` the vault instead of re-reading the web.
* Honest: every file carries YAML front-matter with provenance + fetch time,
  and failures are logged to research/sources/_errors.log instead of silently
  vanishing.

Usage
-----
    GITHUB_TOKEN=... python3 tools/collect_sources.py fetch
    GITHUB_TOKEN=... python3 tools/collect_sources.py fetch --category voice
    GITHUB_TOKEN=... python3 tools/collect_sources.py discover
    GITHUB_TOKEN=... python3 tools/collect_sources.py index
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / "research"
SOURCES = RESEARCH / "sources"
DISCOVERY = RESEARCH / "discovery"
MANIFEST = Path(__file__).resolve().parent / "sources.json"
ERRLOG = SOURCES / "_errors.log"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""
UA = "zshelper-research-collector/1.0 (+https://github.com/ttklon/jar)"
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

REMAINING = {"github": None}


# --------------------------------------------------------------------------- #
# http helpers
# --------------------------------------------------------------------------- #
def http(url: str, accept: str | None = None, retries: int = 3) -> tuple[int, bytes, dict]:
    last = (0, b"", {})
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        if accept:
            req.add_header("Accept", accept)
        if TOKEN and "api.github.com" in url:
            req.add_header("Authorization", f"Bearer {TOKEN}")
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                hdrs = {k.lower(): v for k, v in r.headers.items()}
                if "x-ratelimit-remaining" in hdrs:
                    REMAINING["github"] = int(hdrs["x-ratelimit-remaining"])
                return r.status, r.read(), hdrs
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            if e.code in (403, 429) and attempt < retries - 1:
                reset = e.headers.get("x-ratelimit-reset")
                wait = 20 if not reset else max(5, min(60, int(reset) - int(time.time())))
                print(f"    rate limited, sleeping {wait}s", flush=True)
                time.sleep(wait)
                last = (e.code, body, {})
                continue
            return e.code, body, {k.lower(): v for k, v in e.headers.items()}
        except Exception as e:  # noqa: BLE001 - network flake, retry
            last = (0, str(e).encode(), {})
            time.sleep(2 + attempt * 3)
    return last


def log_error(msg: str) -> None:
    ERRLOG.parent.mkdir(parents=True, exist_ok=True)
    with ERRLOG.open("a", encoding="utf-8") as f:
        f.write(f"{NOW}\t{msg}\n")


def slugify(text: str) -> str:
    text = text.strip().lower().replace(" ", "-")
    return re.sub(r"[^a-z0-9._\-]+", "-", text).strip("-")


def yaml_scalar(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value).replace("\n", " ").strip()
    return json.dumps(s, ensure_ascii=False)


def front_matter(meta: dict) -> str:
    lines = ["---"]
    for k, v in meta.items():
        if v is None or v == [] or v == "":
            continue
        if isinstance(v, list):
            lines.append(f"{k}:")
            for item in v:
                lines.append(f"  - {yaml_scalar(item)}")
        else:
            lines.append(f"{k}: {yaml_scalar(v)}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def write_if_missing(path: Path, text: str, force: bool) -> bool:
    if path.exists() and not force and path.stat().st_size > 200:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


# --------------------------------------------------------------------------- #
# fetchers
# --------------------------------------------------------------------------- #
def fetch_github(slug: str, category: str, extras: list[str], force: bool) -> str:
    slug = slug.strip()
    if slug.startswith("http"):
        slug = urllib.parse.urlparse(slug).path.strip("/")
    if slug.count("/") != 1:
        return "bad-slug"
    owner, name = slug.split("/")
    outdir = SOURCES / category / f"{owner}__{name}"
    readme_path = outdir / "README.md"
    meta_path = outdir / "source.json"
    if readme_path.exists() and meta_path.exists() and not force:
        return "cached"

    status, raw, _ = http(f"https://api.github.com/repos/{slug}")
    if status == 404:
        log_error(f"github 404 {category}/{slug}")
        return "404"
    if status != 200:
        log_error(f"github {status} {category}/{slug}")
        return f"http-{status}"
    repo = json.loads(raw)
    license_info = (repo.get("license") or {}).get("spdx_id") or "NOASSERTION"

    # README (raw markdown)
    readme = ""
    st, rbody, _ = http(
        f"https://api.github.com/repos/{slug}/readme",
        accept="application/vnd.github.raw",
    )
    if st == 200:
        readme = rbody.decode("utf-8", "replace")
    else:
        log_error(f"github-readme {st} {category}/{slug}")

    meta = {
        "id": f"github:{slug}",
        "kind": "github",
        "category": category,
        "repo": slug,
        "url": f"https://github.com/{slug}",
        "description": (repo.get("description") or "").strip(),
        "stars": repo.get("stargazers_count", 0),
        "forks": repo.get("forks_count", 0),
        "language": repo.get("language") or "",
        "license": license_info,
        "topics": (repo.get("topics") or [])[:15],
        "archived": bool(repo.get("archived")),
        "pushed_at": repo.get("pushed_at"),
        "default_branch": repo.get("default_branch"),
        "fetched_at": NOW,
    }
    outdir.mkdir(parents=True, exist_ok=True)
    meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    body = front_matter(meta) + (readme or "_README not available_\n")
    write_if_missing(readme_path, body, force=True)

    for extra in extras:
        extra = extra.strip().lstrip("/")
        if not extra:
            continue
        target = outdir / "files" / extra.replace("/", "__")
        if target.exists() and not force:
            continue
        st, ebody, _ = http(
            f"https://api.github.com/repos/{slug}/contents/{urllib.parse.quote(extra)}",
            accept="application/vnd.github.raw",
        )
        if st == 200:
            target.parent.mkdir(parents=True, exist_ok=True)
            text = ebody.decode("utf-8", "replace")
            hdr = front_matter(
                {
                    "id": f"github-file:{slug}:{extra}",
                    "kind": "github-file",
                    "category": category,
                    "repo": slug,
                    "path": extra,
                    "url": f"https://github.com/{slug}/blob/{repo.get('default_branch')}/{extra}",
                    "fetched_at": NOW,
                }
            )
            target.write_text(hdr + text, encoding="utf-8")
        else:
            log_error(f"github-file {st} {category}/{slug}/{extra}")
    return "ok"


def fetch_pypi(pkg: str, category: str, force: bool) -> str:
    out = SOURCES / category / f"pypi__{slugify(pkg)}.md"
    if out.exists() and not force and out.stat().st_size > 200:
        return "cached"
    st, raw, _ = http(f"https://pypi.org/pypi/{urllib.parse.quote(pkg)}/json")
    if st != 200:
        log_error(f"pypi {st} {category}/{pkg}")
        return f"http-{st}"
    data = json.loads(raw)
    info = data["info"]
    releases = data.get("releases") or {}
    latest_files = []
    for f in releases.get(info["version"], [])[:12]:
        latest_files.append(f"{f.get('filename')} ({round((f.get('size') or 0)/1048576, 1)} MB)")
    meta = {
        "id": f"pypi:{pkg}",
        "kind": "pypi",
        "category": category,
        "package": info["name"],
        "version": info["version"],
        "url": info.get("project_url") or f"https://pypi.org/project/{pkg}/",
        "home_page": info.get("home_page") or "",
        "license": (info.get("license") or "").split("\n")[0][:80],
        "requires_python": info.get("requires_python"),
        "summary": (info.get("summary") or "").strip(),
        "fetched_at": NOW,
    }
    body = (
        front_matter(meta)
        + f"# {info['name']} {info['version']}\n\n"
        + f"**Summary:** {info.get('summary') or ''}\n\n"
        + f"**Install:** `pip install {info['name']}`\n\n"
        + f"**Python:** {info.get('requires_python') or 'any'}\n\n"
        + "## Distribution artifacts\n\n"
        + "\n".join(f"- {f}" for f in latest_files)
        + "\n\n## Description\n\n"
        + (info.get("description") or "")[:60000]
        + "\n"
    )
    return "ok" if write_if_missing(out, body, force=True) else "cached"


def fetch_npm(pkg: str, category: str, force: bool) -> str:
    out = SOURCES / category / f"npm__{slugify(pkg)}.md"
    if out.exists() and not force and out.stat().st_size > 200:
        return "cached"
    url = f"https://registry.npmjs.org/{urllib.parse.quote(pkg, safe='@')}"
    st, raw, _ = http(url)
    if st != 200:
        log_error(f"npm {st} {category}/{pkg}")
        return f"http-{st}"
    data = json.loads(raw)
    latest_tag = (data.get("dist-tags") or {}).get("latest", "")
    v = (data.get("versions") or {}).get(latest_tag, {})
    meta = {
        "id": f"npm:{pkg}",
        "kind": "npm",
        "category": category,
        "package": data.get("name", pkg),
        "version": latest_tag,
        "url": f"https://www.npmjs.com/package/{pkg}",
        "homepage": v.get("homepage") or "",
        "license": v.get("license") if isinstance(v.get("license"), str) else "",
        "summary": (data.get("description") or "").strip()[:400],
        "fetched_at": NOW,
    }
    deps = v.get("dependencies") or {}
    peer = v.get("peerDependencies") or {}
    body = (
        front_matter(meta)
        + f"# npm: {data.get('name', pkg)}@{latest_tag}\n\n"
        + f"**Description:** {data.get('description') or ''}\n\n"
        + f"**Homepage:** {v.get('homepage') or ''}\n\n"
        + f"**License:** {meta['license'] or 'see package'}\n\n"
        + "## Dependencies\n\n"
        + ("\n".join(f"- {k}@{val}" for k, val in sorted(deps.items())[:60]) or "- none")
        + "\n\n## Peer dependencies\n\n"
        + ("\n".join(f"- {k}@{val}" for k, val in sorted(peer.items())[:30]) or "- none")
        + "\n\n## README (from registry)\n\n"
        + (data.get("readme") or "")[:60000]
        + "\n"
    )
    return "ok" if write_if_missing(out, body, force=True) else "cached"


# --------------------------------------------------------------------------- #
# discovery
# --------------------------------------------------------------------------- #
DISCOVERY_QUERIES = [
    "windows ui automation agent",
    "computer use agent desktop",
    "gui agent screenshot grounding",
    "windows automation llm",
    "mcp server windows",
    "model context protocol servers",
    "local llm desktop app",
    "llm orchestration framework",
    "voice assistant local whisper",
    "speech to speech llm",
    "wake word detection",
    "text to speech local neural",
    "llm quantization gguf",
    "hardware detection gpu vram",
    "electron ai assistant",
    "agent memory long term",
    "agent sandbox code execution",
    "coding agent repository map",
    "browser automation agent",
    "telegram bot agent llm",
    "google calendar mcp",
    "observability llm tracing",
    "llm evaluation tool calling",
    "small language models on device",
    "onnx runtime node native",
    "windows accessibility tree automation",
    "screen ocr document understanding",
    "youtube transcript summarization",
    "durable workflow agent long running",
    "policy engine permission agent",
]

DISCOVERY_QUERIES += [
    "llm inference optimization cpu",
    "speculative decoding llm",
    "constrained decoding json grammar",
    "gguf quantization imatrix",
    "onnxruntime directml gpu",
    "openvino npu llm",
    "intel ipex llm",
    "tiny language model edge device",
    "prompt compression context",
    "kv cache quantization",
    "windows process priority performance",
    "windows power efficiency api",
    "office automation python excel",
    "powerpoint automation",
    "obs websocket automation",
    "video editing automation ffmpeg",
    "windows registry powershell automation",
    "mcp excel office server",
    "local rag sqlite vector search",
    "llm observability local tracing",
    "speculative decoding draft model",
    "gpu offload layers llama",
    "audio echo cancellation windows",
    "screen recording windows api",
    "windows ui automation accessibility",
]


def discover(force: bool, per_query: int = 12) -> None:
    DISCOVERY.mkdir(parents=True, exist_ok=True)
    for q in DISCOVERY_QUERIES:
        out = DISCOVERY / f"{slugify(q)}.md"
        if out.exists() and not force:
            print(f"  cached  {q}", flush=True)
            continue
        url = (
            "https://api.github.com/search/repositories?q="
            + urllib.parse.quote(q)
            + f"&sort=stars&order=desc&per_page={per_query}"
        )
        st, raw, _ = http(url)
        if st != 200:
            log_error(f"discover {st} {q}")
            print(f"  fail    {q} ({st})", flush=True)
            continue
        items = json.loads(raw).get("items", [])
        lines = [
            f"# Discovery: `{q}`",
            "",
            f"_GitHub search, sorted by stars, captured {NOW}. Candidates for later mining._",
            "",
            "| Stars | Repo | Language | License | Updated | Description |",
            "| --- | --- | --- | --- | --- | --- |",
        ]
        for it in items:
            desc = (it.get("description") or "").replace("|", "\\|")[:220]
            lic = ((it.get("license") or {}) or {}).get("spdx_id") or "-"
            lines.append(
                f"| {it['stargazers_count']:,} | [{it['full_name']}]({it['html_url']}) | "
                f"{it.get('language') or '-'} | {lic} | {(it.get('pushed_at') or '')[:10]} | {desc} |"
            )
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"  ok      {q} -> {len(items)} repos", flush=True)
        time.sleep(1.2)


# --------------------------------------------------------------------------- #
# index
# --------------------------------------------------------------------------- #
def load_all_meta() -> list[dict]:
    metas: list[dict] = []
    for p in sorted(SOURCES.rglob("source.json")):
        try:
            meta = json.loads(p.read_text(encoding="utf-8"))
            readme = p.parent / "README.md"
            meta["_path"] = str(readme.relative_to(ROOT)) if readme.exists() else str(p.relative_to(ROOT))
            extras = sorted((p.parent / "files").glob("*")) if (p.parent / "files").exists() else []
            if extras:
                meta["_extras"] = len(extras)
            metas.append(meta)
        except Exception:  # noqa: BLE001
            pass
    for p in sorted(SOURCES.glob("*/*.md")):
        if p.name.startswith("_"):
            continue
        head = p.read_text(encoding="utf-8", errors="replace")[:1500]
        meta = parse_front_matter(head)
        if meta:
            meta["_path"] = str(p.relative_to(ROOT))
            metas.append(meta)
    return metas


def parse_front_matter(text: str) -> dict:
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end == -1:
        return {}
    meta: dict = {}
    key = None
    for line in text[3:end].strip("\n").splitlines():
        if line.startswith("  - ") and key:
            meta.setdefault(key, []).append(line[4:].strip())
        elif ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            meta[key] = json.loads(val) if val.startswith('"') and val.endswith('"') else val
            if not val:
                meta[key] = []
            elif isinstance(meta[key], list):
                pass
    return meta


def build_index() -> None:
    metas = load_all_meta()
    by_cat: dict[str, list[dict]] = {}
    for m in metas:
        by_cat.setdefault(m.get("category", "uncategorized"), []).append(m)

    def sort_key(m: dict):
        return (-int(m.get("stars") or 0), str(m.get("id") or m.get("package") or ""))

    gh = [m for m in metas if m.get("kind") == "github"]
    lines = [
        "# ИНДЕКС ИСТОЧНИКОВ — ZShelper",
        "",
        f"Сгенерировано: `{NOW}` · всего записей: **{len(metas)}** · GitHub-репозиториев: **{len(gh)}**",
        "",
        "Полные тексты лежат в `research/sources/<категория>/`. "
        "Машиночитаемый реестр — `research/SOURCES.json`.",
        "",
        "## Категории",
        "",
        "| Категория | Записей | Звёзд (сумма) |",
        "| --- | --- | --- |",
    ]
    for cat in sorted(by_cat):
        tot = sum(int(m.get("stars") or 0) for m in by_cat[cat])
        lines.append(f"| [`{cat}`](#{cat}) | {len(by_cat[cat])} | {tot:,} |")

    for cat in sorted(by_cat):
        lines += ["", f"## {cat}", ""]
        items = sorted(by_cat[cat], key=sort_key)
        lines.append("| Источник | ★ | Лицензия | Апдейт | Описание | Файл |")
        lines.append("| --- | --- | --- | --- | --- | --- |")
        for m in items:
            if m.get("kind") == "github":
                name = f"[{m.get('repo')}]({m.get('url')})"
                stars = f"{int(m.get('stars') or 0):,}"
                upd = (m.get("pushed_at") or "")[:10]
                desc = (m.get("description") or "").replace("|", "\\|")[:180]
                path = m.get("_path") or ""
                if m.get("_extras"):
                    path += f" (+{m['_extras']} доп. файлов)"
            else:
                name = f"[{m.get('kind')}: {m.get('package')}]({m.get('url')})"
                stars = "-"
                upd = ""
                desc = (m.get("summary") or "").replace("|", "\\|")[:180]
                path = m.get("_path") or ""
            lines.append(
                f"| {name} | {stars} | {m.get('license') or '-'} | {upd} | {desc} | `{path}` |"
            )

    (RESEARCH / "INDEX.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (RESEARCH / "SOURCES.json").write_text(
        json.dumps(sorted(metas, key=lambda m: str(m.get("id"))), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"index: {len(metas)} sources across {len(by_cat)} categories")


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("action", choices=["fetch", "discover", "index", "all", "pending"])
    ap.add_argument("--category", default=None)
    ap.add_argument("--no-github", action="store_true", help="skip GitHub (api down / offline)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    extras = manifest.get("extras", {})

    if args.action in ("fetch", "all"):
        stats: dict[str, int] = {}
        for category, spec in manifest["categories"].items():
            if args.category and category != args.category:
                continue
            print(f"[{category}]", flush=True)
            for kind in ("github", "pypi", "npm"):
                if kind == "github" and args.no_github:
                    continue
                for item in spec.get(kind, []):
                    if kind == "github":
                        res = fetch_github(item, category, extras.get(item, []), args.force)
                    elif kind == "pypi":
                        res = fetch_pypi(item, category, args.force)
                    else:
                        res = fetch_npm(item, category, args.force)
                    stats[res] = stats.get(res, 0) + 1
            time.sleep(0.4)
        print("fetch stats:", json.dumps(stats, sort_keys=True))
        print("rate-limit remaining:", REMAINING["github"])

    if args.action in ("discover", "all"):
        discover(args.force)

    if args.action == "pending":
        missing = []
        for category, spec in manifest["categories"].items():
            for item in spec.get("github", []):
                owner, _, name = item.partition("/")
                if not (SOURCES / category / f"{owner}__{name}" / "README.md").exists():
                    missing.append(f"github\t{category}\t{item}")
            for item in spec.get("pypi", []):
                if not (SOURCES / category / f"pypi__{slugify(item)}.md").exists():
                    missing.append(f"pypi\t{category}\t{item}")
            for item in spec.get("npm", []):
                if not (SOURCES / category / f"npm__{slugify(item)}.md").exists():
                    missing.append(f"npm\t{category}\t{item}")
        out = RESEARCH / "PENDING.md"
        lines = ["# Недокачанное", "", f"Проверено: {NOW}. Всего: {len(missing)}.", "",
                 "Дозакачать: `GITHUB_TOKEN=$(gh auth token) python3 tools/collect_sources.py fetch`",
                 "(или `--no-github`, если GitHub недоступен).", "",
                 "| kind | категория | идентификатор |", "| --- | --- | --- |"]
        lines += [f"| {m.split(chr(9))[0]} | {m.split(chr(9))[1]} | `{m.split(chr(9))[2]}` |" for m in missing]
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"pending: {len(missing)} -> {out.relative_to(ROOT)}")
        return 0

    if args.action in ("index", "all"):
        build_index()
    return 0


if __name__ == "__main__":
    sys.exit(main())
