#!/usr/bin/env python3
"""
Build docs/DEPENDENCIES.md from the vault.

The vault already holds authoritative metadata (version, license, description) for every
npm/PyPI package and GitHub repo we collected. This script turns it into a **license-audited
dependency proposal** for ZShelper v1, so we choose libraries before writing code — and know
exactly what we are allowed to ship.

Usage: python3 tools/deps_report.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "research" / "sources"
OUT = ROOT / "docs" / "DEPENDENCIES.md"

PERMISSIVE = {"MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense",
              "MPL-2.0", "CC0-1.0", "Python-2.0", "PSF-2.0", "BlueOak-1.0.0", "CC-BY-4.0"}
CAUTION = {"LGPL-3.0", "LGPL-2.1", "GPL-3.0", "AGPL-3.0", "GPL-2.0", "NOASSERTION", "", "Unknown"}

# role -> [(ecosystem, name, why)]
STACK: dict[str, list[tuple[str, str, str]]] = {
    "Оболочка и сборка": [
        ("npm", "electron", "рантайм десктопа"),
        ("npm", "electron-vite", "dev/сборка main+preload+renderer"),
        ("npm", "electron-builder", "установщик NSIS/portable, автообновление"),
        ("npm", "electron-updater", "обновления через GitHub Releases"),
        ("npm", "typescript", "строгая типизация"),
        ("npm", "vite", "бандлер"),
        ("npm", "@vitejs/plugin-react", "React в vite"),
        ("npm", "esbuild", "быстрые сборки скриптов"),
        ("npm", "tsup", "сборка библиотек/воркеров"),
        ("npm", "concurrently", "параллельные dev-процессы"),
        ("npm", "cross-env", "кроссплатформенные env (Windows!)"),
        ("npm", "rimraf", "чистка артефактов"),
        ("npm", "husky", "git-хуки"),
        ("npm", "lint-staged", "линт изменённых файлов"),
        ("npm", "prettier", "форматирование"),
        ("npm", "eslint", "линт"),
        ("npm", "@biomejs/biome", "быстрый линт/формат (альтернатива)"),
    ],
    "UI": [
        ("npm", "react", "интерфейс"),
        ("npm", "react-dom", "рендер"),
        ("npm", "tailwindcss", "стили"),
        ("npm", "tailwind-merge", "мерж классов"),
        ("npm", "clsx", "условные классы"),
        ("npm", "class-variance-authority", "варианты компонентов"),
        ("npm", "@radix-ui/react-dialog", "доступные примитивы"),
        ("npm", "@radix-ui/react-tooltip", "подсказки"),
        ("npm", "@radix-ui/react-dropdown-menu", "меню"),
        ("npm", "@radix-ui/react-tabs", "табы"),
        ("npm", "@radix-ui/react-popover", "поповеры"),
        ("npm", "@radix-ui/react-scroll-area", "скролл"),
        ("npm", "@radix-ui/react-switch", "переключатели"),
        ("npm", "@radix-ui/react-slider", "слайдеры"),
        ("npm", "@radix-ui/react-progress", "прогресс"),
        ("npm", "@radix-ui/react-toast", "тосты"),
        ("npm", "@radix-ui/react-separator", "разделители"),
        ("npm", "@radix-ui/react-accordion", "аккордеоны"),
        ("npm", "@radix-ui/react-select", "селекты"),
        ("npm", "@radix-ui/react-avatar", "аватары"),
        ("npm", "motion", "анимации"),
        ("npm", "lucide-react", "иконки"),
        ("npm", "zustand", "состояние"),
        ("npm", "@tanstack/react-query", "серверное состояние/кэш"),
        ("npm", "@tanstack/react-virtual", "виртуализация длинных логов"),
        ("npm", "@tanstack/react-table", "таблицы"),
        ("npm", "recharts", "графики метрик"),
        ("npm", "cmdk", "палитра команд"),
        ("npm", "sonner", "уведомления"),
        ("npm", "react-markdown", "рендер отчётов"),
        ("npm", "remark-gfm", "GFM в markdown"),
        ("npm", "rehype-highlight", "подсветка кода"),
        ("npm", "dompurify", "XSS-защита markdown/HTML"),
        ("npm", "fuse.js", "fuzzy-поиск по командам/файлам"),
        ("npm", "i18next", "локализация"),
        ("npm", "react-i18next", "локализация React"),
        ("npm", "date-fns", "даты"),
        ("npm", "react-hook-form", "формы настроек"),
        ("npm", "@hookform/resolvers", "формы + zod"),
        ("npm", "monaco-editor", "просмотр кода и diff"),
        ("npm", "xterm", "встроенный терминал агента"),
        ("npm", "@xterm/addon-fit", "вписывание терминала"),
    ],
    "Ядро и данные": [
        ("npm", "zod", "схемы контрактов и инструментов"),
        ("npm", "better-sqlite3", "основная БД (синхронная, быстрая)"),
        ("npm", "sqlite-vec", "векторный поиск в том же файле"),
        ("npm", "drizzle-orm", "миграции/типизированные запросы"),
        ("npm", "kysely", "альтернатива query builder"),
        ("npm", "pino", "структурные логи"),
        ("npm", "pino-pretty", "читаемые логи в dev"),
        ("npm", "electron-log", "логи в файлы из main"),
        ("npm", "electron-store", "настройки (не секреты!)"),
        ("npm", "p-queue", "конкурентность задач"),
        ("npm", "p-retry", "повторы с бэкоффом"),
        ("npm", "bree", "планировщик в процессе"),
        ("npm", "croner", "cron-расписания"),
        ("npm", "execa", "запуск процессов"),
        ("npm", "tree-kill", "убийство дерева процессов (Windows)"),
        ("npm", "ps-list", "список процессов"),
        ("npm", "pidusage", "ресурсы процессов"),
        ("npm", "chokidar", "наблюдение за файлами"),
        ("npm", "fs-extra", "ФС-утилиты"),
        ("npm", "fast-glob", "поиск файлов"),
        ("npm", "archiver", "архивы"),
        ("npm", "adm-zip", "zip"),
        ("npm", "yauzl", "чтение zip"),
        ("npm", "tar", "tar-архивы"),
        ("npm", "undici", "HTTP-клиент"),
        ("npm", "ws", "websocket"),
    ],
    "Модели и инференс": [
        ("npm", "node-llama-cpp", "лёгкий путь к llama.cpp в воркере"),
        ("npm", "onnxruntime-node", "ONNX для ASR/OCR/embed/VAD"),
        ("npm", "@huggingface/transformers", "transformers.js (мелкие модели)"),
        ("npm", "@modelcontextprotocol/sdk", "MCP-клиент/сервер"),
        ("npm", "sherpa-onnx-node", "ASR/TTS/KWS в одном рантайме"),
        ("npm", "piscina", "пул воркеров для CPU-задач"),
        ("npm", "@dqbd/tiktoken", "подсчёт токенов"),
        ("npm", "gpt-tokenizer", "токенайзер без нативных зависимостей"),
        ("npm", "sharp", "изображения/скриншоты"),
        ("npm", "tesseract.js", "OCR-fallback"),
        ("npm", "ffmpeg-static", "ffmpeg без установки"),
        ("npm", "fluent-ffmpeg", "удобный ffmpeg API"),
    ],
    "Windows: руки и глаза": [
        ("npm", "uiohook-napi", "глобальные хоткеи"),
        ("npm", "@nut-tree-fork/nut-js", "ввод/скриншоты (прототип)"),
        ("npm", "node-window-manager", "окна Windows"),
        ("npm", "active-win", "активное окно"),
        ("npm", "screenshot-desktop", "захват экрана"),
        ("npm", "clipboardy", "буфер обмена"),
        ("npm", "node-pty", "терминал (ConPTY)"),
        ("npm", "koffi", "FFI для Win32 (альтернатива нативному модулю)"),
        ("npm", "regedit", "реестр"),
        ("npm", "systeminformation", "железо/ОС"),
        ("npm", "ps-list", "процессы"),
        ("npm", "officeparser", "текст из docx/pptx/xlsx/pdf"),
        ("npm", "exceljs", "Excel"),
        ("npm", "docx", "генерация Word"),
        ("npm", "pdf-lib", "PDF-манипуляции"),
        ("npm", "pdf-parse", "текст из PDF"),
        ("npm", "mammoth", "docx → html/markdown"),
        ("npm", "xlsx", "чтение/запись таблиц"),
    ],
    "Коннекторы": [
        ("npm", "grammy", "Telegram-бот"),
        ("npm", "telegraf", "альтернатива Telegram"),
        ("npm", "googleapis", "Google Calendar/Gmail/Drive"),
        ("npm", "google-auth-library", "OAuth для Google"),
        ("npm", "imapflow", "почта IMAP"),
        ("npm", "nodemailer", "SMTP/черновики"),
        ("npm", "mailparser", "разбор писем"),
        ("npm", "ical-generator", "ICS-события"),
        ("npm", "rss-parser", "RSS"),
        ("npm", "mqtt", "умный дом"),
        ("npm", "@slack/web-api", "Slack"),
        ("npm", "keytar", "секреты (или safeStorage)"),
        ("npm", "@napi-rs/keyring", "Credential Manager"),
    ],
    "Тесты и качество": [
        ("npm", "vitest", "юнит-тесты"),
        ("npm", "@testing-library/react", "тесты UI"),
        ("npm", "@testing-library/user-event", "события UI"),
        ("npm", "jsdom", "DOM в тестах"),
        ("npm", "playwright", "e2e (Electron)"),
        ("npm", "@playwright/test", "раннер e2e"),
        ("npm", "eslint", "линт"),
        ("npm", "@typescript-eslint/parser", "TS-линт"),
        ("npm", "@typescript-eslint/eslint-plugin", "правила TS"),
        ("npm", "dependency-cruiser", "архитектурные границы модулей"),
        ("npm", "@types/node", "типы Node"),
        ("npm", "tsx", "запуск TS без сборки"),
    ],
}


def load_vault() -> dict[tuple[str, str], dict]:
    idx: dict[tuple[str, str], dict] = {}
    for p in SOURCES.rglob("pypi__*.md"):
        meta = read_fm(p)
        if meta.get("package"):
            idx[("pypi", meta["package"].lower().replace("_", "-"))] = meta
    for p in SOURCES.rglob("npm__*.md"):
        meta = read_fm(p)
        if meta.get("package"):
            idx[("npm", meta["package"].lower())] = meta
    return idx


def read_fm(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")[:1200]
    except Exception:  # noqa: BLE001
        return {}
    m = re.search(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        return {}
    out: dict = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith(" "):
            k, _, v = line.partition(":")
            v = v.strip().strip('"')
            if v:
                out[k.strip()] = v
    return out


def normalize_lic(lic: str) -> str:
    lic = (lic or "").strip()
    aliases = {
        "mit license": "MIT", "the mit license": "MIT", "mit": "MIT",
        "apache 2.0": "Apache-2.0", "apache-2.0": "Apache-2.0", "apache license 2.0": "Apache-2.0",
        "apache license": "Apache-2.0", "apache": "Apache-2.0",
        "bsd 3-clause": "BSD-3-Clause", "bsd": "BSD-3-Clause", "bsd-3-clause": "BSD-3-Clause",
        "bsd-2-clause": "BSD-2-Clause", "isc": "ISC", "mpl-2.0": "MPL-2.0",
        "mit or apache-2.0": "MIT OR Apache-2.0", "blueoak-1.0.0": "BlueOak-1.0.0",
        "python software foundation license": "PSF-2.0", "psf-2.0": "PSF-2.0",
        "mozilla public license 2.0": "MPL-2.0", "lgpl-3.0": "LGPL-3.0", "gpl-3.0": "GPL-3.0",
        "agpl-3.0": "AGPL-3.0", "cc-by-4.0": "CC-BY-4.0", "unlicense": "Unlicense",
        "see license in license": "NOASSERTION", "": "не указана",
    }
    return aliases.get(lic.lower(), lic)


def lic_badge(lic: str) -> str:
    lic = normalize_lic(lic)
    if lic in CAUTION or not lic:
        return f"⚠️ `{lic or 'нет данных'}`"
    if lic in PERMISSIVE:
        return f"✅ `{lic}`"
    return f"❓ `{lic}`"


def main() -> None:
    vault = load_vault()
    lines = [
        "# Зависимости v1 — предложение и аудит лицензий",
        "",
        "_Сгенерировано из исследовательского vault (`python3 tools/deps_report.py`). "
        "Версии — последние на момент сбора источников; при старте кода фиксируем точные._",
        "",
        "Правило проекта: в бандл идут только **MIT / Apache-2.0 / BSD / ISC / MPL-2.0 / CC-BY-4.0**. "
        "GPL/AGPL — только отдельными процессами по желанию пользователя (и никогда не линкуются).",
        "",
    ]
    missing = []
    for layer, items in STACK.items():
        lines += [f"## {layer}", "", "| Пакет | Версия | Лицензия | Зачем |", "| --- | --- | --- | --- |"]
        seen = set()
        for eco, name, why in items:
            key = (eco, name.lower().replace("_", "-"))
            if key in seen:
                continue
            seen.add(key)
            meta = vault.get(key)
            if not meta:
                missing.append(f"{eco}:{name}")
                lines.append(f"| `{name}` | — | ❓ нет в vault | {why} |")
                continue
            lines.append(f"| `{meta.get('package', name)}` | {meta.get('version', '—')} | "
                         f"{lic_badge(meta.get('license', ''))} | {why} |")
        lines.append("")

    # global license stats over everything we collected
    all_lic: dict[str, int] = {}
    for meta in vault.values():
        lic = normalize_lic(meta.get("license") or "")
        all_lic[lic] = all_lic.get(lic, 0) + 1
    top = sorted(all_lic.items(), key=lambda kv: -kv[1])[:15]
    lines += ["## Лицензионная картина по всему vault (npm+PyPI)", "",
              "| Лицензия | Пакетов |", "| --- | --- |"]
    lines += [f"| {lic} | {n} |" for lic, n in top]
    lines += ["", f"Всего пакетов в vault: **{len(vault)}**. "
              f"Не найдено в vault (дозакачать): {len(missing)}.", ""]
    if missing:
        lines += ["## Не найдено в vault", ""] + [f"- `{m}`" for m in missing] + [""]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(STACK)} layers, {len(missing)} missing")


if __name__ == "__main__":
    main()
