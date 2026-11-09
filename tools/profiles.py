#!/usr/bin/env python3
"""
Validator for app profiles (the "how exactly in this program" layer).

Registry (`data/actions.psv`) answers **what** ZShelper can do.
Profile (`data/profiles/*.json`) answers **how** to do it in one concrete app:
anchors, ordered steps, verification, failure handling.

This tool enforces three rules that make the whole design trustworthy:

  1. every profile operation points to an existing registry row (`domain|verb`);
  2. a profile may not *lower* the risk declared by the registry;
  3. every operation has a verification step — an unverified GUI action is a bug,
     because "clicked" is not "happened".

It also writes `docs/PROFILES.md` (human-readable status table) and fails with a
non-zero exit code when a profile is inconsistent, so CI catches drift.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIONS = ROOT / "data" / "actions.json"
PROFILE_DIR = ROOT / "data" / "profiles"
MD_OUT = ROOT / "docs" / "PROFILES.md"
# Сводка для приложения: одно чтение вместо 87 файлов, и Rust, и интерфейс.
INDEX_OUT = ROOT / "data" / "profiles.json"

RISK_RANK = {"read": 0, "write-local": 1, "external": 2, "destructive": 3, "identity": 4, "money": 5}
REQUIRED = ("app", "exe", "version_seen", "verified_at", "anchors", "operations")
OP_REQUIRED = ("name", "registry", "steps", "verify", "risk")


ROWS: list[dict] = []


def load_actions() -> tuple[dict[tuple[str, str], str], dict[str, set[str]]]:
    """(domain, verb) -> strongest risk, plus domain -> verbs."""
    global ROWS
    rows = json.loads(ACTIONS.read_text(encoding="utf-8"))
    ROWS = rows
    combo: dict[tuple[str, str], str] = {}
    domain_verbs: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        key = (row["domain"], row["verb"])
        prev = combo.get(key)
        if prev is None or RISK_RANK[row["risk"]] > RISK_RANK[prev]:
            combo[key] = row["risk"]
        domain_verbs[row["domain"]].add(row["verb"])
    return combo, domain_verbs


def check_profile(path: Path, combo, domain_verbs) -> tuple[list[str], dict]:
    errs: list[str] = []
    try:
        prof = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"{path.name}: invalid JSON: {exc}"], {}

    for key in REQUIRED:
        if key not in prof:
            errs.append(f"{path.name}: missing required key '{key}'")
    if errs:
        return errs, {}

    kind = prof.get("kind", "app")
    if kind not in ("app", "tool", "system"):
        errs.append(f"{path.name}: unknown kind '{kind}' (app|tool|system)")

    anchors = prof.get("anchors", {})
    risks = Counter()
    ogres = Counter()
    ok_ops = 0

    for i, op in enumerate(prof.get("operations", []), 1):
        tag = f"{path.name}#{i} ({op.get('name', '?')})"
        for key in OP_REQUIRED:
            if key not in op:
                errs.append(f"{tag}: missing '{key}'")
        if any(k not in op for k in OP_REQUIRED):
            continue

        ref = op["registry"]
        parts = ref.split("|")
        if len(parts) < 2:
            errs.append(f"{tag}: registry ref must be 'domain|verb[|object]', got '{ref}'")
            continue
        dom, verb = parts[0], parts[1]
        obj_filter = parts[2] if len(parts) > 2 else None
        if (dom, verb) not in combo:
            hint = ", ".join(sorted(domain_verbs.get(dom, []))[:8]) or "нет такого домена"
            errs.append(f"{tag}: no registry row '{dom}|{verb}'. Verbs in '{dom}': {hint}")
        elif obj_filter and not any(
            r["domain"] == dom and r["verb"] == verb and obj_filter in r["object"] for r in ROWS
        ):
            objs = ", ".join(
                r["object"] for r in ROWS if r["domain"] == dom and r["verb"] == verb
            )
            errs.append(f"{tag}: no row '{dom}|{verb}' with object ~ '{obj_filter}'. Objects: {objs}")
        else:
            base = max(
                (
                    r["risk"]
                    for r in ROWS
                    if r["domain"] == dom and r["verb"] == verb
                    and (obj_filter is None or obj_filter in r["object"])
                ),
                key=lambda r: RISK_RANK[r],
            )
            if RISK_RANK[op["risk"]] < RISK_RANK[base]:
                errs.append(f"{tag}: risk '{op['risk']}' lowers registry risk '{base}'")

        if not op["steps"]:
            errs.append(f"{tag}: empty steps")
        for step in op["steps"]:
            if step.startswith("anchor:"):
                name = step.split(":", 1)[1]
                if name not in anchors:
                    errs.append(f"{tag}: step references unknown anchor '{name}'")
        if not op["verify"]:
            errs.append(f"{tag}: no verification — a GUI action without verify is a bug")

        risks[op["risk"]] += 1
        ogres[dom] += 1
        if all(k in op for k in OP_REQUIRED) and (dom, verb) in combo:
            ok_ops += 1

    info = {
        "slug": path.stem,
        "app": prof["app"],
        "kind": kind,
        "exe": ", ".join(prof["exe"]),
        "stack": prof.get("ui_stack", "—"),
        "version": prof["version_seen"],
        "verified": prof["verified_at"],
        "anchors": len(anchors),
        "ops": len(prof.get("operations", [])),
        "ok_ops": ok_ops,
        "risks": risks,
        "domains": ogres,
        "file": path.name,
        # Для приложения: имя операции, ссылка на реестр и риск, не заниженный профилем.
        "operations": [
            {
                "name": op.get("name", ""),
                "registry": op.get("registry", ""),
                "risk": op.get("risk", ""),
            }
            for op in prof.get("operations", [])
            if all(key in op for key in OP_REQUIRED)
        ],
        "exe_list": list(prof["exe"]),
    }
    return errs, info


def render(infos: list[dict], errs: list[str]) -> str:
    all_risks: Counter = Counter()
    for info in infos:
        all_risks.update(info["risks"])
    total_ops = sum(i["ops"] for i in infos)

    lines = [
        "# Профили приложений: слой «как именно»",
        "",
        "Реестр действий ([`docs/ACTIONS.md`](ACTIONS.md)) отвечает на вопрос **что** умеет ZShelper.",
        "Профиль отвечает на вопрос **как** это сделать в конкретной программе: якоря, шаги,",
        "проверка результата, поведение при провале.",
        "",
        "Файл генерируется `python3 tools/profiles.py`; руками не править.",
        "",
        f"**Профилей: {len(infos)}** · операций: **{total_ops}** · "
        f"проблем: **{len(errs)}**",
        "",
        "Правила (проверяются автоматически, ошибка = ненулевой код возврата):",
        "",
        "1. каждая операция ссылается на существующую строку реестра `domain|verb`;",
        "2. профиль не может **занизить** риск относительно реестра;",
        "3. у каждой операции есть **проверка результата** — «нажал» не значит «получилось».",
        "",
        "## Профили",
        "",
        "| Приложение / класс | Тип | Процесс | Стек | Версия | Проверен | Якорей | Операций | Файл |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for info in sorted(infos, key=lambda i: i["app"]):
        lines.append(
            f"| {info['app']} | `{info['kind']}` | `{info['exe']}` | {info['stack']} | {info['version']} "
            f"| {info['verified']} | {info['anchors']} | {info['ops']} | `{info['file']}` |"
        )

    kinds: Counter = Counter(i["kind"] for i in infos)
    lines += [
        "",
        "По типу: "
        + " · ".join(f"`{k}` — {n}" for k, n in kinds.most_common())
        + ". `app` — конкретная программа, `tool` — командный инструмент без интерфейса, "
        "`system` — класс работы в самой Windows (устройства, безопасность, календарь), "
        "где «приложение» — это система.",
        "",
        "## Риск операций",
        "",
    ]
    for risk, n in all_risks.most_common():
        lines.append(f"- `{risk}` — {n}")
    if not all_risks:
        lines.append("- (пока пусто)")

    lines += ["", "## Покрытие доменов реестра", ""]
    dom: Counter = Counter()
    for info in infos:
        dom.update(info["domains"])
    for name, n in dom.most_common():
        lines.append(f"- `{name}` — {n}")
    if not dom:
        lines.append("- (пока пусто)")

    lines += [
        "",
        "## Проблемы",
        "",
    ]
    if errs:
        lines += [f"- {e}" for e in errs]
    else:
        lines.append("Нет. Все ссылки на реестр валидны, риски не занижены, проверки на месте.")

    lines += [
        "",
        "## Чего профили не делают",
        "",
        "- **Не заменяют реестр**: операция без строки в реестре невозможна по определению.",
        "- **Не содержат секретов**: пароли и токены берутся из `secrets.enc` / persistent-профиля.",
        "- **Не хардкодят координаты** там, где есть UIA-якорь: пиксели ломаются при смене темы и DPI.",
        "- **Не считаются вечными**: поле `verified_at` — обещание перепроверки после обновления приложения.",
        "",
        "## Как добавить профиль",
        "",
        "1. Записать (если ещё нет) действия в `data/actions.psv` → `python3 tools/actions.py`.",
        "2. Скопировать `data/profiles/capcut.json` как шаблон.",
        "3. Пройти 5–8 операций руками, записав якоря и проверки.",
        "4. `python3 tools/profiles.py` — ноль ошибок.",
        "5. Добавить в eval-набор сценарий «приложение обновилось → якорь не найден → агент не врёт».",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    if not ACTIONS.exists():
        print("run tools/actions.py first (data/actions.json missing)", file=sys.stderr)
        return 2
    combo, domain_verbs = load_actions()

    paths = sorted(p for p in PROFILE_DIR.glob("*.json") if not p.name.startswith("_"))
    if not paths:
        print("no profiles found", file=sys.stderr)
        return 2

    infos, errs = [], []
    for path in paths:
        e, info = check_profile(path, combo, domain_verbs)
        errs += e
        if info:
            infos.append(info)

    MD_OUT.parent.mkdir(parents=True, exist_ok=True)
    MD_OUT.write_text(render(infos, errs), encoding="utf-8")

    # Сводка для приложения. Пишется всегда, а не только при отсутствии ошибок:
    # расхождение с источниками всё равно поймает `--check` в CI.
    INDEX_OUT.write_text(
        json.dumps(
            [
                {
                    "slug": info["slug"],
                    "app": info["app"],
                    "kind": info["kind"],
                    "exe": info["exe_list"],
                    "ui_stack": info["stack"],
                    "version_seen": info["version"],
                    "verified_at": info["verified"],
                    "anchors": info["anchors"],
                    "operations": info["operations"],
                }
                for info in infos
            ],
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    ops = sum(i["ops"] for i in infos)
    print(
        f"profiles: {len(infos)}, operations: {ops}, problems: {len(errs)} -> "
        f"{MD_OUT.relative_to(ROOT)}, {INDEX_OUT.relative_to(ROOT)}"
    )
    for e in errs:
        print("  !", e)
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
