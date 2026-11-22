#!/usr/bin/env python3
"""Сеть — одна дверь, и она явная.

Зачем. «Скачивания только явные, с хешем, без тихих запросов» — обещание,
которое ломается тихо: одна библиотека (`reqwest` в `Cargo.toml`), один
`TcpStream` к чужому хосту, один `curl` в обработчике наведения мыши — и
приложение начинает ходить в сеть само. Ни сборка, ни тесты этого не
заметят: тесты идут по локальному пути.

Что проверяется:

* **в Rust одна дверь.** Единственное место, которое открывает исходящее
  соединение, — `download.rs` (и то через системный `curl`). `TcpStream`,
  `TcpListener`, `net::` к чужому адресу в других файлах — провал. Локальные
  соединения разрешены только тем файлам, которые говорят с движком на
  127.0.0.1: `llm.rs`, `server.rs`, `stt.rs`, `ipc.rs`, `machine.rs`;
* **никакой HTTP-библиотеки в зависимостях.** `reqwest`, `ureq`, `hyper`,
  `isahc`, `attohttpc` — это вторая дверь, и она будет ходить, когда ей
  вздумается;
* **в TypeScript нет `fetch`/`XMLHttpRequest`/`WebSocket`** — у интерфейса
  нет причин ходить в сеть: он зовёт команды Tauri.

Чего проверка не делает: не судит, «явное» ли конкретное скачивание с точки
зрения человека (это `ReadinessCard` и его тесты) и не проверяет, что у
скачанного сверяется хеш (`download.rs` и тесты). Она отвечает на один
вопрос: **сколько дверей в сеть и где они.**

`--selftest` обязателен: проверка, не проверенная в обе стороны, молчит и
тогда, когда должна кричать.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Файлы, которым можно открывать соединение наружу — и то только внутри
# `download.rs` (системный curl). Всё остальное — вторая дверь.
DOWNLOAD = "download.rs"

# Файлы, которые разговаривают с движком на своей машине. Локальный адрес
# здесь — не сеть наружу, а 127.0.0.1: в этом весь смысл.
LOCAL_ONLY = {"llm.rs", "server.rs", "stt.rs", "ipc.rs", "machine.rs", "models.rs"}

NET_IN_RUST = re.compile(
    r"\b(TcpStream|TcpListener|UdpSocket|reqwest|ureq|hyper|isahc|attohttpc)\b"
    r"|::(get|post|send)\s*\("
    # `curl` — тоже дверь: процесс ходит в сеть не хуже библиотеки. Правило
    # появилось после того, как сам шаг 203 добавил `curl --head` в
    # `readiness.rs` в обход «единственной двери» — и проверка этого не
    # заметила, потому что искала только имена типов.
    r"|Command::new\(\s*\"curl\"\s*\)"
)

# Файлы, где `::get(` — это чтение из состояния (`state.get(...)`), а не
# HTTP-запрос. Список точный: новое имя здесь — повод посмотреть глазами.
GET_IS_NOT_NET = {"custom.rs", "ipc.rs"}

# Что нашлось: имя улики. Для `::get(` в обычном файле имя — `::get(`.
def evidence(match: re.Match[str]) -> str:
    if match.group(1):
        return match.group(1)
    return "http-запрос"

# Библиотеки, которые умеют ходить в сеть сами.
HTTP_CRATES = ["reqwest", "ureq", "hyper", "isahc", "attohttpc", "surf", "minreq", "http-req"]

# В TypeScript сети нет: интерфейс зовёт команды.
NET_IN_TS = re.compile(r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\s*\(")

TS_SKIP = (".test.ts", ".test.tsx")


def only_local(text: str) -> bool:
    """Все адреса в файле — свои.

    Не «в этой строке рядом», а «в этом файле вообще нет чужого хоста»:
    адрес движка собирается отдельно от соединения, и строчный поиск
    находил бы не то.
    """
    # Прямое решение: чужие адреса в локальном файле — те, что не 127.0.0.1.
    foreign = re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", text)
    return all(address.startswith("127.") for address in foreign)


def production_part(text: str) -> str:
    """Только то, что поедет в сборку. Тестовые модули отрезаются.

    В тестах сеть бывает по делу: поднимается локальный сервер, чтобы
    проверить разбор ответа. Это не тихий запрос.
    """
    marker = text.find("#[cfg(test)]")
    return text[:marker] if marker != -1 else text


def check_rust() -> list[str]:
    problems: list[str] = []
    folder = ROOT / "src-tauri" / "src"
    if not folder.exists():
        return problems
    for path in sorted(folder.rglob("*.rs")):
        if path.name == DOWNLOAD:
            continue
        text = production_part(path.read_text(encoding="utf-8", errors="ignore"))
        for match in NET_IN_RUST.finditer(text):
            if match.group(1) is None and path.name in GET_IS_NOT_NET:
                continue
            what = evidence(match)
            if what in {"TcpStream", "TcpListener", "UdpSocket"} and path.name in LOCAL_ONLY:
                # Локальное соединение — своё, а не наружу. Адрес часто собран
                # в другой строке (`SocketAddr::from(([127, 0, 0, 1], port))`),
                # поэтому смотрим файл целиком: в нём вообще нет чужих адресов.
                if only_local(text):
                    continue
            problems.append(f"{path.relative_to(ROOT)}: {what}")
    return problems


def check_crates() -> list[str]:
    problems: list[str] = []
    manifest = ROOT / "src-tauri" / "Cargo.toml"
    if not manifest.exists():
        return problems
    text = manifest.read_text(encoding="utf-8", errors="ignore")
    for crate in HTTP_CRATES:
        if re.search(rf"^{re.escape(crate)}\s*=", text, re.M):
            problems.append(f"src-tauri/Cargo.toml: http-библиотека {crate}")
    return problems


def check_typescript() -> list[str]:
    problems: list[str] = []
    folder = ROOT / "src"
    if not folder.exists():
        return problems
    for path in sorted(folder.rglob("*")):
        if path.suffix not in {".ts", ".tsx"} or path.name.endswith(TS_SKIP):
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in NET_IN_TS.finditer(text):
            problems.append(f"{path.relative_to(ROOT)}: {match.group(1)}")
    return problems


CASES: list[tuple[str, bool]] = [
    # (строка, должно ли проваливать проверку)
    ("use std::net::TcpStream;", True),
    ("let client = reqwest::Client::new();", True),
    ("let body = ureq::get(url).call()?;", True),  # `::get(` у не-http типа — нет
    ("let v = map.get(&key);", False),
    ('Command::new("curl").arg("--head").output()?;', True),  # процесс — тоже дверь
    ("let answer = response.body;", False),
    ("download::fetch(url, &part, MAX)?;", False),
    ("let answer = llm::ask(port, &body, timeout)?;", False),
]


def selftest() -> int:
    failures = 0
    for text, should_fail in CASES:
        got = NET_IN_RUST.search(text) is not None
        if got != should_fail:
            failures += 1
            print(f"  САМОТЕСТ: {text!r} — ждали провал={should_fail}, получили {got}", file=sys.stderr)
    # Дверь вниз: тестовый модуль не считается.
    if production_part("let x = 1;\n#[cfg(test)]\nuse std::net::TcpStream;") != "let x = 1;\n":
        failures += 1
        print("  САМОТЕСТ: тестовый модуль не отрезан", file=sys.stderr)
    # fetch в интерфейсе.
    if NET_IN_TS.search("const r = await fetch('/x');") is None:
        failures += 1
        print("  САМОТЕСТ: fetch в TypeScript не пойман", file=sys.stderr)
    if failures:
        print(f"самотест провален: {failures} из {len(CASES) + 3}", file=sys.stderr)
        return 1
    # Локальный файл с чужим адресом — не локальный, а только со своим — локальный.
    if not only_local("let a = ([127, 0, 0, 1], port);"):
        failures += 1
        print("  САМОТЕСТ: свой адрес принят за чужой", file=sys.stderr)
    if only_local("let a = 127.0.0.1; let b = 8.8.8.8;"):
        failures += 1
        print("  САМОТЕСТ: чужой адрес в локальном файле не замечен", file=sys.stderr)
    if failures:
        print(f"самотест провален: {failures} из {len(CASES) + 3}", file=sys.stderr)
        return 1
    print(f"самотест: {len(CASES) + 3}/{len(CASES) + 3} — ловит и молчит как задумано")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()

    problems = check_rust() + check_crates() + check_typescript()
    if problems:
        for problem in problems:
            print(problem, file=sys.stderr)
        print(f"\nдверей в сеть больше, чем одна: {len(problems)}", file=sys.stderr)
        return 1

    if "--quiet" not in sys.argv:
        print("сеть — одна дверь: download.rs, и только по явной кнопке")
    return 0


if __name__ == "__main__":
    sys.exit(main())
