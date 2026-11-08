# Research Vault — ZShelper

Здесь лежит **вся исследовательская база** проекта: скачанные первоисточники + собственные
конспекты, на которые опираются архитектурные решения.

> Правило: **агент не ходит в интернет за фактом, который уже есть в vault.**
> Сначала `grep`/`rg` по `research/`, потом сеть.

---

## Что где лежит

```
research/
├── README.md            ← вы здесь: как пользоваться
├── INDEX.md             ← автогенерируемый каталог всех скачанных источников
├── PENDING.md           ← что ещё не докачано (GitHub-часть, если сеть падала)
├── SOURCES.json          ← тот же каталог в машиночитаемом виде
├── notes/               ← ЧЕЛОВЕКОЧИТАЕМЫЕ конспекты по темам (главное!)
│   └── 00…27            ← включая «любое железо» (17), карту способностей (18),
│                            курсовые (19), саморасширение (20), разбор системы (21),
│                            обновления (22), настройки (23)
├── sources/             ← скачанные первоисточники (README репозиториев, docs, метаданные)
│   ├── <категория>/<owner>__<repo>/README.md + source.json
│   ├── <категория>/pypi__<pkg>.md
│   ├── <категория>/npm__<pkg>.md
│   └── _errors.log       ← что не скачалось и почему (404/лицензия/сеть)
└── discovery/           ← найденное автоматически, ещё не разобранное
    ├── <запрос>.md        ← результаты GitHub-поиска по 30 запросам
    ├── mcp-servers.md     ← инвентаризация ~1470 MCP-серверов с категориями и звёздами
    ├── shortlist.md       ← то же, разложенное по нашим 9 доменам способностей
    └── _repo_cache.json   ← кэш метаданных GitHub (не перекачивать заново)
```

## Конспекты (читать в этом порядке)

| # | Файл | О чём |
|---|------|-------|
| 00 | [`notes/00-vision.md`](notes/00-vision.md) | Что такое ZShelper, границы продукта, принципы |
| 01 | [`notes/01-architecture.md`](notes/01-architecture.md) | Процессы, слои, IPC, шина событий, хранилище |
| 02 | [`notes/02-hardware-profiler.md`](notes/02-hardware-profiler.md) | Как определить железо и подобрать бюджеты |
| 03 | [`notes/03-model-catalog.md`](notes/03-model-catalog.md) | Каталог моделей по ролям + размеры/кванты |
| 04 | [`notes/04-runtimes.md`](notes/04-runtimes.md) | llama.cpp / ONNX / OpenVINO / Foundry Local / Ollama |
| 05 | [`notes/05-voice.md`](notes/05-voice.md) | Wake word, VAD, ASR, TTS, barge-in, duplex |
| 06 | [`notes/06-orchestrator.md`](notes/06-orchestrator.md) | Планировщик, скиллы, роутинг моделей, state machine |
| 07 | [`notes/07-tools-mcp.md`](notes/07-tools-mcp.md) | MCP 2026-07-28, реестр инструментов, sandbox |
| 08 | [`notes/08-eyes-desktop.md`](notes/08-eyes-desktop.md) | Скриншот, UIA-дерево, OCR, grounding, действия |
| 09 | [`notes/09-coding-agent.md`](notes/09-coding-agent.md) | Длинные кодинг-сессии, repo map, тесты, git |
| 10 | [`notes/10-safety.md`](notes/10-safety.md) | Политики, подтверждения, undo, аудит, Telegram |
| 11 | [`notes/11-memory.md`](notes/11-memory.md) | Эпизодическая/семантическая память, RAG, граф |
| 12 | [`notes/12-connectors.md`](notes/12-connectors.md) | Google, Telegram, Notion, почта, календарь, HA |
| 13 | [`notes/13-ux.md`](notes/13-ux.md) | Окно, оверлей, палитра команд, дизайн-система |
| 14 | [`notes/14-packaging-ci.md`](notes/14-packaging-ci.md) | Сборка, подпись, автообновление, GitHub Actions |
| 15 | [`notes/15-evals.md`](notes/15-evals.md) | Как измерять качество и не врать себе |
| 16 | [`notes/16-open-questions.md`](notes/16-open-questions.md) | Журнал решений и открытых вопросов |
| 17 | [`notes/17-any-hardware.md`](notes/17-any-hardware.md) | **Оптимизация под любое железо**: физика, 14 рычагов, конфиги T0–T3, ловушки Windows |
| 18 | [`notes/18-capability-map.md`](notes/18-capability-map.md) | **Карта способностей**: «умеет всё» с границами, рисками и tier'ами |
| 19 | [`notes/19-academic-writing.md`](notes/19-academic-writing.md) | Курсовая/диплом: методичка → источники → Word «по абзацам» → проверки |
| 20 | [`notes/20-self-extension.md`](notes/20-self-extension.md) | Самообучение: синтез скиллов, поиск и установка MCP, безопасность цепочки |
| 21 | [`notes/21-system-triage.md`](notes/21-system-triage.md) | «Что грузит ПК», службы, оптимизация, поиск двойников, откат |
| 22 | [`notes/22-updates.md`](notes/22-updates.md) | Обновления через GitHub: каналы, rollout, подпись, откат |
| 23 | [`notes/23-configuration.md`](notes/23-configuration.md) | «Всё настраивается»: settings-as-schema, карта параметров, пресеты |
| 24 | [`notes/24-action-taxonomy.md`](notes/24-action-taxonomy.md) | **Таксономия действий**: 562 действия / 40 доменов — реестр «умеет всё» |
| 25 | [`notes/25-app-profiles.md`](notes/25-app-profiles.md) | Слой «как именно»: профили приложений, якоря, проверки, дрейф интерфейса |
| 26 | [`notes/26-new-domains.md`](notes/26-new-domains.md) | Музыка, фото/OCR, финансы, юридика, дом и IoT: стек, границы, риски |
| 27 | [`notes/27-career-security-devices.md`](notes/27-career-security-devices.md) | Карьера, 2FA/утечки, устройства и сеть, макросы: расширение с границами |

## Как пополнять

```bash
# 1. Добавить репозиторий/пакет: впишите его в tools/sources.json в нужную категорию
# 2. Скачать (идемпотентно, кэш по файлам):
GITHUB_TOKEN=$GH_TOKEN python3 tools/collect_sources.py fetch --category voice
# 3. Автопоиск нового по 30 запросам:
GITHUB_TOKEN=$GH_TOKEN python3 tools/collect_sources.py discover
# 4. Разобрать awesome-лист в инвентаризацию:
GITHUB_TOKEN=$GH_TOKEN python3 tools/mine_awesome.py \
    research/sources/mcp-and-tools/punkpeye__awesome-mcp-servers/README.md --name mcp-servers
# 5. Пересобрать шортлист по доменам и индекс:
python3 tools/shortlist.py && python3 tools/collect_sources.py index
```

## Правила гигиены

1. **Лицензии.** В `source.json` каждого репозитория есть `license`. В прод берём только
   MIT / Apache-2.0 / BSD / ISC / MPL-2.0. GPL/AGPL — только как отдельный процесс по
   желанию пользователя, не линкуем в бандл. «NOASSERTION» = читать LICENSE руками.
2. **Архивные репозитории** помечены `"archived": true` — не тащим в зависимости.
3. **Дата.** Любой факт живёт максимум ~6 месяцев; `pushed_at` в источнике — маркер свежести.
   При сомнении перепроверяем через `discover`.
4. **Никакого мусора в git.** Модели, веса, бинарники — в `.gitignore` и в `models/` локально,
   в репозиторий попадают только манифесты и скрипты скачивания.
5. **Цитата важнее ссылки.** В конспектах рядом с утверждением — путь до файла в `sources/`,
   чтобы следующая сессия могла проверить, а не поверить.
