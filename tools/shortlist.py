#!/usr/bin/env python3
"""
Build a capability-oriented shortlist out of the mined inventories.

`research/discovery/*.json` holds ~2000 repos with stars/description. This script
bucketes them into the capability domains a desktop voice assistant actually
needs (files, shell, GUI, browser, media, comms, memory, dev, system) and writes
one skimmable table per domain, with a Windows-support hint baked in.

This is the file an agent should read before deciding "which MCP server do we
integrate for task X". Full texts of individual servers can then be pulled on
demand with tools/collect_sources.py.

Usage: python3 tools/shortlist.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DISCOVERY = ROOT / "research" / "discovery"
OUT = DISCOVERY / "shortlist.md"

DOMAINS: dict[str, list[str]] = {
    "Файлы и документы": [
        "file", "filesystem", "directory", "disk", "pdf", "docx", "excel", "spreadsheet",
        "markdown", "zip", "archive", "drive", "onedrive", "document",
    ],
    "Терминал, код и dev-среда": [
        "shell", "terminal", "powershell", "bash", "cli", "command line", "ssh", "git",
        "github", "gitlab", "code", "ide", "lsp", "docker", "kubernetes", "database",
        "sql", "postgres", "sqlite", "test", "package", "npm", "python",
    ],
    "Рабочий стол Windows и GUI": [
        "windows", "desktop", "gui", "mouse", "keyboard", "screen", "screenshot",
        "uiautomation", "accessibility", "computer use", "clipboard", "window manager",
        "autohotkey", "powershell", "office", "outlook", "excel", "word", "powerpoint",
        "explorer", "taskbar", "vscode", "capcut", "premiere", "photoshop",
    ],
    "Браузер и веб": [
        "browser", "playwright", "puppeteer", "selenium", "chrome", "firefox", "web page",
        "scrape", "crawl", "web search", "search engine", "fetch", "http",
    ],
    "Медиа, видео и аудио": [
        "video", "ffmpeg", "youtube", "audio", "transcri", "subtitle", "speech", "tts",
        "whisper", "ocr", "image", "photo", "music", "spotify", "podcast", "stream",
    ],
    "Коммуникации и календарь": [
        "telegram", "slack", "discord", "whatsapp", "email", "gmail", "imap", "smtp",
        "calendar", "meeting", "sms", "notion", "jira", "linear", "trello", "asana",
    ],
    "Память, знания, поиск": [
        "memory", "knowledge", "rag", "vector", "embedding", "obsidian", "notes",
        "mem0", "graph", " semantic", "recall", "wiki",
    ],
    "Система, железо, сеть": [
        "system", "process", "hardware", "monitor", "cpu", "gpu", "vram", "network",
        "backup", "service", "registry", "sensor", "battery", "temperature", "ssh",
    ],
    "Оркестрация агентов и MCP-инфраструктура": [
        "gateway", "aggregat", "proxy", "router", "orchestrat", "workflow", "registry",
        "sandbox", "eval", "observab", "skill", "subagent", "server manager",
    ],
}

WIN_RE = re.compile(r"🪟|windows|win32|powershell", re.I)


def load() -> dict[str, dict]:
    repos: dict[str, dict] = {}
    for p in sorted(DISCOVERY.glob("*.json")):
        if p.name.startswith("_"):
            continue
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            continue
        for e in data.get("entries", []):
            slug = e.get("repo")
            if not slug:
                continue
            cur = repos.setdefault(slug, dict(e))
            cur.setdefault("lists", []).append(data.get("name", p.stem))
    return repos


def main() -> None:
    repos = load()
    buckets: dict[str, list[dict]] = {d: [] for d in DOMAINS}
    for slug, e in repos.items():
        if e.get("stars", 0) is None or e.get("stars", 0) < 0:
            continue
        hay = f"{e.get('name','')} {e.get('description','')} {e.get('gh_description','')} " \
              f"{' '.join(e.get('topics') or [])} {slug}".lower()
        for domain, kws in DOMAINS.items():
            if any(k.lower() in hay for k in kws):
                buckets[domain].append(e)

    lines = [
        "# Шортлист MCP-серверов и агентских инструментов по доменам",
        "",
        f"Собрано из `research/discovery/*.json` ({len(repos)} уникальных репозиториев). "
        "Фильтр по ключевым словам в названии/описании/топиках, сортировка по звёздам.",
        "",
        "Колонка `W` = в описании заявлена поддержка Windows (🪟) либо встречается "
        "win32/powershell. Отсутствие флага не значит «не работает» — это лишь сигнал.",
        "",
        "> Правило отбора в прод: лицензия MIT/Apache-2.0, апдейт за последние ~6 месяцев, "
        "не архивный, и есть понятный путь локального запуска (npx/uvx/бинарь) без облака.",
        "",
    ]
    for domain, items in buckets.items():
        items.sort(key=lambda e: -int(e.get("stars") or 0))
        lines += [f"## {domain} ({len(items)})", "",
                  "| ★ | Репозиторий | Лицензия | Апдейт | W | Описание | Списки |",
                  "| --- | --- | --- | --- | --- | --- | --- |"]
        for e in items[:45]:
            desc = (e.get("description") or e.get("gh_description") or "").replace("|", "\\|")
            desc = re.sub(r"[\U0001F000-\U0001FAFF\u2600-\u27BF]", "", desc)[:150]
            w = "✅" if WIN_RE.search(f"{e.get('description','')} {e.get('gh_description','')} {e.get('topics')}") else ""
            arch = " ⚠️" if e.get("archived") else ""
            lines.append(
                f"| {int(e.get('stars') or 0):,} | [{e['repo']}]({e.get('url')}){arch} | "
                f"{e.get('license') or '-'} | {e.get('pushed_at') or ''} | {w} | {desc.strip()} | "
                f"{', '.join(sorted(set(e.get('lists') or [])))} |"
            )
        lines.append("")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: " + ", ".join(f"{k}={len(v)}" for k, v in buckets.items()))


if __name__ == "__main__":
    main()
