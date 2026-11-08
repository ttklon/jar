#!/usr/bin/env python3
"""
Публикует файл как отдельную проверку (check run) в GitHub Actions.

Зачем: логи джоб и артефакты не всегда доступны (закрытая сеть, сбой хранилища
логов, песочница разработчика), а check run с полем `output.text` читается всегда
и вмещает до 65 535 символов. Через него удобно отдавать наружу то, что нужно
применить руками: дифф `cargo fmt`, список упавших тестов, вывод линтера.

Usage (в CI):
    python3 scripts/ci_check_report.py --name rustfmt-diff \\
        --title "rustfmt" --file fmt.diff

Требует переменные окружения GitHub Actions: GITHUB_TOKEN, GITHUB_SHA,
GITHUB_REPOSITORY, GITHUB_API_URL (опционально).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request

LIMIT = 65_000


def post_check(name: str, title: str, text: str) -> int:
    token = os.environ.get("GITHUB_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY")
    sha = os.environ.get("GITHUB_SHA")
    api = os.environ.get("GITHUB_API_URL", "https://api.github.com")

    if not (token and repo and sha):
        print("ci_check_report: нет GITHUB_TOKEN/REPOSITORY/SHA — работаем вне CI, пропускаю")
        return 0

    body = {
        "name": name,
        "head_sha": sha,
        "status": "completed",
        "conclusion": "neutral",
        "output": {
            "title": title,
            "summary": f"{title}: {len(text)} символов",
            "text": text[:LIMIT],
        },
    }

    request = urllib.request.Request(
        f"{api}/repos/{repo}/check-runs",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        print(f"ci_check_report: проверка «{name}» создана (id {payload.get('id')})")
        return 0
    except Exception as error:  # сеть/права — не повод валить сборку
        print(f"ci_check_report: не удалось создать проверку: {error}")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--file", required=True)
    args = parser.parse_args()

    try:
        with open(args.file, encoding="utf-8", errors="replace") as handle:
            text = handle.read()
    except FileNotFoundError:
        print(f"ci_check_report: нет файла {args.file}")
        return 0

    return post_check(args.name, args.title, text)


if __name__ == "__main__":
    sys.exit(main())
