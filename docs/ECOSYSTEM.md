# Экосистема: что можно взять снаружи

Слово «добавь всё» разложено на десять каталогов. Каждая запись — **указатель на
реальную вещь** с происхождением: README репозитория, документация вендора, протокол
или строка нашего реестра. Ничего не выдумано: если записи нет в источнике, её нет здесь.

**Всего записей: 2633** · проверено и выбрано: **411** · кандидатов на разбор: **2222**

| Каталог | Записей | Выбрано | Кандидатов | Что это |
| --- | --- | --- | --- | --- |
| [`abilities.json`](../data/ecosystem/abilities.json) | 342 | 342 | 0 | Умения (из реестра действий) |
| [`agents.json`](../data/ecosystem/agents.json) | 211 | 0 | 211 | Агенты и фреймворки |
| [`assistants.json`](../data/ecosystem/assistants.json) | 200 | 49 | 151 | Помощники |
| [`connections.json`](../data/ecosystem/connections.json) | 253 | 0 | 253 | Подключения (каналы) |
| [`connectors.json`](../data/ecosystem/connectors.json) | 288 | 0 | 288 | Коннекторы (сервисы) |
| [`mcp-servers.json`](../data/ecosystem/mcp-servers.json) | 267 | 0 | 267 | MCP-серверы |
| [`models.json`](../data/ecosystem/models.json) | 389 | 0 | 389 | Модели |
| [`plugins.json`](../data/ecosystem/plugins.json) | 208 | 0 | 208 | Плагины и пакеты-расширения |
| [`skills.json`](../data/ecosystem/skills.json) | 245 | 20 | 225 | Навыки и скиллы |
| [`tools.json`](../data/ecosystem/tools.json) | 230 | 0 | 230 | Инструменты |

## Два статуса, и почему это важно

| Статус | Что значит | Можно ли на это опираться |
| --- | --- | --- |
| `candidate` | найдено в каталоге/списке, но не проверено руками | нет: это заявка, а не решение |
| `selected` | проверено и выбрано (умения, роли, наши скиллы) | да: на это можно ссылаться в плане |

Правило: **кандидат не становится инструментом оттого, что попал в таблицу.** Переход
`candidate → selected` — это отдельная работа: проверить лицензию, запуск на Windows,
наличие CLI/API, риск и способ проверки результата.

## Откуда что взято

| Источник | Что даёт | Записей |
| --- | --- | --- |
| `vault` | `research/` (1461 MCP-сервер, 347 Agent Skills, 96 агентов, 880 пакетов npm/PyPI) | 1141 |
| `curated` | списки по документации вендоров и протоколам (модели, коннекторы, каналы, приложения) | 1081 |
| `registry` | `data/actions.json` — наши действия, сгруппированные в умения | 342 |
| `zshelper` | наши скиллы и роли помощников | 69 |

## Каталоги

### Умения (из реестра действий) — 342

Распределение: `изменение` — 49, `проверка` — 49, `создание` — 46, `осмотр` — 45, `взаимодействие` — 36, `преобразование` — 28, `удаление` — 27, `автоматизация` — 27, `коммуникация` — 19, `решение` — 11, `обучение` — 5.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | apps-generic: взаимодействие | `взаимодействие` | 2 действий: до визуального агента, по элементу с проверкой | `selected` |
| 2 | apps-generic: изменение | `изменение` | 1 действий: профиль к новой версии | `selected` |
| 3 | apps-generic: осмотр | `осмотр` | 3 действий: UIA-дерево приложения, тип интерфейса, элемент по описанию | `selected` |
| 4 | apps-generic: проверка | `проверка` | 1 действий: что приложение открылось | `selected` |
| 5 | apps-generic: создание | `создание` | 3 действий: профиль приложения по UIA, траекторию действий пользователя, траекторию с проверками | `selected` |
| 6 | career: изменение | `изменение` | 1 действий: анкету и отклик | `selected` |
| 7 | career: коммуникация | `коммуникация` | 1 действий: работодателю на сообщение | `selected` |
| 8 | career: осмотр | `осмотр` | 4 действий: вакансии по требованиям и деньгам, вакансии по фильтрам, офферы, статусы откликов | `selected` |
| 9 | career: проверка | `проверка` | 1 действий: репутацию компании | `selected` |
| 10 | career: решение | `решение` | 1 действий: релокацию | `selected` |
| 11 | career: создание | `создание` | 6 действий: вопросы работодателю, документы для трудоустройства, ответы к интервью, портфолио, резюме под вакансию, сопр | `selected` |
| 12 | distribution: автоматизация | `автоматизация` | 1 действий: сборку и релиз в CI | `selected` |
| 13 | distribution: взаимодействие | `взаимодействие` | 1 действий: WebView2 Runtime молча | `selected` |
| 14 | distribution: изменение | `изменение` | 1 действий: канал обновлений | `selected` |
| 15 | distribution: коммуникация | `коммуникация` | 1 действий: релиз с манифестом | `selected` |
| 16 | distribution: проверка | `проверка` | 7 действий: наличие WebView2 Runtime, отсутствие секретов в бинарнике, подпись перед публикацией, релиз, совместимость W | `selected` |
| 17 | distribution: создание | `создание` | 4 действий: SBOM и аудит зависимостей, код, листинг в Store, установщик | `selected` |
| 18 | engineering-3d: автоматизация | `автоматизация` | 1 действий: за печатью | `selected` |
| 19 | engineering-3d: взаимодействие | `взаимодействие` | 2 действий: 3D из фото, на принтере | `selected` |
| 20 | engineering-3d: изменение | `изменение` | 2 действий: поддержки, принтер | `selected` |
| 21 | engineering-3d: осмотр | `осмотр` | 2 действий: версии модели, объём и вес | `selected` |
| 22 | engineering-3d: преобразование | `преобразование` | 2 действий: модель для 3D-печати, форматы | `selected` |
| 23 | engineering-3d: проверка | `проверка` | 1 действий: модель на прочность | `selected` |
| 24 | engineering-3d: создание | `создание` | 6 действий: BOM, деталь по описанию, инструкцию сборки, модель к печати, рендер, чертёж | `selected` |
| 25 | hardware-diag: автоматизация | `автоматизация` | 1 действий: за температурой 24-7 | `selected` |

…и ещё 317 в [`data/ecosystem/abilities.json`](../data/ecosystem/abilities.json).

### Агенты и фреймворки — 211

Распределение: `framework` — 173, `claude-code` — 38.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | Superpowers | `claude-code` | An agentic skills framework & software development methodology that works. | `candidate` |
| 2 | react | `framework` | The library for web and native user interfaces. | `candidate` |
| 3 | andrej-karpathy-skills | `claude-code` | A single CLAUDE.md file to improve Claude Code behavior, derived from Andrej Karpathy's observations on LLM coding pitfa | `candidate` |
| 4 | opencode | `framework` | The open source coding agent. | `candidate` |
| 5 | n8n | `framework` | Fair-code workflow automation platform with native AI capabilities. Combine visual building with custom code, self-host  | `candidate` |
| 6 | Agent Skills | `claude-code` | Public repository for Agent Skills | `candidate` |
| 7 | Auto-GPT | `framework` | AutoGPT is the vision of accessible AI for everyone, to use and to build on. Our mission is to provide the tools, so tha | `candidate` |
| 8 | AutoGPT | `framework` | AutoGPT is the vision of accessible AI for everyone, to use and to build on. Our mission is to provide the tools, so tha | `candidate` |
| 9 | dify | `framework` | Build Agentic workflows, RAG pipelines, with rich AI model and tool support on one collaborative workspace. Deploy on cl | `candidate` |
| 10 | langflow | `framework` | Langflow is a powerful tool for building and deploying AI-powered agents and workflows. | `candidate` |
| 11 | Anthropic PBC | `claude-code` | Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster  | `candidate` |
| 12 | langchain | `framework` | The agent engineering platform. | `candidate` |
| 13 | codex | `framework` | Lightweight coding agent that runs in your terminal | `candidate` |
| 14 | TypeScript | `framework` | TypeScript is a superset of JavaScript that compiles to clean JavaScript output. | `candidate` |
| 15 | gemini-cli | `framework` | An open-source AI agent that brings the power of Gemini directly into your terminal. | `candidate` |
| 16 | neovim | `framework` | Vim-fork focused on extensibility and usability | `candidate` |
| 17 | Archify | `claude-code` | Turn any idea, plan, or codebase into a beautiful interactive diagram. An agent skill for Claude Code, Codex, and more. | `candidate` |
| 18 | OpenDevin | `framework` | 🙌 OpenHands: AI-Driven Development | `candidate` |
| 19 | OpenHands | `framework` | 🙌 OpenHands: AI-Driven Development | `candidate` |
| 20 | uv | `framework` | An extremely fast Python package and project manager, written in Rust. | `candidate` |
| 21 | Learn Claude Code | `claude-code` | Bash is all you need - A nano claude code–like 「agent harness」, built from 0 to 1 | `candidate` |
| 22 | cline | `framework` | Autonomous coding agent as an SDK, IDE extension, or CLI assistant. | `candidate` |
| 23 | MetaGPT | `framework` | 🌟 The Multi-Agent Framework: First AI Software Company, Towards Natural Language Programming | `candidate` |
| 24 | open-interpreter | `framework` | A coding agent for open models like Kimi K3 and GLM 5.3 | `candidate` |
| 25 | open-interpreter | `framework` | A coding agent for open models like Kimi K3 and GLM 5.3 | `candidate` |

…и ещё 186 в [`data/ecosystem/agents.json`](../data/ecosystem/agents.json).

### Помощники — 200

Распределение: `zshelper-role` — 49, `mcp-client` — 34, `desktop-assistant` — 34, `builtin-copilot` — 31, `knowledge-tool` — 30, `voice` — 22.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | Помощник: apps-generic | `zshelper-role` | 10 действий: UIA-дерево приложения, до визуального агента, по элементу с проверкой, профиль к новой версии, профиль прил | `selected` |
| 2 | Помощник: career | `zshelper-role` | 14 действий: анкету и отклик, вакансии по требованиям и деньгам, вакансии по фильтрам, вопросы работодателю, документы д | `selected` |
| 3 | Помощник: distribution | `zshelper-role` | 15 действий: SBOM и аудит зависимостей, WebView2 Runtime молча, канал обновлений, код, листинг в Store, наличие WebView2 | `selected` |
| 4 | Помощник: engineering-3d | `zshelper-role` | 16 действий: 3D из фото, BOM, версии модели, деталь по описанию, за печатью, инструкцию сборки | `selected` |
| 5 | Помощник: hardware-diag | `zshelper-role` | 20 действий: FPS в игре, USB-порты, апгрейд, батарею, драйвер, железо с требованиями | `selected` |
| 6 | Помощник: health-daily | `zshelper-role` | 22 действий: анализы простым языком, аптеку с лекарством, врача рядом, встать и размяться, выписки в одну папку, график  | `selected` |
| 7 | Помощник: home-daily | `zshelper-role` | 15 действий: болезнь растения по фото, ветклинику и записать, график уборки, журнал дома, инструкцию по ремонту, корм и  | `selected` |
| 8 | Помощник: languages | `zshelper-role` | 14 действий: вслух с правильной интонацией, грамматику на примере, двуязычно, диалог с собеседником, контекст слов, ошиб | `selected` |
| 9 | Помощник: legal-docs | `zshelper-role` | 13 действий: архив с версиями и хэшами, бланк или заявление, две редакции договора, договор, договор и объяснить, догово | `selected` |
| 10 | Помощник: licensing | `zshelper-role` | 12 действий: водяной знак в экспорт, ключ, лицензию ключом, лицензию на новый ПК, лицензию офлайн, об аномалии активаций | `selected` |
| 11 | Помощник: music | `zshelper-role` | 15 действий: библиотеку по папкам, громкость альбома, дорожки в микс, дубликаты треков, идею голосом, качество библиотек | `selected` |
| 12 | Помощник: music-production | `zshelper-role` | 24 действий: MIDI в проект, бит (драм-паттерн), вокал, вокал по тексту, голос (только свой), громкость и пики | `selected` |
| 13 | Помощник: personal-finance | `zshelper-role` | 18 действий: баланс и последние операции, бюджет на месяц, выписку банка, данные для налоговой, категорию операции, кред | `selected` |
| 14 | Помощник: smart-home | `zshelper-role` | 16 действий: голосовой сценарий, детям, доступность устройств, за датчиками 24-7, замок/ворота, кофе по расписанию | `selected` |
| 15 | Помощник: travel | `zshelper-role` | 16 действий: анкету на визу, билет, билеты, билеты и брони, бюджет поездки, за изменением цены | `selected` |
| 16 | Помощник: video-production | `zshelper-role` | 21 действий: автоматически, в TikTok/Reels/Shorts, вертикальные нарезки, видео на другой язык, за комментариями 24-7, му | `selected` |
| 17 | Помощник: Автоматизация и скрипты | `zshelper-role` | 12 действий: вебхук-приёмник, всё, изменения, макрос приложения, пакет задач, расписание | `selected` |
| 18 | Помощник: Аудио и речь | `zshelper-role` | 21 действий: LUFS и true peak, воспроизведением, голос (клонирование), громкость, дорожки, микрофон | `selected` |
| 19 | Помощник: Базы данных | `zshelper-role` | 20 действий: SELECT, SQLite, БД, бэкап БД, данные, запрос | `selected` |
| 20 | Помощник: Безопасность и доступ | `zshelper-role` | 22 действий: брандмауэр, двухфакторную аутентификацию, диск/папку, запись в хранилище паролей, исключения антивируса, ис | `selected` |
| 21 | Помощник: Бизнес и финансы | `zshelper-role` | 19 действий: CRM-заметки, ИНН/ОГРН контрагента, КП/презентацию, акты сверки, денежный поток, документ по номеру | `selected` |
| 22 | Помощник: Ввод (мышь, клавиатура, буфер) | `zshelper-role` | 16 действий: буфер обмена, ввод на время, горячие клавиши, джойстиком/геймпадом, длинный текст, жесты тачпада | `selected` |
| 23 | Помощник: Веб и браузер | `zshelper-role` | 23 действий: в аккаунт, в поисковике, весь сайт/раздел, данные в таблицу, доступность сайта, и отправить | `selected` |
| 24 | Помощник: Видео | `zshelper-role` | 30 действий: в CapCut пошагово, в Premiere пошагово, в сервис, видео по запросу, видео с YouTube, виртуальную камеру | `selected` |
| 25 | Помощник: Виртуализация и удалённый доступ | `zshelper-role` | 15 действий: ВМ из снапшота, бэкап ВМ по расписанию, в WSL, виртуалку, доступность сервера, контейнер | `selected` |

…и ещё 175 в [`data/ecosystem/assistants.json`](../data/ecosystem/assistants.json).

### Подключения (каналы) — 253

Распределение: `windows-api` — 66, `network` — 30, `storage` — 23, `device` — 20, `iot` — 20, `auth` — 19, `media` — 16, `db` — 14, `messaging` — 14, `web` — 13, `remote` — 13, `rpc` — 5.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | .NET CLR hosting | `windows-api` | запуск .NET внутри процесса | `candidate` |
| 2 | 802.1X | `network` | аутентификация порта | `candidate` |
| 3 | AES67 | `media` | аудио-овер-IP | `candidate` |
| 4 | ALPC | `storage` | быстрый IPC Windows | `candidate` |
| 5 | AMQP 1.0 | `messaging` | очереди с подтверждениями | `candidate` |
| 6 | AMSI | `windows-api` | антивирусный интерфейс | `candidate` |
| 7 | API key | `auth` | простой ключ доступа | `candidate` |
| 8 | ARP | `network` | сопоставление IP и MAC | `candidate` |
| 9 | ASIO | `media` | низкая задержка аудио | `candidate` |
| 10 | AirPlay | `iot` | трансляция Apple | `candidate` |
| 11 | Alternate Data Streams | `storage` | потоки NTFS | `candidate` |
| 12 | AppLocker | `windows-api` | правила запуска | `candidate` |
| 13 | AppServiceConnection | `windows-api` | связь UWP и Win32 | `candidate` |
| 14 | Appx/MSIX API | `windows-api` | установка пакетов | `candidate` |
| 15 | Art-Net | `device` | DMX по сети | `candidate` |
| 16 | AsyncAPI | `web` | описание событийных API | `candidate` |
| 17 | Audio Device API | `windows-api` | устройства и громкость | `candidate` |
| 18 | Azure Blob API | `storage` | блоб-хранилище | `candidate` |
| 19 | BACnet | `iot` | здания и климат | `candidate` |
| 20 | BITS | `windows-api` | фоновая передача | `candidate` |
| 21 | BLE GATT | `device` | сервисы и характеристики BLE | `candidate` |
| 22 | Basic auth | `auth` | логин:пароль в base64 | `candidate` |
| 23 | BitLocker API | `windows-api` | шифрование диска | `candidate` |
| 24 | Bluetooth API | `windows-api` | спаривание и профили | `candidate` |
| 25 | Bluetooth Classic SPP | `device` | последовательный профиль | `candidate` |

…и ещё 228 в [`data/ecosystem/connections.json`](../data/ecosystem/connections.json).

### Коннекторы (сервисы) — 288

Распределение: `api` — 234, `protocol` — 25, `db` — 13, `com` — 6, `cli` — 5, `files` — 3, `web` — 2.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | 1С-ЭДО | `api` | ЭДО из 1С | `candidate` |
| 2 | 1С:Бухгалтерия | `com` | проводки и отчёты (чтение) | `candidate` |
| 3 | 2GIS | `api` | организации и маршруты | `candidate` |
| 4 | AWS | `api` | S3, EC2, Lambda | `candidate` |
| 5 | AcoustID | `api` | распознавание трека | `candidate` |
| 6 | Active Directory (LDAP) | `protocol` | пользователи и группы | `candidate` |
| 7 | Adobe Lightroom SDK | `api` | каталог и экспорт | `candidate` |
| 8 | Adobe Photoshop (UXP) | `api` | плагины и batch | `candidate` |
| 9 | Adobe Premiere (ExtendScript) | `api` | монтаж скриптом | `candidate` |
| 10 | Airtable | `api` | базы как приложение | `candidate` |
| 11 | Alice AI | `api` | модель Яндекса | `candidate` |
| 12 | Ansible | `cli` | конфигурация парка машин | `candidate` |
| 13 | Anthropic API | `api` | Claude | `candidate` |
| 14 | Anytype | `api` | локальные объекты и связи | `candidate` |
| 15 | Apple Music (MusicKit) | `api` | каталог и библиотека | `candidate` |
| 16 | Aqara | `api` | датчики Aqara | `candidate` |
| 17 | Azure | `api` | облако Microsoft | `candidate` |
| 18 | Azure Blob | `api` | блоб-хранилище | `candidate` |
| 19 | Azure DevOps | `api` | репозитории, пайплайны, work items | `candidate` |
| 20 | Azure OpenAI | `api` | модели OpenAI в Azure | `candidate` |
| 21 | BITS | `api` | фоновая передача файлов | `candidate` |
| 22 | Backblaze B2 | `api` | дешёвое облако | `candidate` |
| 23 | Bing Web Search | `api` | поиск Microsoft | `candidate` |
| 24 | Bitbucket | `api` | репозитории | `candidate` |
| 25 | Bluesky | `api` | посты в AT Protocol | `candidate` |

…и ещё 263 в [`data/ecosystem/connectors.json`](../data/ecosystem/connectors.json).

### MCP-серверы — 267

Распределение: `developer-tools` — 55, `communication` — 40, `databases` — 30, `cloud-platforms` — 30, `browser-automation` — 25, `coding-agents` — 20, `aggregators` — 15, `command-line` — 15, `code-execution` — 12, `data-platforms` — 11, `art-and-culture` — 6, `customer-data-platforms` — 4.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | DeusData/codebase-memory-mcp | `developer-tools` | Local code intelligence for developers and AI agents. Connect code, docs and infrastructure in a persistent graph, with  | `candidate` |
| 2 | lightpanda-io/browser | `browser-automation` | Lightpanda: the headless browser designed for AI and automation | `candidate` |
| 3 | agent-infra/mcp-server-browser | `browser-automation` | The Open-Source Multimodal AI Agent Stack: Connecting Cutting-Edge AI Models and Agent Infra | `candidate` |
| 4 | microsoft/playwright-mcp | `browser-automation` | Playwright MCP server | `candidate` |
| 5 | ahujasid/blender-mcp | `art-and-culture` | Community plugin to control Blender 3D with any LLM of your choice. Not affiliated with the official Blender Foundation. | `candidate` |
| 6 | oraios/serena | `coding-agents` | A powerful MCP toolkit for coding, providing semantic retrieval and editing capabilities - the IDE for your agent | `candidate` |
| 7 | eyaltoledano/claude-task-master | `developer-tools` | An AI-powered task-management system you can drop into Cursor, Lovable, Windsurf, Roo, and others. | `candidate` |
| 8 | googleapis/genai-toolbox | `databases` | MCP Toolbox for Databases is an open source MCP server for databases. | `candidate` |
| 9 | GLips/Figma-Context-MCP | `developer-tools` | MCP server to provide Figma layout information to AI coding agents like Cursor | `candidate` |
| 10 | seleniumbase/SeleniumBase | `browser-automation` | Browser automation, web scraping, and testing. CDP Mode provides a Stealthy Chromium instance that bypasses bot-detectio | `candidate` |
| 11 | elie222/inbox-zero | `communication` | The world's best AI personal assistant for email. Open source app to help you reach inbox zero fast. | `candidate` |
| 12 | get-convex/convex-backend | `databases` | The open-source reactive database for app developers | `candidate` |
| 13 | wonderwhy-er/DesktopCommanderMCP | `coding-agents` | This is MCP server for Claude that gives it terminal control, file system search and diff file editing capabilities | `candidate` |
| 14 | awslabs/mcp | `cloud-platforms` | Open source MCP Servers for AWS | `candidate` |
| 15 | nhost/nhost | `databases` | The Open Source Firebase Alternative with GraphQL. | `candidate` |
| 16 | idosal/git-mcp | `developer-tools` | Put an end to code hallucinations GitMCP is a free, open-source, remote MCP server for any GitHub project | `candidate` |
| 17 | repowise-dev/repowise | `developer-tools` | Codebase intelligence for AI and humans: code health scores, auto-generated docs, git analytics, dead code detection, an | `candidate` |
| 18 | firecrawl/firecrawl-mcp-server | `browser-automation` | Official Firecrawl MCP server, the context API for AI agents: search, scrape, and interact with the web, plus parse, cra | `candidate` |
| 19 | browsermcp/mcp | `browser-automation` | Browser MCP is a Model Context Provider MCP server that allows AI applications to control your browser | `candidate` |
| 20 | lharries/whatsapp-mcp | `communication` | WhatsApp MCP server | `candidate` |
| 21 | kucherenko/jscpd | `developer-tools` | Copy/paste detector for source code. 220+ languages, Rust engine, SARIF/HTML/badge reporters, GitHub Action, MCP server  | `candidate` |
| 22 | 21st-dev/Magic-MCP | `developer-tools` | It's like v0, but in your Cursor / Claude Code / Windsurf: search 10,000+ React/Tailwind components, generate new UI wit | `candidate` |
| 23 | Q00/ouroboros | `coding-agents` | Agent OS: the agent gets smarter on its own. We just hold the line: Interview-gated, staged evaluation, budgeted evoluti | `candidate` |
| 24 | bram2w/baserow | `databases` | Build databases, automations, apps & agents with AI — no code. Open source platform available on cloud and self-hosted.  | `candidate` |
| 25 | executeautomation/playwright-mcp-server | `browser-automation` | Playwright Model Context Protocol Server - Tool to automate Browsers and APIs in Claude Desktop, Cline, Cursor IDE and M | `candidate` |

…и ещё 242 в [`data/ecosystem/mcp-servers.json`](../data/ecosystem/mcp-servers.json).

### Модели — 389

Распределение: `llm` — 97, `vlm` — 39, `asr` — 30, `tts` — 30, `code` — 24, `image` — 21, `embed` — 20, `ocr` — 17, `video` — 12, `music` — 9, `rerank` — 9, `detect` — 9.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | ace-step | `music` | быстрая генерация треков | `candidate` |
| 2 | all-minilm-l6-v2 | `embed` | самый быстрый | `candidate` |
| 3 | all-mpnet-base-v2 | `embed` | базовый | `candidate` |
| 4 | alma-7b | `translate` | перевод | `candidate` |
| 5 | animatediff | `video` | анимация | `candidate` |
| 6 | answerai-colbert-small | `rerank` | крошечный | `candidate` |
| 7 | apertus-8b | `llm` | прозрачный | `candidate` |
| 8 | arc2face | `face` | лицо по эмбеддингу | `candidate` |
| 9 | aria | `vlm` | мультимодальный | `candidate` |
| 10 | audiogen-medium | `music` | звуковые эффекты | `candidate` |
| 11 | aya-expanse-32b | `llm` | многоязычный | `candidate` |
| 12 | aya-expanse-8b | `llm` | 23 языка | `candidate` |
| 13 | bamba-9b | `llm` | гибрид | `candidate` |
| 14 | bark | `tts` | эмоции, но нестабильный | `candidate` |
| 15 | bge-large-en-v1.5 | `embed` | английский | `candidate` |
| 16 | bge-m3 | `embed` | мультиязычный, hybrid | `candidate` |
| 17 | bge-reranker-base | `rerank` | базовый | `candidate` |
| 18 | bge-reranker-v2-m3 | `rerank` | мультиязычный реранкер | `candidate` |
| 19 | bge-small-en-v1.5 | `embed` | быстрый | `candidate` |
| 20 | bigvgan | `tts` | вокодер 44 кГц | `candidate` |
| 21 | birefnet | `matting` | лучший фон-маттинг | `candidate` |
| 22 | bitnet-b1.58-2b4t | `llm` | 1-битные веса | `candidate` |
| 23 | blip-2 | `vlm` | историческая | `candidate` |
| 24 | canary-1b | `asr` | ASR+перевод EN/DE/ES/FR | `candidate` |
| 25 | chatterbox | `tts` | клон голоса с согласия | `candidate` |

…и ещё 364 в [`data/ecosystem/models.json`](../data/ecosystem/models.json).

### Плагины и пакеты-расширения — 208

Распределение: `npm-package` — 124, `pypi-package` — 46, `claude-code-plugin` — 38.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | Superpowers | `claude-code-plugin` | An agentic skills framework & software development methodology that works. | `candidate` |
| 2 | andrej-karpathy-skills | `claude-code-plugin` | A single CLAUDE.md file to improve Claude Code behavior, derived from Andrej Karpathy's observations on LLM coding pitfa | `candidate` |
| 3 | Agent Skills | `claude-code-plugin` | Public repository for Agent Skills | `candidate` |
| 4 | Anthropic PBC | `claude-code-plugin` | Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster  | `candidate` |
| 5 | Archify | `claude-code-plugin` | Turn any idea, plan, or codebase into a beautiful interactive diagram. An agent skill for Claude Code, Codex, and more. | `candidate` |
| 6 | Learn Claude Code | `claude-code-plugin` | Bash is all you need - A nano claude code–like 「agent harness」, built from 0 to 1 | `candidate` |
| 7 | Claude Scientific Skills | `claude-code-plugin` | Turn any AI agent into an AI Scientist. The 1 Agent Skills library for science, used by 250,000+ scientists worldwide. 1 | `candidate` |
| 8 | claude-howto | `claude-code-plugin` | A visual, example-driven guide to Claude Code — from basic concepts to advanced agents, with copy-paste templates that b | `candidate` |
| 9 | Official Plugin Directory | `claude-code-plugin` | Official, Anthropic-managed directory of high quality Claude Code Plugins. | `candidate` |
| 10 | Claude Code System Prompts | `claude-code-plugin` | All parts of Claude Code's system prompt, 27 builtin tool descriptions, sub agent prompts Plan/Explore/Task , utility pr | `candidate` |
| 11 | Claude Code GitHub Action | `claude-code-plugin` | by Anthropic - The official GitHub Action for running Claude Code in CI: mention @claude in issues and pull requests to  | `candidate` |
| 12 | Claude Code Security Review | `claude-code-plugin` | An AI-powered security review GitHub Action using Claude to analyze code changes for security vulnerabilities. | `candidate` |
| 13 | Codebase to Course | `claude-code-plugin` | A Claude Code skill that turns any codebase into a beautiful, interactive single-page HTML course for non-technical vibe | `candidate` |
| 14 | LinkedIn Skills | `claude-code-plugin` | Claude skills for LinkedIn. 12 Claude Code and Codex skills that write human-sounding LinkedIn posts, craft comments tha | `candidate` |
| 15 | Claude Code Guide | `claude-code-plugin` | Claude Code Guide - Setup, Commands, workflows, agents, skills & tips-n-tricks from beginner to power user | `candidate` |
| 16 | Container Use | `claude-code-plugin` | Development environments for coding agents. Enable multiple agents to work safely and independently with your preferred  | `candidate` |
| 17 | Claude Code: Everything You Need to Know | `claude-code-plugin` | Claude Code guide in three levels, Beginner to Advanced: hands-on lessons with checked exercises, every volatile fact ci | `candidate` |
| 18 | terraform-skill | `claude-code-plugin` | Terraform & OpenTofu Skill for AI Agents - testing, modules, CI/CD, and production patterns | `candidate` |
| 19 | Dive into Claude Code | `claude-code-plugin` | A Systematic Analysis and Discussion of Claude Code for Designing Today's and Future AI Agent Systems | `candidate` |
| 20 | Context Engineering Kit | `claude-code-plugin` | Hand-crafted Claude Code Skills focused on improving agent results quality. Compatible with OpenCode, Cursor, Antigravit | `candidate` |
| 21 | cc-thinking-skills | `claude-code-plugin` | 28 eval-informed mental models and critical-thinking skills for Claude Code, GitHub Copilot, Codex, Cursor, and other Ag | `candidate` |
| 22 | capcut-cli | `claude-code-plugin` | Independent, unofficial CLI to edit CapCut and JianYing 剪映 projects — subtitles, timing, speed, volume, templates, cut l | `candidate` |
| 23 | Claude Code Repos Index | `claude-code-plugin` | An index of my Claude Code related repos including a wide variety of starter templates for using Claude Code for common  | `candidate` |
| 24 | OrcaReplay | `claude-code-plugin` | OrcaReplay — Time travel for AI agents. Record, replay, fork, and debug any agent run with any model. Built by the OrcaR | `candidate` |
| 25 | learn-faster-kit | `claude-code-plugin` | AI-powered learning coach with spaced repetition with Claude Code - master any knowledge faster with personalized syllab | `candidate` |

…и ещё 183 в [`data/ecosystem/plugins.json`](../data/ecosystem/plugins.json).

### Навыки и скиллы — 245

Распределение: `agent-skill` — 225, `zshelper-recipe` — 20.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | Вести дневник самочувствия | `zshelper-recipe` | ежедневные записи → графики → разбор анализов → пакет для врача. Никаких назначений и доз. | `selected` |
| 2 | Выставить счёт и проверить оплату | `zshelper-recipe` | реквизиты → счёт → отправка человеком → реестр → сверка оплаты. Деньги не двигаются: оплату делает человек в банке. | `selected` |
| 3 | Исследовать вопрос и написать отчёт | `zshelper-recipe` | вопрос → источники → проверка фактов → текст с ссылками. Без выдуманных источников и цифр. | `selected` |
| 4 | Найти и сравнить варианты в вебе | `zshelper-recipe` | поиск → чтение → таблица → сравнение с оговорками → сохранение доказательств. Ничего не покупается и не отправляется. | `selected` |
| 5 | Написать и сдать курсовую | `zshelper-recipe` | от методички до собранного PDF. Отправку в вуз делает человек. | `selected` |
| 6 | Настроить бэкап по правилу 3-2-1 | `zshelper-recipe` | три копии, два носителя, одна вне машины — с проверкой восстановления, а не «файлы скопированы». | `selected` |
| 7 | Откликнуться на вакансию | `zshelper-recipe` | поиск → сравнение → резюме и письмо → отклик человеком → трекинг. | `selected` |
| 8 | Перевести документ и проверить перевод | `zshelper-recipe` | извлечь текст → глоссарий → перевод → сверка чисел и терминов → PDF/озвучка. | `selected` |
| 9 | Подвести итоги недели | `zshelper-recipe` | календарь, почта, файлы → заметка недели → план следующей. Ничего не удаляется и не отменяется без подтверждения. | `selected` |
| 10 | Подготовиться к экзамену | `zshelper-recipe` | план → материалы → карточки → тренировка → проверка знаний → расписание повторений. | `selected` |
| 11 | Привести систему в порядок | `zshelper-recipe` | диагностика → безопасная чистка → проверка результата числами. Ничего личного не удаляется без списка на подтверждение. | `selected` |
| 12 | Проверить безопасность аккаунтов | `zshelper-recipe` | угрозы → обновления → утечки → пароли → 2FA → сессии → резервные коды. Пароли не показываются в логах. | `selected` |
| 13 | Разобрать завалы в папке | `zshelper-recipe` | инвентаризация → дубли → правила → сортировка → удаление по подтверждённому списку. | `selected` |
| 14 | Разобрать музыкальную библиотеку | `zshelper-recipe` | инвентаризация → дубли → теги → громкость → плейлисты. Файлы не удаляются без подтверждённого списка. | `selected` |
| 15 | Разобрать почту до нуля | `zshelper-recipe` | входящие → классификация → проверка на опасное → черновики ответов → задачи из писем. Отправляет и удаляет человек. | `selected` |
| 16 | Разобрать фотоархив | `zshelper-recipe` | инвентаризация → дубли → сортировка по датам → метаданные. Удаление только по подтверждённому списку. | `selected` |
| 17 | Сделать трек | `zshelper-recipe` | от референса до мастер-файла. Публикация и дистрибуция — отдельный шаг с подтверждением человеком. | `selected` |
| 18 | Смонтировать и опубликовать ролик | `zshelper-recipe` | монтаж → проверка параметров → черновик публикации. Кнопку «Опубликовать» нажимает человек. | `selected` |
| 19 | Собрать рабочее место | `zshelper-recipe` | запуск нужных программ, раскладка окон по мониторам, хоткеи. Без изменения файлов проекта. | `selected` |
| 20 | Спланировать поездку | `zshelper-recipe` | документы → варианты → маршрут → бюджет → чеклист → напоминания. Билеты и отели не покупаются. | `selected` |
| 21 | morluto/rea | `agent-skill` | Reverse engineer anything with agents, from app behavior down to native binaries. | `candidate` |
| 22 | mattpocock/skills | `agent-skill` | Skills for Real Engineers. Straight from my .agents directory. | `candidate` |
| 23 | obra/brainstorming | `agent-skill` | An agentic skills framework & software development methodology that works. | `candidate` |
| 24 | nextlevelbuilder/ui-ux-pro-max-skill | `agent-skill` | An AI skill that provides design intelligence for building professional UI/UX across multiple platforms. | `candidate` |
| 25 | thedotmack/claude-mem | `agent-skill` | Persistent Context Across Sessions for Every Agent – Captures everything your agent does during sessions, compresses it  | `candidate` |

…и ещё 220 в [`data/ecosystem/skills.json`](../data/ecosystem/skills.json).

### Инструменты — 230

Распределение: `github-tool` — 219, `npm-cli` — 11.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | yt-dlp | `github-tool` | A feature-rich command-line audio/video downloader | `candidate` |
| 2 | markitdown | `github-tool` | Python tool for converting files and office documents to Markdown. | `candidate` |
| 3 | ollama | `github-tool` | Get up and running with Kimi, GLM, MiniMax, DeepSeek, gpt-oss, Qwen, Gemma and other models. | `candidate` |
| 4 | transformers | `github-tool` | 🤗 Transformers: the model-definition framework for state-of-the-art machine learning models in text, vision, audio, and  | `candidate` |
| 5 | open-webui | `github-tool` | User-friendly AI Interface Supports Ollama, OpenAI API, ... | `candidate` |
| 6 | scrcpy | `github-tool` | Display and control your Android device | `candidate` |
| 7 | PowerToys | `github-tool` | Microsoft PowerToys is a collection of utilities that supercharge productivity and customization on Windows | `candidate` |
| 8 | llama.cpp | `github-tool` | LLM inference in C/C++ | `candidate` |
| 9 | rustdesk | `github-tool` | An open-source remote desktop application designed for self-hosting, as an alternative to TeamViewer. | `candidate` |
| 10 | terminal | `github-tool` | The new Windows Terminal and the original Windows console host, all in the same place | `candidate` |
| 11 | pytorch | `github-tool` | Tensors and Dynamic neural networks in Python with strong GPU acceleration | `candidate` |
| 12 | vllm | `github-tool` | A high-throughput and memory-efficient inference and serving engine for LLMs | `candidate` |
| 13 | Stirling-PDF | `github-tool` | 1 PDF Application on GitHub that lets you edit PDFs on any device anywhere | `candidate` |
| 14 | PaddleOCR | `github-tool` | Turn any PDF or image document into structured data for your AI. A powerful, lightweight OCR toolkit that bridges the ga | `candidate` |
| 15 | core | `github-tool` | Open source home automation that puts local control and privacy first. | `candidate` |
| 16 | opencv | `github-tool` | Open Source Computer Vision Library | `candidate` |
| 17 | unsloth | `github-tool` | Local UI to run and train LLMs and diffusion models. Supports GGUF, MLX, Qwen3.8, DeepSeek-V4.1, MiniMax-H3, Gemma 4, FL | `candidate` |
| 18 | obs-studio | `github-tool` | OBS Studio - Free and open source software for live streaming and screen recording | `candidate` |
| 19 | tesseract | `github-tool` | Tesseract Open Source OCR Engine main repository | `candidate` |
| 20 | gpt4all | `github-tool` | GPT4All: Run Local LLMs on Any Device. Open-source and available for commercial use. | `candidate` |
| 21 | remotion | `github-tool` | 🎥 Make videos programmatically with React | `candidate` |
| 22 | ansible | `github-tool` | Ansible is a radically simple IT automation platform that makes your applications and systems easier to deploy and maint | `candidate` |
| 23 | docling | `github-tool` | Get your documents ready for gen AI | `candidate` |
| 24 | anything-llm | `github-tool` | Stop renting your intelligence. Own it with AnythingLLM. Everything you need for a powerful local-first agent experience | `candidate` |
| 25 | FFmpeg | `github-tool` | Mirror of | `candidate` |

…и ещё 205 в [`data/ecosystem/tools.json`](../data/ecosystem/tools.json).

## Лицензии

Без указанной лицензии: **74** записей (`agents` — 16, `mcp-servers` — 13, `plugins` — 32, `skills` — 13).

Правило проекта прежнее: берём только бесплатное и открытое; платное — как альтернатива
с пометкой. Для записей без лицензии это **неизвестно, а не «можно»** — до проверки они
остаются кандидатами.

## Как это связано с остальными артефактами

| Слой | Файл | Отвечает на вопрос |
| --- | --- | --- |
| Экосистема | `data/ecosystem/*.json` | «что вообще существует снаружи и стоит ли смотреть» |
| Реестр | `data/actions.psv` | «что умеем мы сами» |
| Профили | `data/profiles/*.json` | «как это в конкретной программе» |
| Скиллы | `data/skills/*.json` | «как из этого получается работа» |

Порядок пополнения: **нашли в экосистеме → проверили (лицензия, Windows, канал, риск) →
описали строкой реестра → сделали профиль/скилл.** Каталог экосистемы не заменяет
реестр: десять тысяч MCP-серверов не делают ассистента, который умеет работать.

## Обновление

```bash
python3 tools/build_ecosystem.py   # пересобирает каталоги из research/ и _curated/
python3 tools/ecosystem.py         # проверяет инварианты и рендерит этот файл
```
