# 01 — Архитектура

## 1. Принцип: «ядро живёт дольше окна»

Приложение должно работать сутками и переживать перезапуск интерфейса. Поэтому Electron-окно —
это **тонкий клиент**, а вся логика — в долгоживущем ядре, которое можно перезапустить
независимо.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Electron main (Node)                                                 │
│  окна · трей · глобальные хоткеи · автостарт · обновления · safeStorage│
│  IPC-брокер + проверка прав на границе рендерера                      │
└───────────────┬───────────────────────────────┬──────────────────────┘
                │ MessagePort/utilityProcess    │ postMessage
┌───────────────▼───────────────┐   ┌───────────▼──────────────────────┐
│ KERNEL (orchestrator)         │   │ RENDERER (React, sandboxed)      │
│  сессии · план · роутер       │   │  чат · план · журнал · настройки │
│  capability registry          │   │  оверлей · палитра · HUD         │
│  policy engine · audit        │   └──────────────────────────────────┘
│  scheduler / durable queue    │
│  memory (SQLite + vec)        │
└───┬──────────┬───────────┬────┴──────────────┬───────────────────────┐
    │          │           │                   │                       │
┌───▼───┐ ┌────▼─────┐ ┌───▼────────┐ ┌────────▼───────┐ ┌─────────────▼──┐
│AUDIO  │ │AUTOMATION│ │INFERENCE   │ │MCP HOSTS       │ │CONNECTORS      │
│VAD    │ │UIA+input │ │llama-server│ │stdio/HTTP      │ │Telegram/GCal   │
│wake   │ │capture   │ │onnx/openvino│ │sandboxed       │ │Gmail/Notion/HA │
│ASR/TTS│ │OCR/VLM   │ │per-model   │ │subprocesses    │ │webhooks        │
└───────┘ └──────────┘ └────────────┘ └────────────────┘ └────────────────┘
                      ▼
              SQLite (WAL): events, jobs, memory, audit, settings
```

### Почему именно так

| Решение | Причина | Альтернатива и почему нет |
| --- | --- | --- |
| Ядро в `utilityProcess` | крах/зависание планировщика не убивает UI; можно перезапустить с восстановлением из очереди | всё в main — одно падение = белый экран; всё в renderer — нет доступа к ФС/процессам |
| Инференс — отдельные процессы `llama-server` | изоляция падений, простой swap модели, OpenAI-совместимый API, отдельный учёт памяти | `node-llama-cpp` в процессе ядра — падение нативной библиотеки роняет всё; сложнее выгружать модели |
| Аудио — отдельный воркер | real-time путь не должен делить event loop с LLM/логированием | в main: микро-фризы → щелчки и потерянные фразы |
| Автоматизация — отдельный воркер | нативные модули (UIA, input) могут падать от AV/драйверов; опасная зона изолирована | в main: любой crash = смерть приложения |
| MCP-серверы — дочерние процессы | сторонний код; ограничиваем правами ОС и политикой | «в процессе» — невозможно ограничить |
| SQLite единственным файлом | атомарность, WAL, ноль администрирования, легко бэкапить | Postgres/Redis — лишняя инфраструктура на пользовательском ПК |

## 2. Стек

- **Оболочка:** Electron (актуальная LTS-ветка на момент сборки) + `electron-vite` + TypeScript strict.
- **UI:** React 19, Tailwind, Radix, Framer Motion, Zustand, TanStack Query, `cmdk` (палитра),
  `xterm` (консоль агента), `monaco` (просмотр кода/diff).
- **Ядро:** Node 22+ (внутри Electron), TypeScript, zod для контрактов, `better-sqlite3`,
  `sqlite-vec`, `p-queue`/`p-retry`, собственный scheduler.
- **Инференс:** `llama-server` (llama.cpp) как основной LLM-движок; ONNX Runtime для
  ASR/OCR/embed/rerank; опционально OpenVINO (Intel iGPU/NPU) и Windows ML / Foundry Local.
- **Нативные модули:** `@nut-tree-fork/nut-js` (или собственный Rust/`windows-rs` helper)
  для ввода, `uiohook-napi` для глобальных хоткеев, `screenshot-desktop`/Win32 GDI для захвата,
  `node-pty` для терминала.
- **Логи/метрики:** `pino` → файлы + SQLite, OpenTelemetry-совместимые спаны для трейсинга шагов.

> ⚠️ Все нативные модули требуют пересборки под Electron ABI: `@electron/rebuild` в
> postinstall и в CI под обе архитектуры. Это классический источник «у меня не запускается».
> См. `research/sources/electron-shell/electron__electron/files/docs__tutorial__security.md`.

## 3. Контракты и IPC

Один типизированный канал, никаких «голых» `ipcRenderer.invoke` из рендерера.

```ts
// shared/contracts.ts — единственный источник истины, валидируется zod с обеих сторон
export const Request = z.object({
  id: z.string().uuid(),
  method: z.enum([
    "session.start", "session.stop", "session.interrupt",
    "chat.send", "plan.approve", "plan.edit",
    "tool.invoke", "tool.cancel",
    "memory.search", "memory.write",
    "settings.get", "settings.set",
    "policy.explain", "audit.query",
  ]),
  params: z.unknown(),
  meta: z.object({ sessionId: z.string().optional(), stepId: z.string().optional() }).optional(),
});

export type Event =
  | { type: "asr.partial"; text: string; confidence: number }
  | { type: "asr.final"; text: string; lang: string }
  | { type: "plan.created"; plan: Plan }
  | { type: "step.started"; step: Step }
  | { type: "step.needs_confirm"; stepId: string; risk: Risk; preview: Preview }
  | { type: "tool.result"; stepId: string; ok: boolean; summary: string }
  | { type: "action.logged"; entry: AuditEntry }
  | { type: "alert"; level: "info" | "warn" | "danger"; title: string; body?: string }
  | { type: "budget"; ramUsedPct: number; vramUsedPct: number; throttle: boolean };
```

Правила:
1. Рендерер **никогда** не получает прямого доступа к ФС/процессам — только через методы ядра.
2. Все входящие сообщения валидируются по схеме; неизвестный метод → отказ + запись в аудит.
3. Событийный поток идёт от ядра через `MessageChannelMain` (не через main как прокси) —
   меньше задержек и меньше кода.
4. Каждое действие имеет `correlationId` = `sessionId/stepId`, он же пишется в аудит и
   отправляется в Telegram.

## 4. Capability Registry — «что система умеет»

Центральный реестр. И планировщик, и LLM-роутер, и UI читают **только** его.

```ts
interface Capability {
  id: string;                         // "fs.create_folder", "browser.search", "mcp:notion.create_page"
  kind: "builtin" | "mcp" | "skill" | "connector" | "subagent";
  title: string;                      // человеческое имя для UI
  description: string;                // 1–2 предложения, попадает в промпт
  whenToUse: string[];                // примеры фраз — для retrieval-роутинга
  inputSchema: JsonSchema;            // zod→json schema
  outputSchema: JsonSchema;
  risk: "read" | "write-local" | "destructive" | "external" | "money" | "identity";
  permissions: Permission[];          // fs:desktop, input:mouse, net:http, proc:spawn, secrets:telegram
  sideEffects: "none" | "reversible" | "irreversible";
  undo?: "string";                    // id обратной операции (recycle, git-restore, api-undo)
  latency: "instant" | "fast" | "slow" | "long";
  cost: "free" | "local-compute" | "network";
  requiresModel?: ModelNeed[];        // ["vision", "json-mode", "tools", "ru"]
  offline: boolean;
  health: () => Promise<Health>;
  requiresConfirmation: "never" | "by-policy" | "always";
}
```

Из реестра автоматически строятся:
- список инструментов для LLM (в промпт попадают только 10–25 релевантных — retrieval по
  `whenToUse` + embeddings, иначе контекст раздувается и качество падает);
- экран «Способности» в UI;
- матрица прав для policy engine;
- тесты контрактов (`zod` + smoke-вызов в dry-run режиме).

## 5. Model Router — какой моделью думать

Уровни (см. `03-model-catalog.md`) + правила маршрутизации:

```ts
route(task) →
  if (task.kind === "reflex")        → T0: правила/регекспы, 0 токенов
  if (task.kind === "classify")      → T1: 0.6–1.7B, json-mode, max 64 токена
  if (task.kind === "plan")          → T2+: 4–8B (тяжёлый только если железо тянет)
  if (task.kind === "code")          → code-specialist (Qwen-Coder класс)
  if (task.needsVision)              → VLM-tier
  if (task.tokens > ctxBudget)       → map-reduce по чанкам через T1
  if (budget.throttled)              → понижение на один уровень + предупреждение в UI
```

Ключевые ограничители:
- **Бюджет контекста** на каждый вызов (по умолчанию 8k для чата, 32k для кодинга).
- **Бюджет времени**: если T2 не уложился в N секунд — эскалация или «продолжить в фоне».
- **Язык**: для русского обязательный тест на качество; мелкие модели часто деградируют —
  поэтому в каталоге есть отметка `ruQuality`, а роутер умеет «переспросить по-английски
  внутри» и ответить по-русски.

## 6. Планировщик и «бесконечный» режим

Долговечность строится на трёх вещах: **журнал (WAL)**, **идемпотентные шаги**, **чекпойнты**.

```sql
-- jobs: единица долгой работы
CREATE TABLE jobs (
  id TEXT PRIMARY KEY, kind TEXT, title TEXT, state TEXT,  -- queued|running|paused|done|failed|cancelled
  created_at INT, updated_at INT, priority INT,
  budget_json TEXT,          -- {maxMinutes, maxTokens, maxDiskMb, maxActions}
  spent_json TEXT,           -- фактическое потребление
  checkpoint_json TEXT,      -- последний сохранённый шаг плана + артефакты
  parent_id TEXT, session_id TEXT
);
-- job_steps: шаги с идемпотентным ключом
CREATE TABLE job_steps (
  id TEXT PRIMARY KEY, job_id TEXT, idx INT, state TEXT,
  action TEXT, args_json TEXT, result_json TEXT, attempts INT,
  idem_key TEXT UNIQUE, started_at INT, finished_at INT
);
```

Свойства:
- Перезапуск приложения → `jobs.state='running'` переводятся в `paused`, шаг с
  `state='running'` инвалидируется и повторяется (потому что идемпотентен или имеет `undo`).
- **Infinite mode** = `while(job.state==='running')` с обязательными: лимит времени/тokens/диска,
  heartbeat в Telegram раз в N минут, «стоп-слово» в чате/голосе, авто-пауза при 3 подряд ошибках.
- Ночной режим: тяжёлые задачи только на AC-питании; при переходе на батарею — пауза.

## 7. Память и хранилище

Один файл `data.db` (WAL) + папки артефактов:

```
%APPDATA%/ThisHelper/
├── data.db              # события, задания, аудит, память, настройки
├── models/              # веса (не в git!), манифест model-lock.json
├── artifacts/<jobId>/   # скриншоты, логи, транскрипты, диффы
├── workspace/           # песочница кода и временные проекты
├── snapshots/           # копии файлов перед изменением (undo)
└── logs/
```

Векторы — `sqlite-vec`, полнотекст — FTS5, оба в том же файле: бэкап = копия одного файла.
См. `research/sources/memory-and-rag/asg017__sqlite-vec/README.md`.

## 8. Безопасность Electron (обязательный чеклист)

Из `research/sources/electron-shell/electron__electron/files/docs__tutorial__security.md`:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` в рендерерах.
- Preload экспонирует **узкий** API (`contextBridge`), а не `ipcRenderer`.
- `webSecurity: true`, никаких `allowRunningInsecureContent`.
- CSP строгий, без `unsafe-eval`; все внешние ссылки — через `shell.openExternal` после проверки.
- `setWindowOpenHandler` → `deny` по умолчанию.
- Навигация ограничена: `will-navigate` блокирует всё, кроме собственного origin.
- Fuses: отключить `runAsNode`, `enableNodeCliInspectArguments`, `enableNodeOptionsEnvironmentVariable`.
- Никаких `eval`, `new Function`, `require` из пользовательских данных.
- Секреты — только `safeStorage` (DPAPI), никогда в `localStorage`/JSON настроек.

## 9. Производительность и «слабый компьютер»

Бюджеты (по умолчанию, настраиваемо):

| Ресурс | Ограничение | Механизм |
| --- | --- | --- |
| RAM приложения | ≤ 60 % (мин. 1.5 ГБ свободно) | выгрузка моделей LRU, отказ от новых задач |
| VRAM | ≤ 70 % с учётом KV-кэша | расчёт перед загрузкой, `n_gpu_layers` подбирается |
| CPU | ≤ 50 %, nice для инференса | приоритеты потоков, ≤ N-2 потоков |
| Диск | ≤ 20 ГБ кэша моделей | автоочистка по TTL |
| Энергия | пауза тяжёлого на батарее | `powerMonitor` |

Деградация вместо отказа: если нет VRAM — GGUF на CPU с меньшим контекстом; если совсем мало
памяти — «режим только скиллы» (без LLM: регекспы + шаблоны + голосовые подтверждения).

## 10. Что проверено по источникам

| Утверждение | Источник в vault |
| --- | --- |
| `utilityProcess` — правильный способ держать Node-код вне main | `electron/electron` `docs/tutorial/process-model.md` |
| Чеклист безопасности Electron (17 пунктов) | `electron/electron` `docs/tutorial/security.md` |
| `contextIsolation`/`sandbox` поведение | `electron/electron` `docs/tutorial/context-isolation.md`, `sandbox.md` |
| Сборка/подпись/автообновление Windows | `electron-userland/electron-builder` README + `docs/` |
| Fuses для ужесточения рантайма | `electron/fuses` README |
| SQLite + векторы в одном файле | `asg017/sqlite-vec` README |
| Планировщик/очереди без Redis | `breejs/bree`, `node-schedule`, `temporalio/temporal` (для сравнения) |

## 11. Открытые вопросы

- `utilityProcess` vs отдельный `node`-процесс с IPC: у первого меньше оверхеда, у второго
  независимость от жизненного цикла Electron. **Решить на прототипе** (замер: потребление
  памяти, скорость старта, поведение при `app.quit`).
- Нативный модуль ввода: `nut-js` (быстро, но заброшенность форка) vs свой Rust-хелпер на
  `windows-rs` (дольше, но контроль и стабильность при обновлениях).
- Хранить ли транскрипты 24/7-режима: по умолчанию — нет, только «последние 5 минут» в RAM.
