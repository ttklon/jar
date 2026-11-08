# Экосистема: что можно взять снаружи

Слово «добавь всё» разложено на десять каталогов. Каждая запись — **указатель на
реальную вещь** с происхождением: README репозитория, документация вендора, протокол
или строка нашего реестра. Ничего не выдумано: если записи нет в источнике, её нет здесь.

**Всего записей: 4915** · проверено и выбрано: **721** · кандидатов на разбор: **4194**

| Каталог | Записей | Выбрано | Кандидатов | Что это |
| --- | --- | --- | --- | --- |
| [`abilities.json`](../data/ecosystem/abilities.json) | 652 | 652 | 0 | Умения (из реестра действий) |
| [`agents.json`](../data/ecosystem/agents.json) | 375 | 0 | 375 | Агенты и фреймворки |
| [`assistants.json`](../data/ecosystem/assistants.json) | 225 | 49 | 176 | Помощники |
| [`connections.json`](../data/ecosystem/connections.json) | 304 | 0 | 304 | Подключения (каналы) |
| [`connectors.json`](../data/ecosystem/connectors.json) | 384 | 0 | 384 | Коннекторы (сервисы) |
| [`mcp-servers.json`](../data/ecosystem/mcp-servers.json) | 900 | 0 | 900 | MCP-серверы |
| [`models.json`](../data/ecosystem/models.json) | 531 | 0 | 531 | Модели |
| [`plugins.json`](../data/ecosystem/plugins.json) | 560 | 0 | 560 | Плагины и пакеты-расширения |
| [`skills.json`](../data/ecosystem/skills.json) | 364 | 20 | 344 | Навыки и скиллы |
| [`tools.json`](../data/ecosystem/tools.json) | 620 | 0 | 620 | Инструменты |

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
| `vault` | `research/` (1461 MCP-сервер, 347 Agent Skills, 96 агентов, 880 пакетов npm/PyPI) | 2799 |
| `curated` | списки по документации вендоров и протоколам (модели, коннекторы, каналы, приложения) | 1395 |
| `registry` | `data/actions.json` — наши действия, сгруппированные в умения | 652 |
| `zshelper` | наши скиллы и роли помощников | 69 |

## Каталоги

### Умения (из реестра действий) — 652

Распределение: `создание` — 116, `осмотр` — 113, `изменение` — 103, `взаимодействие` — 79, `преобразование` — 69, `проверка` — 60, `удаление` — 37, `автоматизация` — 27, `коммуникация` — 26, `решение` — 13, `обучение` — 9.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | apps-generic: адаптировать | `изменение` | 1 действий: профиль к новой версии | `selected` |
| 2 | apps-generic: воспроизвести | `создание` | 1 действий: траекторию с проверками | `selected` |
| 3 | apps-generic: деградировать | `взаимодействие` | 1 действий: до визуального агента | `selected` |
| 4 | apps-generic: записать | `создание` | 1 действий: траекторию действий пользователя | `selected` |
| 5 | apps-generic: кликнуть | `взаимодействие` | 1 действий: по элементу с проверкой | `selected` |
| 6 | apps-generic: найти | `осмотр` | 1 действий: элемент по описанию | `selected` |
| 7 | apps-generic: определить | `осмотр` | 1 действий: тип интерфейса | `selected` |
| 8 | apps-generic: проверить | `проверка` | 1 действий: что приложение открылось | `selected` |
| 9 | apps-generic: сгенерировать | `создание` | 1 действий: профиль приложения по UIA | `selected` |
| 10 | apps-generic: снять | `осмотр` | 1 действий: UIA-дерево приложения | `selected` |
| 11 | career: заполнить | `изменение` | 1 действий: анкету и отклик | `selected` |
| 12 | career: найти | `осмотр` | 1 действий: вакансии по фильтрам | `selected` |
| 13 | career: написать | `создание` | 1 действий: резюме под вакансию | `selected` |
| 14 | career: ответить | `коммуникация` | 1 действий: работодателю на сообщение | `selected` |
| 15 | career: отследить | `осмотр` | 1 действий: статусы откликов | `selected` |
| 16 | career: подготовить | `создание` | 3 действий: вопросы работодателю, ответы к интервью, сопроводительное письмо | `selected` |
| 17 | career: проверить | `проверка` | 1 действий: репутацию компании | `selected` |
| 18 | career: собрать | `создание` | 2 действий: документы для трудоустройства, портфолио | `selected` |
| 19 | career: спланировать | `решение` | 1 действий: релокацию | `selected` |
| 20 | career: сравнить | `осмотр` | 2 действий: вакансии по требованиям и деньгам, офферы | `selected` |
| 21 | distribution: автоматизировать | `автоматизация` | 1 действий: сборку и релиз в CI | `selected` |
| 22 | distribution: настроить | `изменение` | 1 действий: канал обновлений | `selected` |
| 23 | distribution: опубликовать | `коммуникация` | 1 действий: релиз с манифестом | `selected` |
| 24 | distribution: откатить | `проверка` | 1 действий: релиз | `selected` |
| 25 | distribution: подготовить | `создание` | 1 действий: листинг в Store | `selected` |

…и ещё 627 в [`data/ecosystem/abilities.json`](../data/ecosystem/abilities.json).

### Агенты и фреймворки — 375

Распределение: `framework` — 337, `claude-code` — 38.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | Superpowers | `claude-code` | An agentic skills framework & software development methodology that works. | `candidate` |
| 2 | react | `framework` | The library for web and native user interfaces. | `candidate` |
| 3 | andrej-karpathy-skills | `claude-code` | A single CLAUDE.md file to improve Claude Code behavior, derived from Andrej Karpathy's observations on LLM coding pitfa | `candidate` |
| 4 | opencode | `framework` | The open source coding agent. | `candidate` |
| 5 | n8n | `framework` | Fair-code workflow automation platform with native AI capabilities. Combine visual building with custom code, self-host  | `candidate` |
| 6 | yt-dlp | `framework` | A feature-rich command-line audio/video downloader | `candidate` |
| 7 | Agent Skills | `claude-code` | Public repository for Agent Skills | `candidate` |
| 8 | Auto-GPT | `framework` | AutoGPT is the vision of accessible AI for everyone, to use and to build on. Our mission is to provide the tools, so tha | `candidate` |
| 9 | AutoGPT | `framework` | AutoGPT is the vision of accessible AI for everyone, to use and to build on. Our mission is to provide the tools, so tha | `candidate` |
| 10 | ollama | `framework` | Get up and running with Kimi, GLM, MiniMax, DeepSeek, gpt-oss, Qwen, Gemma and other models. | `candidate` |
| 11 | transformers | `framework` | 🤗 Transformers: the model-definition framework for state-of-the-art machine learning models in text, vision, audio, and  | `candidate` |
| 12 | dify | `framework` | Build Agentic workflows, RAG pipelines, with rich AI model and tool support on one collaborative workspace. Deploy on cl | `candidate` |
| 13 | open-webui | `framework` | User-friendly AI Interface Supports Ollama, OpenAI API, ... | `candidate` |
| 14 | langflow | `framework` | Langflow is a powerful tool for building and deploying AI-powered agents and workflows. | `candidate` |
| 15 | Anthropic PBC | `claude-code` | Claude Code is an agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster  | `candidate` |
| 16 | langchain | `framework` | The agent engineering platform. | `candidate` |
| 17 | awesome-llm-apps | `framework` | 100+ AI Agents, Agent Skills and RAG Apps - Free and Open Source. | `candidate` |
| 18 | llama.cpp | `framework` | LLM inference in C/C++ | `candidate` |
| 19 | codex | `framework` | Lightweight coding agent that runs in your terminal | `candidate` |
| 20 | TypeScript | `framework` | TypeScript is a superset of JavaScript that compiles to clean JavaScript output. | `candidate` |
| 21 | gemini-cli | `framework` | An open-source AI agent that brings the power of Gemini directly into your terminal. | `candidate` |
| 22 | neovim | `framework` | Vim-fork focused on extensibility and usability | `candidate` |
| 23 | playwright | `framework` | Playwright is a framework for Web Testing and Automation. It allows testing Chromium, Firefox and WebKit with a single A | `candidate` |
| 24 | awesome-mcp-servers | `framework` | A collection of MCP servers. | `candidate` |
| 25 | vllm | `framework` | A high-throughput and memory-efficient inference and serving engine for LLMs | `candidate` |

…и ещё 350 в [`data/ecosystem/agents.json`](../data/ecosystem/agents.json).

### Помощники — 225

Распределение: `zshelper-role` — 49, `mcp-client` — 48, `desktop-assistant` — 38, `builtin-copilot` — 38, `knowledge-tool` — 30, `voice` — 22.

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

…и ещё 200 в [`data/ecosystem/assistants.json`](../data/ecosystem/assistants.json).

### Подключения (каналы) — 304

Распределение: `windows-api` — 66, `network` — 45, `auth` — 36, `iot` — 32, `storage` — 25, `device` — 22, `web` — 16, `media` — 16, `db` — 14, `messaging` — 14, `remote` — 13, `rpc` — 5.

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
| 20 | BACnet/IP | `iot` | здания | `candidate` |
| 21 | BGP | `network` | маршрутизация между сетями | `candidate` |
| 22 | BITS | `windows-api` | фоновая передача | `candidate` |
| 23 | BLE GATT | `device` | сервисы и характеристики BLE | `candidate` |
| 24 | Basic auth | `auth` | логин:пароль в base64 | `candidate` |
| 25 | BitLocker API | `windows-api` | шифрование диска | `candidate` |

…и ещё 279 в [`data/ecosystem/connections.json`](../data/ecosystem/connections.json).

### Коннекторы (сервисы) — 384

Распределение: `api` — 322, `protocol` — 25, `db` — 13, `cli` — 9, `com` — 6, `web` — 5, `files` — 4.

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
| 12 | Amazon SP-API | `api` | заказы продавца | `candidate` |
| 13 | Amplitude | `api` | продуктовая аналитика | `candidate` |
| 14 | Ansible | `cli` | конфигурация парка машин | `candidate` |
| 15 | Anthropic API | `api` | Claude | `candidate` |
| 16 | Anytype | `api` | локальные объекты и связи | `candidate` |
| 17 | Apache Superset | `api` | BI | `candidate` |
| 18 | Apple Music (MusicKit) | `api` | каталог и библиотека | `candidate` |
| 19 | Aqara | `api` | датчики Aqara | `candidate` |
| 20 | Argo CD | `api` | деплой в Kubernetes | `candidate` |
| 21 | Azure | `api` | облако Microsoft | `candidate` |
| 22 | Azure Blob | `api` | блоб-хранилище | `candidate` |
| 23 | Azure DevOps | `api` | репозитории, пайплайны, work items | `candidate` |
| 24 | Azure OpenAI | `api` | модели OpenAI в Azure | `candidate` |
| 25 | BITS | `api` | фоновая передача файлов | `candidate` |

…и ещё 359 в [`data/ecosystem/connectors.json`](../data/ecosystem/connectors.json).

### MCP-серверы — 900

Распределение: `community-servers` — 139, `official-servers` — 122, `developer-tools` — 120, `databases` — 94, `communication` — 73, `coding-agents` — 60, `browser-automation` — 52, `aggregators` — 52, `cloud-platforms` — 51, `art-and-culture` — 38, `biology-medicine-and-bioinformatics` — 18, `code-execution` — 13.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | Zed | `clients` | Code at the speed of thought – Zed is a high-performance, multiplayer code editor from the creators of Atom and Tree-sit | `candidate` |
| 2 | Everything | `reference-servers` | Model Context Protocol Reference Servers | `candidate` |
| 3 | Context 7 | `official-servers` | Context7 Platform -- Up-to-date docs for AI agents | `candidate` |
| 4 | DeusData/codebase-memory-mcp | `developer-tools` | Local code intelligence for developers and AI agents. Connect code, docs and infrastructure in a persistent graph, with  | `candidate` |
| 5 | lightpanda-io/browser | `browser-automation` | Lightpanda: the headless browser designed for AI and automation | `candidate` |
| 6 | agent-infra/mcp-server-browser | `browser-automation` | The Open-Source Multimodal AI Agent Stack: Connecting Cutting-Edge AI Models and Agent Infra | `candidate` |
| 7 | microsoft/playwright-mcp | `browser-automation` | Playwright MCP server | `candidate` |
| 8 | DayuanJiang/next-ai-draw-io | `architecture-and-design` | Draw and edit draw.io diagrams by chatting with an AI. Web app, desktop app, and an MCP server for Claude Code, Cursor,  | `candidate` |
| 9 | Continue | `clients` | open-source coding agent | `candidate` |
| 10 | GitHub | `official-servers` | GitHub's official MCP Server | `candidate` |
| 11 | ahujasid/blender-mcp | `art-and-culture` | Community plugin to control Blender 3D with any LLM of your choice. Not affiliated with the official Blender Foundation. | `candidate` |
| 12 | ScrapeGraphAI | `community-servers` | Python scraper based on AI | `candidate` |
| 13 | Cua | `official-servers` | Scale computer-use 2.0 with open-source drivers, cross-OS sandboxes, and benchmarks for training, evaluation, and data g | `candidate` |
| 14 | oraios/serena | `coding-agents` | A powerful MCP toolkit for coding, providing semantic retrieval and editing capabilities - the IDE for your agent | `candidate` |
| 15 | Mastra/mcp | `official-servers` | Mastra is the modern TypeScript framework for AI-powered applications and agents. | `candidate` |
| 16 | eyaltoledano/claude-task-master | `developer-tools` | An AI-powered task-management system you can drop into Cursor, Lovable, Windsurf, Roo, and others. | `candidate` |
| 17 | Skyvern | `community-servers` | Automate browser based workflows with AI | `candidate` |
| 18 | googleapis/genai-toolbox | `databases` | MCP Toolbox for Databases is an open source MCP server for databases. | `candidate` |
| 19 | GLips/Figma-Context-MCP | `developer-tools` | MCP server to provide Figma layout information to AI coding agents like Cursor | `candidate` |
| 20 | Apify | `official-servers` | The Apify MCP server enables your AI agents to extract data from social media, search engines, maps, e-commerce sites, o | `candidate` |
| 21 | IDA Pro MCP | `community-servers` | AI-powered reverse engineering assistant that bridges IDA Pro with language models through MCP. | `candidate` |
| 22 | seleniumbase/SeleniumBase | `browser-automation` | Browser automation, web scraping, and testing. CDP Mode provides a Stealthy Chromium instance that bypasses bot-detectio | `candidate` |
| 23 | elie222/inbox-zero | `communication` | The world's best AI personal assistant for email. Open source app to help you reach inbox zero fast. | `candidate` |
| 24 | get-convex/convex-backend | `databases` | The open-source reactive database for app developers | `candidate` |
| 25 | InstantDB | `official-servers` | Instant is the best backend for AI-coded apps. You get auth, permissions, storage, presence, and streams — everything yo | `candidate` |

…и ещё 875 в [`data/ecosystem/mcp-servers.json`](../data/ecosystem/mcp-servers.json).

### Модели — 531

Распределение: `llm` — 134, `vlm` — 52, `asr` — 39, `tts` — 39, `code` — 39, `image` — 31, `embed` — 28, `ocr` — 23, `video` — 17, `music` — 15, `detect` — 14, `rerank` — 11.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | abinet | `ocr` | контекстное распознавание | `candidate` |
| 2 | ace-step | `music` | быстрая генерация треков | `candidate` |
| 3 | adaface | `face` | качество при плохом свете | `candidate` |
| 4 | all-minilm-l6-v2 | `embed` | самый быстрый | `candidate` |
| 5 | all-mpnet-base-v2 | `embed` | базовый | `candidate` |
| 6 | alma-7b | `translate` | перевод | `candidate` |
| 7 | alpaca-7b | `llm` | историческая инструкция | `candidate` |
| 8 | animate-x | `video` | анимация персонажей | `candidate` |
| 9 | animatediff | `video` | анимация | `candidate` |
| 10 | answerai-colbert-small | `rerank` | крошечный | `candidate` |
| 11 | apertus-8b | `llm` | прозрачный | `candidate` |
| 12 | arc2face | `face` | лицо по эмбеддингу | `candidate` |
| 13 | arcface | `face` | идентификация | `candidate` |
| 14 | aria | `vlm` | мультимодальный | `candidate` |
| 15 | audiogen-medium | `music` | звуковые эффекты | `candidate` |
| 16 | audioldm2 | `music` | звук по описанию | `candidate` |
| 17 | auraflow | `image` | потоковая модель | `candidate` |
| 18 | aya-expanse-32b | `llm` | многоязычный | `candidate` |
| 19 | aya-expanse-8b | `llm` | 23 языка | `candidate` |
| 20 | baichuan2-13b | `llm` | китайский | `candidate` |
| 21 | baichuan2-7b | `llm` | китайский | `candidate` |
| 22 | bamba-9b | `llm` | гибрид | `candidate` |
| 23 | bark | `tts` | эмоции, но нестабильный | `candidate` |
| 24 | bge-large-en-v1.5 | `embed` | английский | `candidate` |
| 25 | bge-m3 | `embed` | мультиязычный, hybrid | `candidate` |

…и ещё 506 в [`data/ecosystem/models.json`](../data/ecosystem/models.json).

### Плагины и пакеты-расширения — 560

Распределение: `npm-package` — 323, `pypi-package` — 199, `claude-code-plugin` — 38.

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

…и ещё 535 в [`data/ecosystem/plugins.json`](../data/ecosystem/plugins.json).

### Навыки и скиллы — 364

Распределение: `agent-skill` — 344, `zshelper-recipe` — 20.

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

…и ещё 339 в [`data/ecosystem/skills.json`](../data/ecosystem/skills.json).

### Инструменты — 620

Распределение: `github-tool` — 402, `npm-cli` — 184, `pypi-lib` — 34.

| # | Название | Тип | Что даёт | Статус |
| --- | --- | --- | --- | --- |
| 1 | n8n | `github-tool` | Fair-code workflow automation platform with native AI capabilities. Combine visual building with custom code, self-host  | `candidate` |
| 2 | yt-dlp | `github-tool` | A feature-rich command-line audio/video downloader | `candidate` |
| 3 | markitdown | `github-tool` | Python tool for converting files and office documents to Markdown. | `candidate` |
| 4 | skills | `github-tool` | Public repository for Agent Skills | `candidate` |
| 5 | ollama | `github-tool` | Get up and running with Kimi, GLM, MiniMax, DeepSeek, gpt-oss, Qwen, Gemma and other models. | `candidate` |
| 6 | transformers | `github-tool` | 🤗 Transformers: the model-definition framework for state-of-the-art machine learning models in text, vision, audio, and  | `candidate` |
| 7 | open-webui | `github-tool` | User-friendly AI Interface Supports Ollama, OpenAI API, ... | `candidate` |
| 8 | scrcpy | `github-tool` | Display and control your Android device | `candidate` |
| 9 | awesome-llm-apps | `github-tool` | 100+ AI Agents, Agent Skills and RAG Apps - Free and Open Source. | `candidate` |
| 10 | PowerToys | `github-tool` | Microsoft PowerToys is a collection of utilities that supercharge productivity and customization on Windows | `candidate` |
| 11 | llama.cpp | `github-tool` | LLM inference in C/C++ | `candidate` |
| 12 | rustdesk | `github-tool` | An open-source remote desktop application designed for self-hosting, as an alternative to TeamViewer. | `candidate` |
| 13 | three.js | `github-tool` | JavaScript 3D Library. | `candidate` |
| 14 | axios | `github-tool` | Promise based HTTP client for the browser and node.js | `candidate` |
| 15 | terminal | `github-tool` | The new Windows Terminal and the original Windows console host, all in the same place | `candidate` |
| 16 | pytorch | `github-tool` | Tensors and Dynamic neural networks in Python with strong GPU acceleration | `candidate` |
| 17 | playwright | `github-tool` | Playwright is a framework for Web Testing and Automation. It allows testing Chromium, Firefox and WebKit with a single A | `candidate` |
| 18 | awesome-mcp-servers | `github-tool` | A collection of MCP servers. | `candidate` |
| 19 | vllm | `github-tool` | A high-throughput and memory-efficient inference and serving engine for LLMs | `candidate` |
| 20 | Stirling-PDF | `github-tool` | 1 PDF Application on GitHub that lets you edit PDFs on any device anywhere | `candidate` |
| 21 | PaddleOCR | `github-tool` | Turn any PDF or image document into structured data for your AI. A powerful, lightweight OCR toolkit that bridges the ga | `candidate` |
| 22 | core | `github-tool` | Open source home automation that puts local control and privacy first. | `candidate` |
| 23 | servers | `github-tool` | Model Context Protocol Reference Servers | `candidate` |
| 24 | opencv | `github-tool` | Open Source Computer Vision Library | `candidate` |
| 25 | unsloth | `github-tool` | Local UI to run and train LLMs and diffusion models. Supports GGUF, MLX, Qwen3.8, DeepSeek-V4.1, MiniMax-H3, Gemma 4, FL | `candidate` |

…и ещё 595 в [`data/ecosystem/tools.json`](../data/ecosystem/tools.json).

## Лицензии

Без указанной лицензии: **248** записей (`agents` — 16, `assistants` — 25, `mcp-servers` — 59, `plugins` — 100, `skills` — 27, `tools` — 21).

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
