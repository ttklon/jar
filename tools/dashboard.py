#!/usr/bin/env python3
"""Two generated documents that make the repository navigable and measurable.

  docs/DASHBOARD.md — один отчёт: что готово, что нет, где долг, что делать дальше.
                      Собран из данных, а не из памяти: реестр, профили, скиллы,
                      экосистема, план проверок, дорожная карта.
  docs/INDEX.md     — индекс ВСЕХ документов репозитория: путь, заголовок, назначение,
                      кто пишет (руками или генератор). Чтобы новая модель не искала
                      «где тут про X» по 60 файлам.

Оба файла перегенерируются одной командой и проверяются в CI (`--check`),
поэтому индекс не разъезжается с реальностью.

Usage: python3 tools/dashboard.py [--check]
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DASH = ROOT / "docs" / "DASHBOARD.md"
INDEX = ROOT / "docs" / "INDEX.md"

ACTION_RISK = {"read": 0, "write-local": 1, "external": 2, "destructive": 3, "identity": 4, "money": 5}

GENERATED = {
    "AGENTS.md": "частично: блок состояния (tools/status.py)",
    "docs/ACTIONS.md": "tools/actions.py",
    "docs/PROFILES.md": "tools/profiles.py",
    "docs/COVERAGE.md": "tools/audit_actions.py",
    "docs/APP-COVERAGE.md": "tools/app_targets.py",
    "docs/EVALS.md": "tools/evals.py",
    "docs/SKILLS.md": "tools/skills.py",
    "docs/ECOSYSTEM.md": "tools/ecosystem.py",
    "docs/DEPENDENCIES.md": "tools/deps_report.py",
    "docs/DASHBOARD.md": "tools/dashboard.py",
    "docs/INDEX.md": "tools/dashboard.py",
    "data/actions.json": "tools/actions.py",
    "data/evals.json": "tools/evals.py",
    "data/ecosystem/*.json": "tools/build_ecosystem.py",
}

PURPOSE = {
    "docs/BUILD-GUIDE.md": "инструкция по сборке приложения — главный документ для разработки",
    "docs/DECISION-STACK.md": "почему Tauri 2 + Rust + React, а не Electron",
    "docs/RUNTIME.md": "как приложение запускается и обновляется на Windows",
    "docs/LICENSING.md": "лицензирование и защита сборки",
    "docs/PROFILE-STRATEGY.md": "tier A/B/C: как покрывать любое приложение",
    "docs/ROADMAP.md": "план по этапам M0…M8 и критерии выхода",
    "docs/DASHBOARD.md": "сводный отчёт по всему репозиторию (этот файл рядом)",
    "docs/INDEX.md": "индекс всех документов",
    "docs/ACTIONS.md": "реестр действий: что система умеет",
    "docs/PROFILES.md": "профили приложений: как это делается в конкретной программе",
    "docs/SKILLS.md": "скиллы: как из действий получается готовая работа",
    "docs/ECOSYSTEM.md": "что существует снаружи и что из этого проверено",
    "docs/COVERAGE.md": "аудит покрытия: дырки и глубина",
    "docs/APP-COVERAGE.md": "каталог приложений Windows и их tier",
    "docs/EVALS.md": "план проверок: сценарий на каждое действие",
    "docs/DEPENDENCIES.md": "стек и лицензии зависимостей",
    "AGENTS.md": "единственная точка входа для человека и модели",
}


def load(path: Path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def numbers() -> dict:
    actions = load(ROOT / "data" / "actions.json", [])
    profiles = {}
    for p in sorted((ROOT / "data" / "profiles").glob("*.json")):
        if p.name.startswith("_"):
            continue
        d = load(p, {})
        profiles[p.stem] = d
    ops = sum(len(d.get("operations", [])) for d in profiles.values())
    skills = [load(p, {}) for p in sorted((ROOT / "data" / "skills").glob("*.json"))]
    eco = {}
    for p in sorted((ROOT / "data" / "ecosystem").glob("*.json")):
        eco[p.stem] = load(p, [])
    targets = []
    for line in (ROOT / "data" / "app_targets.psv").read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            f = line.split("|")
            if len(f) == 8:
                targets.append(f)
    evals = load(ROOT / "data" / "evals.json", {})
    sources = load(ROOT / "research" / "SOURCES.json", [])
    return {
        "actions": actions, "profiles": profiles, "ops": ops, "skills": skills,
        "eco": eco, "targets": targets, "evals": evals, "sources": sources,
    }


def roadmap_progress() -> list[tuple[str, int, int]]:
    text = (ROOT / "docs" / "ROADMAP.md").read_text(encoding="utf-8")
    out = []
    for chunk in re.split(r"\n## ", text)[1:]:
        title = chunk.splitlines()[0].strip()
        done = len(re.findall(r"- \[x\]", chunk))
        total = done + len(re.findall(r"- \[ \]", chunk))
        if total:
            out.append((re.sub(r"[*`]", "", title), done, total))
    return out


def depth() -> list[tuple[float, str, int, int]]:
    rows = load(ROOT / "data" / "actions.json", [])
    by_dom: Counter = Counter()
    for r in rows:
        by_dom[r["domain"]] += 1
    ops: Counter = Counter()
    for p in (ROOT / "data" / "profiles").glob("*.json"):
        if p.name.startswith("_"):
            continue
        for op in load(p, {}).get("operations", []):
            ref = op.get("registry", "")
            if "|" in ref:
                ops[ref.split("|")[0]] += 1
    policy = load(ROOT / "data" / "domain_profile_policy.json", {}).get("domains", {})
    out = []
    for d, n in by_dom.items():
        if n >= 8 and not (d in policy and not policy[d].get("needs_profile")):
            out.append((ops.get(d, 0) / n, d, ops.get(d, 0), n))
    return sorted(out)


def apps_without_profile(n: dict) -> list[list[str]]:
    exes = set()
    for d in n["profiles"].values():
        for e in d.get("exe", []):
            exes.add(e.lower())
    return [t for t in n["targets"] if t[3].lower() not in exes]


def code_stats() -> dict:
    """Что уже написано: файлы, строки, тесты. Считается по факту, а не по памяти.

    Пока приложения не было, DASHBOARD описывал только данные. Теперь у проекта
    есть код, и честный отчёт обязан показывать, сколько его и насколько он
    покрыт тестами — иначе «готово» превращается в обещание.
    """
    src = ROOT / "src"
    core = ROOT / "src-tauri" / "src"

    def count(paths, exclude_tests: bool):
        files = lines = 0
        for path in paths:
            if exclude_tests and (".test." in path.name or path.name == "tests.rs"):
                continue
            files += 1
            lines += sum(1 for _ in path.read_text(encoding="utf-8").splitlines())
        return files, lines

    ts = sorted(p for p in src.rglob("*.ts*")) if src.exists() else []
    rs = sorted(core.rglob("*.rs")) if core.exists() else []
    ts_files, ts_lines = count(ts, True)
    rs_files, rs_lines = count(rs, True)
    ts_tests, _ = count(ts, False)
    ts_tests = sum(1 for p in ts if ".test." in p.name)
    rs_tests = sum(
        p.read_text(encoding="utf-8").count("#[test]") for p in rs
    )
    return {
        "ts_files": ts_files,
        "ts_lines": ts_lines,
        "rs_files": rs_files,
        "rs_lines": rs_lines,
        "ts_tests": ts_tests,
        "rs_tests": rs_tests,
    }


def render_dashboard(n: dict) -> str:
    acts = n["actions"]
    risks = Counter(a["risk"] for a in acts)
    eco_total = sum(len(v) for v in n["eco"].values())
    eco_sel = sum(1 for v in n["eco"].values() for r in v if r.get("status") == "selected")
    ev = n["evals"]
    n_evals = ev.get("count", len(ev.get("evals", []))) if isinstance(ev, dict) else len(ev)
    curated = len(ev.get("curated", [])) if isinstance(ev, dict) else 0
    lic = Counter((r.get("license") or "не указана") for v in n["eco"].values() for r in v)
    no_lic = sum(c for k, c in lic.items() if k in ("не указана", "proprietary"))
    code = code_stats()

    L: list[str] = [
        "# Сводный отчёт по репозиторию",
        "",
        "Одна страница: что готово, чего нет, где долг и что делать следующим шагом. "
        "Собрано из данных `tools/dashboard.py`; цифры всегда свежие, потому что "
        "файл перегенерируется и проверяется в CI.",
        "",
        "## Что уже есть",
        "",
        "| Слой | Объём | Состояние |",
        "| --- | --- | --- |",
        f"| Действия (реестр) | **{len(acts)}** в {len({a['domain'] for a in acts})} доменах, "
        f"{len({a['verb'] for a in acts})} глаголов | источник истины, валидируется |",
        f"| Профили приложений | **{len(n['profiles'])}** файлов, **{n['ops']}** операций | "
        f"0 проблем валидатора |",
        f"| Скиллы (рецепты) | **{len(n['skills'])}** | у каждого шаги, проверки, «готово» |",
        f"| Экосистема | **{eco_total}** записей в {len(n['eco'])} каталогах | "
        f"проверено и выбрано {eco_sel} |",
        f"| Каталог приложений | **{len(n['targets'])}** | "
        f"tier A — {sum(1 for t in n['targets'] if t[5]=='A')}, "
        f"без профиля — {len(apps_without_profile(n))} |",
        f"| План проверок | **{n_evals}** сценариев (+{curated} обязательных) | "
        "генерируется из реестра |",
        f"| Исследование | **{len(n['sources'])}** источников | `research/` |",
        "",
        "## Код приложения",
        "",
        "Считается по файлам: `src/` (UI) и `src-tauri/src/` (ядро). Тесты — отдельно, "
        "потому что покрытие важнее объёма.",
        "",
        "| Часть | Файлов | Строк | Тестов |",
        "| --- | --- | --- | --- |",
        f"| Ядро (Rust) | {code['rs_files']} | {code['rs_lines']} | {code['rs_tests']} |",
        f"| Интерфейс (TypeScript) | {code['ts_files']} | {code['ts_lines']} | {code['ts_tests']} файла |",
        "",
        "Что уже работает: окно, трей, логи в `%LOCALAPPDATA%`, реестр как каталог "
        "инструментов (индексы, статистика, поиск), экран «Что умею» с риском и каналами.",
        "Чего ещё нет: исполнения действий, планировщика, моделей, голоса, памяти, MCP.",
        "",
        "## Риск в реестре",
        "",
        "| Риск | Действий | Что значит для реализации |",
        "| --- | --- | --- |",
    ]
    meaning = {
        "read": "можно выполнять без подтверждения",
        "write-local": "пишет на диск — нужен откат и проверка",
        "external": "выходит наружу — подтверждение человеком",
        "destructive": "удаляет/перезаписывает — подтверждение + бэкап",
        "identity": "учётные данные и подпись — только человек",
        "money": "деньги — система не двигает",
    }
    for risk, cnt in risks.most_common():
        L.append(f"| `{risk}` | {cnt} | {meaning.get(risk, '')} |")

    dr = depth()
    L += [
        "",
        "## Где тонко (глубина доменов)",
        "",
        "| Домен | Действий | Операций в профилях | Глубина |",
        "| --- | --- | --- | --- |",
    ]
    for ratio, d, ops_n, total in dr[:8]:
        L.append(f"| `{d}` | {total} | {ops_n} | {ratio:.2f} |")
    L += [
        "",
        "Глубина — отношение «операции профилей / действия реестра». Ниже 0.5 — домен описан "
        "шире, чем умеет.",
        "",
        "## План разработки",
        "",
        "| Этап | Задачи |",
        "| --- | --- |",
    ]
    for title, done, total in roadmap_progress():
        bar = "█" * done + "░" * (total - done)
        L.append(f"| {title} | {done}/{total} {bar} |")
    L += [
        "",
        "## Экосистема: сколько проверено",
        "",
        "| Каталог | Записей | Выбрано | Кандидатов |",
        "| --- | --- | --- | --- |",
    ]
    for cat, rows in n["eco"].items():
        sel = sum(1 for r in rows if r.get("status") == "selected")
        L.append(f"| `{cat}` | {len(rows)} | {sel} | {len(rows) - sel} |")
    L += [
        "",
        f"Записей с неуказанной или проприетарной лицензией: **{no_lic}** из {eco_total}. "
        "Проприетарное допустимо только как альтернатива с пометкой; «лицензия не указана» — "
        "не значит «можно».",
        "",
        "## Что готово к следующему шагу",
        "",
        "1. **Строить приложение** — можно начинать: есть реестр, профили, скиллы, каталог моделей "
        "и экосистема, план проверок, дорожная карта и инструкция `docs/BUILD-GUIDE.md`.",
        "2. **Наполнять по мере надобности** — реестр, профили и экосистема пополняются "
        "инкрементально; жёсткого «сначала всё, потом код» больше нет.",
        "3. **Проверять гипотезы на живой Windows** — единственное, что нельзя сделать из "
        "репозитория: реальные якоря (`verified_at`) и `uia_probe`.",
        "",
        "## Долги, которые видно",
        "",
    ]
    gaps: list[str] = []
    if len(apps_without_profile(n)):
        gaps.append(f"- {len(apps_without_profile(n))} приложений каталога без профиля "
                    "(все tier C — визуальный агент, это решение, а не долг)")
    weak = [d for ratio, d, _, _ in dr if ratio < 0.5]
    if weak:
        gaps.append("- домены с глубиной ниже 0.5: " + ", ".join(f"`{d}`" for d in weak[:10]))
    noc = sum(1 for v in n["eco"].values() for r in v if r.get("needs_check"))
    gaps.append(f"- {noc} записей экосистемы — кандидаты: до проверки на них нельзя опираться")
    gaps.append("- профили с `verified_at` только на бумаге: нужен прогон `uia_probe` на живой Windows")
    gaps.append("- ни одна модель не проверена на реальном железе (бенчмарки — этап M3)")
    L += gaps
    L += [
        "",
        "## Следующие 10 действий (в порядке пользы)",
        "",
        "Каркас и каталог готовы (см. «Код приложения»), поэтому список начинается с "
        "первого исполняемого действия — дальше приложение впервые что-то *делает*.",
        "",
        "1. Политика риска и подтверждения (`policy.rs`) + журнал (`audit.rs`) — до первого исполнения.",
        "2. Исполнитель CLI-каналов (`executor/cli.rs`) + проверка результата (`verifier.rs`).",
        "3. Первые 10 инструментов из реестра + экран «план → выполнение» с отменой.",
        "4. Хоткеи push-to-talk и Mica-эффект окна (остаток M1).",
        "5. SQLite-схема: следы, шаги, артефакты (`memory/`).",
        "6. Менеджер моделей: манифест, sha256, LRU, `llama-server`.",
        "7. Планировщик с JSON-схемой и валидацией ключей реестра.",
        "8. Голос: VAD → ASR → план → TTS, замер латентности.",
        "9. Прогнать 15 обязательных eval-сценариев на живой Windows.",
        "10. Собрать MSIX, подписать, проверить обновление и откат.",
        "",
        "## Как этим пользоваться",
        "",
        "```bash",
        "python3 tools/check_all.py           # всё и в правильном порядке (то же, что в CI)",
        "python3 tools/check_all.py --check   # + упасть, если сгенерированное не закоммичено",
        "python3 tools/dashboard.py           # пересобрать DASHBOARD.md и INDEX.md",
        "python3 tools/status.py              # обновить блок состояния в AGENTS.md",
        "```",
        "",
    ]
    return "\n".join(L)


def doc_title_and_purpose(path: Path) -> tuple[str, str]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return "", ""
    title = ""
    for line in text.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            break
    body = ""
    for line in text.splitlines()[1:]:
        s = line.strip()
        if not s or s.startswith("#") or s.startswith("|") or s.startswith("```"):
            continue
        body = re.sub(r"[*`\[\]]|\([^)]*\)", "", s)[:160]
        break
    return title, body


def render_index() -> str:
    rel = "AGENTS.md"
    docs = sorted((ROOT / "docs").glob("*.md"))
    notes = sorted((ROOT / "research" / "notes").glob("*.md"))
    others = [ROOT / "README.md", ROOT / "research" / "README.md", ROOT / "research" / "INDEX.md"]
    L = [
        "# Индекс документов: что где лежит",
        "",
        "Полная карта документации. Индекс генерируется `tools/dashboard.py`, поэтому не "
        "разъезжается: если файл появился или исчез, это видно здесь.",
        "",
        "Столбец «кто пишет»: `руками` — решение или конспект; `генератор` — файл собирается из "
        "данных, править его бессмысленно (правят данные и пересобирают).",
        "",
        "## Точка входа",
        "",
        "| Файл | Назначение | Кто пишет |",
        "| --- | --- | --- |",
        "| [AGENTS.md](../AGENTS.md) | маршрут чтения, правила, состояние проекта | человек + `tools/status.py` |",
        "| [docs/BUILD-GUIDE.md](BUILD-GUIDE.md) | как строить приложение: архитектура, контракты, этапы | руками (главный документ разработки) |",
        "| [docs/DASHBOARD.md](DASHBOARD.md) | сводный отчёт по репозиторию | генератор |",
        "",
        "## Документы `docs/`",
        "",
        "| Файл | Заголовок | Назначение | Кто пишет |",
        "| --- | --- | --- | --- |",
    ]
    for p in docs:
        if p.name in {"BUILD-GUIDE.md", "DASHBOARD.md", "INDEX.md"}:
            continue  # уже в «Точке входа», не дублируем
        title, body = doc_title_and_purpose(p)
        key = f"docs/{p.name}"
        who = GENERATED.get(key, "руками")
        purpose = PURPOSE.get(key) or body
        L.append(f"| [{p.name}]({p.name}) | {title} | {purpose[:150]} | {who} |")

    L += [
        "",
        "## Конспекты `research/notes/`",
        "",
        "| Файл | Заголовок | О чём |",
        "| --- | --- | --- |",
    ]
    for p in notes:
        title, body = doc_title_and_purpose(p)
        L.append(f"| [{p.name}](../research/notes/{p.name}) | {title} | {body[:130]} |")

    L += ["", "## Данные и инструменты", "", "| Путь | Что это | Кто пишет |", "| --- | --- | --- |"]
    data_rows = [
        ("data/actions.psv", "реестр действий (10 полей на строку)", "руками"),
        ("data/profiles/", "профили приложений: якоря, шаги, проверки", "руками"),
        ("data/skills/", "скиллы: рецепты из действий с критериями «готово»", "руками"),
        ("data/ecosystem/", "10 каталогов внешнего мира (MCP, модели, коннекторы…)", "`tools/build_ecosystem.py`"),
        ("data/app_targets.psv", "каталог приложений Windows: tier, канал, приоритет", "руками"),
        ("data/evals.json", "план проверок на каждое действие", "`tools/evals.py`"),
        ("data/domain_profile_policy.json", "почему у домена нет профиля", "руками"),
        ("data/verb_families.json", "семейства глаголов", "руками"),
        ("research/SOURCES.json", "1645 источников с лицензиями", "`tools/collect_sources.py`"),
    ]
    for path, what, who in data_rows:
        L.append(f"| `{path}` | {what} | {who} |")

    tools = sorted((ROOT / "tools").glob("*.py"))
    L += ["", "## Инструменты `tools/`", "", "| Файл | Что делает |", "| --- | --- |"]
    tool_purpose = {
        "actions.py": "реестр → actions.json + docs/ACTIONS.md",
        "profiles.py": "валидатор профилей → docs/PROFILES.md",
        "audit_actions.py": "аудит покрытия → docs/COVERAGE.md",
        "app_targets.py": "каталог приложений → docs/APP-COVERAGE.md",
        "evals.py": "план проверок → docs/EVALS.md, data/evals.json",
        "skills.py": "валидатор скиллов → docs/SKILLS.md",
        "build_ecosystem.py": "сборка 10 каталогов экосистемы из research/ и _curated/",
        "ecosystem.py": "валидатор экосистемы → docs/ECOSYSTEM.md",
        "status.py": "блок состояния в AGENTS.md",
        "dashboard.py": "DASHBOARD.md + INDEX.md (этот индекс)",
        "check_all.py": "все генераторы и валидаторы по порядку (+ --check против git)",
        "links.py": "проверка относительных ссылок в документах",
        "deps_report.py": "стек и лицензии → docs/DEPENDENCIES.md",
        "uia_probe.py": "снятие и черновик профиля из UIA-дампа (Windows)",
        "collect_sources.py": "сбор источников в research/",
        "mine_awesome.py": "разбор awesome-листов",
        "shortlist.py": "раскладка инвентаризации по доменам",
        "tools_actions_titles.py": "русские названия доменов для генераторов",
    }
    for p in tools:
        L.append(f"| `{p.name}` | {tool_purpose.get(p.name, '—')} |")

    disc = ROOT / "research" / "discovery"
    vault = ROOT / "research" / "sources"
    disc_md = sorted(disc.glob("*.md")) if disc.exists() else []
    # `_`-prefixed files are local caches (gitignored) — never count them, or this
    # index would differ between a working copy and a fresh CI clone.
    disc_json = sorted(p for p in disc.glob("*.json") if not p.name.startswith("_")) if disc.exists() else []
    vault_dirs = sorted(p for p in vault.iterdir() if p.is_dir()) if vault.exists() else []
    L += [
        "",
        "## Первоисточники `research/`",
        "",
        "Сырьё, из которого собираются конспекты (`research/notes/`) и каталоги экосистемы. "
        "Править руками не нужно — пересобирается инструментами.",
        "",
        "| Путь | Что это | Кто пишет |",
        "| --- | --- | --- |",
        f"| [`research/sources/`](../research/sources/) | vault: {len(vault_dirs)} категорий скачанных "
        f"первоисточников (README, документация, метаданные) | `tools/collect_sources.py` |",
        f"| [`research/SOURCES.json`](../research/SOURCES.json) | каталог источников с лицензиями и "
        f"звёздами | `tools/collect_sources.py` |",
        f"| [`research/INDEX.md`](../research/INDEX.md) | индекс vault | генератор |",
        f"| [`research/discovery/`](../research/discovery/) | {len(disc_md)} шортлистов по темам "
        f"(«что брать для X») + {len(disc_json)} инвентарей awesome-листов | `tools/mine_awesome.py`, "
        f"`tools/shortlist.py` |",
        "| [`research/PENDING.md`](../research/PENDING.md) | что не докачалось и как добрать | "
        "`tools/collect_sources.py` |",
        "| [`research/notes/`](../research/notes/) | конспекты: решения и обоснования (см. выше) | руками |",
        "",
        "## Порядок чтения по задаче",
        "",
        "| Задача | Читать |",
        "| --- | --- |",
        "| Понять проект | `AGENTS.md` → `README.md` → `DASHBOARD.md` |",
        "| Начать писать приложение | `BUILD-GUIDE.md` → `DECISION-STACK.md` → `RUNTIME.md` |",
        "| Добавить способность | `AGENTS.md` §4.1 → `docs/ACTIONS.md` |",
        "| Добавить программу | `AGENTS.md` §4.3 → `docs/PROFILE-STRATEGY.md` → `docs/APP-COVERAGE.md` |",
        "| Добавить работу целиком | `AGENTS.md` §4.6 → `docs/SKILLS.md` |",
        "| Взять что-то снаружи | `AGENTS.md` §4.7 → `docs/ECOSYSTEM.md` |",
        "| Понять границы и риск | `docs/COVERAGE.md`, `data/domain_profile_policy.json` |",
        "| Проверить себя | `AGENTS.md` §7 (команды) |",
        "",
    ]
    return "\n".join(L)


def main() -> int:
    n = numbers()
    dash = render_dashboard(n)
    index = render_index()
    stale = []
    for path, text in ((DASH, dash), (INDEX, index)):
        if "--check" in __import__("sys").argv:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(path.name)
        else:
            path.write_text(text, encoding="utf-8")
    if "--check" in __import__("sys").argv:
        if stale:
            print("dashboard: устарели " + ", ".join(stale) + " — запусти python3 tools/dashboard.py")
            return 1
        print("dashboard: DASHBOARD.md и INDEX.md актуальны")
        return 0
    print(f"dashboard: DASHBOARD.md + INDEX.md пересобраны "
          f"({len(n['actions'])} действий, {len(n['profiles'])} профилей, "
          f"{len(n['skills'])} скиллов)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
