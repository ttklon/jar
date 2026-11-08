#!/usr/bin/env python3
"""
UIA probe and profile-draft generator.

Solves the "any Windows app" problem: instead of hand-writing hundreds of profiles,
we dump the accessibility tree of a running app and turn it into a **draft profile**
(tier B) that a human confirms once.

Two modes:

  dump  — Windows only, needs `pywinauto` (pip install pywinauto).
          python3 tools/uia_probe.py dump --exe CapCut.exe --out dump.json

  draft — pure Python, works anywhere (also on a saved dump).
          python3 tools/uia_probe.py draft --dump dump.json --out data/profile_drafts/capcut.json

The draft is written to `data/profile_drafts/` on purpose: `tools/profiles.py` validates only
`data/profiles/`, so an unconfirmed draft can never reach a release, but it is visible,
versionable and reviewable.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DRAFTS = ROOT / "data" / "profile_drafts"

INTERESTING = {
    "Button", "MenuItem", "Edit", "ComboBox", "TabItem", "TreeItem",
    "ListItem", "CheckBox", "RadioButton", "Slider", "Spinner",
}
NOISE = re.compile(r"^(item|элемент)\s*\d+$", re.IGNORECASE)


# --------------------------------------------------------------------------- dump (Windows)
def cmd_dump(exe: str, out: Path, depth: int) -> int:
    try:
        from pywinauto import Desktop  # type: ignore
    except Exception:
        print("pywinauto is required for `dump` (Windows only): pip install pywinauto",
              file=sys.stderr)
        return 2

    # Фильтруем окна по имени процесса — надёжнее, чем угадывать по заголовку.
    import psutil  # type: ignore
    pids = {p.pid for p in psutil.process_iter(["name"]) if (p.info.get("name") or "").lower() == exe.lower()}
    for win in Desktop(backend="uia").windows():
        try:
            if win.process_id() not in pids:
                continue
        except Exception:
            continue
        windows.append(win)

    if not windows:
        print(f"no windows found for process {exe}", file=sys.stderr)
        return 1

    data = {"exe": exe, "windows": []}
    for win in windows:
        def walk(ctrl, level: int):
            if level > depth:
                return None
            info = ctrl.element_info
            node = {
                "name": (info.name or "")[:120],
                "control_type": str(info.control_type or ""),
                "automation_id": (info.automation_id or "")[:120],
                "class_name": (info.class_name or "")[:120],
                "enabled": bool(getattr(info, "enabled", True)),
                "children": [],
            }
            try:
                for child in ctrl.children():
                    sub = walk(child, level + 1)
                    if sub:
                        node["children"].append(sub)
            except Exception:
                pass
            return node

        data["windows"].append({
            "title": str(win.element_info.name)[:200],
            "class_name": str(win.element_info.class_name)[:200],
            "tree": walk(win, 0),
        })

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"dump: {len(windows)} window(s) -> {out}")
    return 0


# --------------------------------------------------------------------------- draft (anywhere)
def flatten(node: dict, path: tuple[int, ...] = ()):
    yield path, node
    for i, child in enumerate(node.get("children", [])):
        yield from flatten(child, path + (i,))


def classify(tree: dict) -> str:
    """Грубая, но полезная классификация: чем автоматизировать это приложение."""
    types: Counter = Counter()
    total = 0
    for _, node in flatten(tree):
        total += 1
        types[node.get("control_type", "")] += 1
    buttons = types.get("Button", 0)
    edits = types.get("Edit", 0)
    docs = types.get("Document", 0)
    if total < 6 and buttons + edits == 0:
        return "canvas"          # канвас/игра: UIA бесполезен → визуальный агент
    if buttons + edits >= 2 and docs == 0:
        return "uia"             # нормальное нативное приложение
    if buttons + edits >= 2 and docs > 0:
        return "web-in-shell"    # Electron/webview: контролы есть, но внутри документа
    return "uia-poor"            # мало контролов: смешанный режим


def cmd_draft(dump_path: Path, out: Path, app_name: str | None) -> int:
    data = json.loads(dump_path.read_text(encoding="utf-8"))
    exe = data.get("exe", "unknown.exe")
    windows = data.get("windows") or []
    if not windows:
        print("dump has no windows", file=sys.stderr)
        return 1

    trees = [w.get("tree") or {} for w in windows if w.get("tree")]
    kinds = Counter(classify(t) for t in trees)
    ui_kind = kinds.most_common(1)[0][0] if kinds else "canvas"

    anchors: dict[str, dict] = {}
    operations: list[dict] = []

    for tree in trees:
        for path, node in flatten(tree):
            ctype = node.get("control_type", "")
            name = (node.get("name") or "").strip()
            aid = (node.get("automation_id") or "").strip()
            if ctype not in INTERESTING or not (name or aid):
                continue
            if NOISE.match(name):
                continue
            key = re.sub(r"\W+", "_", (aid or name).lower()).strip("_")[:40]
            if not key or key in anchors:
                continue
            anchors[key] = {
                "by": "uia",
                "value": f"AutomationId={aid}" if aid else f"ControlType={ctype}; Name~«{name}»",
                "fallback": "ocr:текст кнопки",
                "confidence": "high" if aid else "medium",
            }
            if ctype in {"Button", "MenuItem"} and len(operations) < 12:
                operations.append({
                    "name": f"Нажать «{name or aid}»",
                    "registry": "apps-generic|кликнуть|по элементу с проверкой",
                    "steps": [f"anchor:{key}", "wait:300", "verify:состояние изменилось"],
                    "verify": ["TODO: чем подтверждаем результат (файл/экран/состояние)"],
                    "risk": "write-local",
                    "on_fail": "откат Ctrl+Z, скриншот в чат",
                    "notes": "ЧЕРНОВИК: проверить вручную, уточнить risk и verify",
                })

    draft = {
        "app": app_name or exe.replace(".exe", ""),
        "exe": [exe],
        "ui_stack": {"uia": "uia", "web-in-shell": "electron"}.get(ui_kind, "win32"),
        "version_seen": "unknown",
        "verified_at": "",
        "_draft": True,
        "_ui_kind": ui_kind,
        "_windows": [w.get("title", "") for w in windows],
        "anchors": anchors,
        "operations": operations,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"draft: {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out}")
    print(f"  windows: {len(windows)}  ui_kind: {ui_kind}")
    print(f"  anchors: {len(anchors)}  candidate operations: {len(operations)}")
    if ui_kind == "canvas":
        print("  ! канвас/игра: профиль бесполезен, работать через визуального агента (tier C)")
    elif ui_kind == "uia-poor":
        print("  ! мало контролов UIA: основной путь — визуальный агент, профиль как ускорение")
    print("  next: уточнить verify и risk, затем перенести в data/profiles/ и поставить verified_at")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("dump", help="снять UIA-дерево (Windows, pywinauto)")
    d.add_argument("--exe", required=True, help="имя процесса, например CapCut.exe")
    d.add_argument("--out", type=Path, default=Path("dump.json"))
    d.add_argument("--depth", type=int, default=12)

    g = sub.add_parser("draft", help="собрать черновик профиля из дампа")
    g.add_argument("--dump", type=Path, required=True)
    g.add_argument("--out", type=Path, default=DRAFTS / "draft.json")
    g.add_argument("--app", default=None)

    args = ap.parse_args()
    if args.cmd == "dump":
        return cmd_dump(args.exe, args.out, args.depth)
    return cmd_draft(args.dump, args.out, args.app)


if __name__ == "__main__":
    raise SystemExit(main())
