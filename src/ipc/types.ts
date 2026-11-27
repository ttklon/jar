/**
 * Типы, которые приходят из ядра. Это зеркало структур `src-tauri/src/registry.rs`
 * — если поле меняется там, оно меняется здесь, и наоборот. Источник истины —
 * `data/actions.json`, всё остальное его отражает.
 */

export type Risk =
  | "read"
  | "write-local"
  | "external"
  | "destructive"
  | "identity"
  | "money";

export type Tier = "T0" | "T1" | "T2" | "T3";
export type HumanCode = "c" | "h" | "n";
export type ActionStatus = "v1" | "v2" | "later" | "never";

export interface Action {
  /** "files-001" — слаг строки, стабилен в рамках реестра. */
  id: string;
  domain: string;
  verb: string;
  object: string;
  /** Как это говорит человек — по этой строке ищет каталог. */
  example: string;
  /** Каналы исполнения: ["fs.mkdir", "PowerShell New-Item"]. */
  implementation: string[];
  risk: Risk;
  tier: Tier;
  /** Человеческая формулировка: «может» | «редко» | «не может». */
  human: string;
  human_code: HumanCode;
  status: ActionStatus;
  notes: string;
}

export interface RegistryStats {
  actions: number;
  domains: number;
  verbs: number;
  byRisk: Record<Risk, number>;
  byTier: Record<Tier, number>;
  byStatus: Record<ActionStatus, number>;
}

export interface RegistrySnapshot {
  actions: Action[];
  stats: RegistryStats;
}

/** Порядок риска: от безопасного к тому, что требует человека. */
export const RISK_ORDER: Risk[] = [
  "read",
  "write-local",
  "external",
  "destructive",
  "identity",
  "money",
];

export const TIER_ORDER: Tier[] = ["T0", "T1", "T2", "T3"];
export const STATUS_ORDER: ActionStatus[] = ["v1", "v2", "later", "never"];

// ── Инструменты («руки») ─────────────────────────────────────────────────────

/** Параметр инструмента. Описание приходит из `data/tools.json` через ядро. */
export interface ParamSpec {
  name: string;
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
}

/** Решение политики для действия. */
export type Decision = "allow" | "allow_with_notice" | "confirm" | "deny";

export interface ToolView {
  registry: string;
  title: string;
  summary: string;
  implementation: string;
  params: ParamSpec[];
  risk: Risk;
  /** Есть ли в риске что-то, что требует человека рядом. */
  risk_needs_human: boolean;
  decision: Decision;
  decision_reason: string;
  needs_token: boolean;
  /**
   * Проверка перед запуском. В браузере её нет: правила живут в ядре, а повторять их
   * в третий раз значило бы держать третью правду.
   */
  screening?: Screening;
  /** Параметры прошлого удачного запуска — интерфейс подставляет их сам. */
  last_params?: Record<string, string> | null;
}

/**
 * Найденное действие по фразе человека (`planner.rs`).
 * `tool` заполнен только тогда, когда приложение действительно умеет это выполнить.
 */
export interface PlanItem {
  key: string;
  example: string;
  risk: Risk;
  decision: Decision;
  decision_reason: string;
  needs_token: boolean;
  tool: string | null;
  score: number;
}

/**
 * Файл в папке моделей. `ok` значит «заголовок GGUF прочитан», а не «модель работает»:
 * запускать пока нечем, и интерфейс этого не обещает.
 */
export interface ModelFile {
  name: string;
  size_bytes: number;
  ok: boolean;
  note: string;
  version: number | null;
  tensors: number | null;
  architecture: string | null;
  quant: string | null;
  /** Известный хеш файла из памяти; `null` — файл ещё не сверяли. */
  hash: string | null;
}

/** Шаг обучения: что уже сделано, а что нет. */
export interface LearningStep {
  title: string;
  done: boolean;
}

/** Задача на обучение: просьба плюс всё, что известно о том, как её выполнить. */
export interface Learning {
  registry: string;
  /** Фраза-пример из реестра: по ней проверяется, что научились. */
  example: string;
  /** Как это попросили — дословно. */
  query: string;
  /** Чем это делается по реестру: API, программы, приёмы. */
  implementation: string[];
  risk: string;
  notes: string;
  asked_ms: number;
  /** Сколько раз просили: частота решает, чему учиться первым. */
  times: number;
  steps: LearningStep[];
}

/** Что модель предложила. Не выполнено и не подтверждено: решает человек. */
/** Черновик руки: текст, который ничего не исполняет. */
export interface HandDraft {
  key: string;
  goal: string;
  code: string;
  why: string;
  created_ms: number;
}

/** Отчёт о пробе черновика в клетке. Отчёт — не умение. */
export interface TrialReport {
  key: string;
  ran: boolean;
  ok: boolean;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  cell: string;
  duration_ms: number;
  note: string;
  created_ms: number;
}

/** Привнесённая рука: добавлена человеком, отдельно от встроенных и не исполняется. */
export interface CustomHand {
  key: string;
  title: string;
  code: string;
  risk: string;
  source: string;
  created_ms: number;
}

/** Один шаг цепочки: та же рука с теми же параметрами, что и в одиночном вызове. */
export interface ChainStep {
  registry: string;
  params: Record<string, string>;
  why: string;
}

export type Proposal =
  | { Call: { registry: string; params: Record<string, string>; why: string } }
  /** Цепочка: несколько действий подряд, каждое со своим подтверждением. */
  | { Chain: { goal: string; steps: ChainStep[]; why: string } }
  /** Разложение большой задачи на несколько дел: предложение, а не разрешение. */
  | { Split: { goal: string; deeds: string[]; why: string } }
  /**
   * Продолжение уже начатой цели. `done` — слова модели о том, что цель закрыта;
   * это не доказательство, поэтому очередь просто перестаёт брать дела по цели.
   */
  | { Next: { goal: string; done: boolean; deeds: string[]; why: string } }
  | { Learn: { goal: string; why: string } }
  | { Hand: { goal: string; code: string; why: string } }
  | { Ask: { question: string; why: string } }
  | { Refuse: { reason: string } };

/** Ответ модели: вопрос, её слова, разобранное предложение и что с ним не так. */
export interface Thought {
  prompt: string;
  answer: string;
  proposal: Proposal | null;
  /** План из предложения `call`: уже с политикой, вопросами и подтверждениями. */
  plan: PlanCheck | null;
  /** Задача на обучение из предложения `learn`: записана в память и переживёт перезапуск. */
  learning: Learning | null;
  /** Дела из разложения: каждое пойдёт своим путём, в очередь их ставит человек. */
  deeds: string[] | null;
  problem: string | null;
}

/** Факт, который человек уже говорил: «папка для отчётов — D:\\Отчёты». */
export interface Fact {
  key: string;
  value: string;
}

/** Окно, которое сейчас перед человеком. */
export interface ForegroundWindow {
  /** Заголовок. Бывает пустым — и это нормально. */
  title: string;
  /** Имя программы без пути: `chrome.exe`. */
  process: string;
  pid: number;
}

/**
 * Один элемент активного окна, как его прочитал UI Automation.
 *
 * Имя может быть пустым, а элемент — недоступным: это правда о экране, и её нельзя
 * прятать. `actions` — то, что окно само объявило доступным, а не то, что помощник умеет.
 */
export interface UiElement {
  /** Насколько глубоко от окна: окно — нулевой уровень. */
  depth: number;
  /** Вид элемента по-русски: «кнопка», «поле ввода», «текст». */
  kind: string;
  name: string;
  id: string;
  enabled: boolean;
  actions: string[];
}

/** Разобранное активное окно. */
export interface UiDump {
  title: string;
  process: string;
  elements: UiElement[];
  /** Дерево не поместилось в потолки — значит, это не весь экран. */
  truncated: boolean;
  /** Честная приписка о том, как это получено. */
  note: string;
  /** То же самое текстом — ровно то, что уходит модели. */
  text: string;
}

/**
 * Что измерено на машине. Цифры как есть, без «примерно».
 */
export interface MachineSample {
  cpu_percent: number;
  ram_free_mb: number;
  ram_total_mb: number;
  /** Сколько секунд человек не трогал ввод. */
  idle_seconds: number;
}

/** Кто сейчас за машиной — по измерению или по слову человека. */
export type MachineMode = "near" | "away" | "crowded";

/**
 * Что человек сказал о себе. Слово сильнее таймера, но не сильнее железа: объявление не
 * добавляет ни памяти, ни ядер.
 */
export type Presence = "away" | "near";

/** Сколько можно взять прямо сейчас и почему именно столько. */
export interface MachineBudget {
  /** Сколько дел можно вести одновременно. Ноль — новое не начинать. */
  parallel: number;
  mode: MachineMode;
  reason: string;
  may_start: boolean;
}

/** Всё, что приложение знает о машине прямо сейчас. */
export interface MachineState {
  /** `null` — машина здесь не измеряется, и это не ошибка. */
  sample: MachineSample | null;
  budget: MachineBudget;
  available: boolean;
  note: string;
  /** Слово человека: «я ухожу» или «я работаю». `null` — не говорил, решает таймер. */
  declared: Presence | null;
  /**
   * Слабая ли машина по порогам памяти (шаг 389).
   *
   * `false` без измерения: «не знаю» и «сильная» — разные вещи, и объявлять
   * слабость по догадке значит пугать человека зря.
   */
  weak: boolean;
}

/**
 * Отчёт о нажатии по элементу. Нажатие — действие, поэтому отчёт, а не «готово».
 */
export interface UiPress {
  /** Что именно нажали: имя и вид, чтобы человек узнал свою кнопку. */
  target: { name: string; kind: string; id: string; actions: string[] };
  /** Нажатие действительно отправлено системе. */
  sent: boolean;
  /** Экран после нажатия изменился — проверено сравнением, а не верой. */
  changed: boolean;
  /** Что сказать человеку: правду, включая «ничего не изменилось». */
  note: string;
}

/** Отчёт о вводе текста в поле: ввели и прочитали обратно. */
export interface UiTyped {
  target: { name: string; kind: string; id: string; actions: string[] };
  /** Что просили ввести. */
  text: string;
  /** Что поле показывает после ввода. */
  read_back: string;
  /** Прочитанное совпало с введённым. */
  verified: boolean;
  note: string;
}

/** Потолки запуска: что есть на этой машине на самом деле. */
export interface IsolationStatus {
  /** Держит ли система потолки (job object есть только на Windows). */
  available: boolean;
  /** Потолки пробного запуска словами. */
  summary: string;
  /** Что происходит — и чего не происходит. */
  note: string;
}

/** Итог проверки команды перед запуском. */
export interface Screening {
  decision: "allow" | "ask" | "refuse";
  /** Почему так: пусто только при `allow`. */
  reasons: string[];
}

/** Что известно о локальном распознавании речи. */
export type VoiceTrayStatus =
  | "ready"
  | "key-down"
  | "key-up"
  | "listening"
  | "working"
  | "awaiting-confirmation"
  | "executing"
  | "error"
  // Шаг 98: дело из памяти видно и в трее, а не только на экране.
  | "deed-running"
  | "deed-waiting";

export interface SpeechStatus {
  /** Найден ли `whisper-server.exe` рядом с приложением или в `PATH`. */
  found: boolean;
  program: string | null;
  /** Файл модели распознавания в папке моделей, если он есть. */
  model: string | null;
  /** Куда положить движок. */
  search_dir: string;
  models_dir: string;
}

/** Найденный прошлый запуск: почему он нашёлся — часть ответа. */
export interface Episode {
  run: RunRecord;
  /** Слова запроса, которые в запуске действительно есть. */
  matched: string[];
}

/** План: несколько шагов как данные, до исполнения проверяется. */
export interface PlanStep {
  registry: string;
  params?: Record<string, string>;
  why?: string;
}

export interface Plan {
  goal: string;
  source?: string;
  steps: PlanStep[];
}

/** Что не так с планом: где, в каком шаге и что именно. */
export interface PlanProblem {
  /** Ноль — проблема в плане целиком, а не в шаге. */
  position: number;
  registry: string;
  problem: string;
}

export interface PlanCheck {
  plan: Plan | null;
  /** Пусто — план исполним. */
  problems: PlanProblem[];
  /** Что можно сразу, а что человек должен разрешить. */
  gates: PlanGate[];
  /** Чего не хватает шагам: спросить это — работа интерфейса. */
  questions: PlanQuestion[];
}

/** Вопрос по шагу: ровно то, без чего шаг не состоится. */
export interface PlanQuestion {
  position: number;
  name: string;
  label: string;
  hint: string;
}

/** Ответ человека: имя параметра и значение. */
export interface PlanAnswer {
  position: number;
  name: string;
  value: string;
}

/** Решение по шагу до запуска: политика уже спрошена. */
export interface PlanGate {
  /** Номер шага, с единицы. */
  position: number;
  registry: string;
  decision: "allow" | "allow_with_notice" | "confirm" | "deny";
  risk: string;
  /** Шаг требует подтверждения и человек его пока не разрешил. */
  wants_approval: boolean;
}

/** Что случилось на одном шаге плана. */
export interface PlanStepRun {
  position: number;
  registry: string;
  status: "ok" | "failed" | "cancelled";
  reason: string;
  evidence: string;
  duration_ms: number;
}

/** Отчёт о запуске: `stopped` пуст, только если план прошёл целиком. */
/** Что видно на экране после работы — и изменилось ли это «видно» с начала. */
export interface Sight {
  title: string;
  changed: boolean;
  /** Был ли снимок «до»: без него сравнение невозможно, и это сказано. */
  comparable: boolean;
  /** Первые строки того, что видно сейчас. */
  text: string;
  note: string;
}

export interface PlanReport {
  goal: string;
  steps: PlanStepRun[];
  stopped: string | null;
  run_id: number | null;
  /** Только у планов, которые трогают окно: для остальных смотреть нечего. */
  sight: Sight | null;
  /**
   * С какого шага продолжать, если план остановился. `null` — продолжать нечего.
   *
   * Это число, а не текст причины: по тексту нельзя надёжно продолжить, а по
   * числу можно. Дело, прерванное на третьем шаге, продолжается с третьего, а не
   * с начала: первые два уже сделаны.
   */
  resume_at?: number | null;
  /**
   * Шаг, про который при продолжении спросят, а не повторят молча.
   *
   * `null` — повторять нечего или всё повторяемое безопасно. Повтор — это второе
   * действие: «создать папку» второй раз падает, а удаление второй раз может
   * унести лишнее. Экран показывает это до запуска, чтобы человек не упирался в
   * окно посередине.
   */
  ask_on_resume?: number | null;
}

/** Роль модели: требование к роли плюс то, что на неё назначено. */
export interface RoleView {
  id: string;
  title: string;
  purpose: string;
  max_bytes: number;
  assigned: string | null;
  assigned_bytes: number | null;
  /** Влезает ли назначенный файл в потолок роли. */
  fits: boolean;
}

/** Что известно о движке `llama-server`. */
export interface EngineStatus {
  /** Найден ли бинарник рядом с приложением или в `PATH`. */
  found: boolean;
  program: string | null;
  /** Куда его положить, если не найден. */
  search_dir: string;
  running: boolean;
  port: number | null;
  pid: number | null;
}

/** Результат скачивания: файл уже лежит в папке моделей и хеш посчитан. */
export interface Downloaded {
  name: string;
  bytes: number;
  sha256: string;
  /** `true` — эталон был задан и совпал; `false` — эталона не было. */
  verified: boolean;
}

/** Pinned-модель для первого разговора (`data/readiness.json`). */
export interface ModelSpec {
  id: string;
  title: string;
  file: string;
  url: string;
  sha256: string;
  bytes: number;
  license: string;
  source: string;
  min_ram_gb: number;
  description: string;
}

/** Pinned-движок `llama-server` из релиза llama.cpp (`data/readiness.json`). */
export interface RuntimeSpec {
  id: string;
  title: string;
  asset: string;
  url: string;
  sha256: string;
  bytes: number;
  license: string;
  source: string;
  program: string;
  description: string;
}

/**
 * Готовность к первому разговору. Только факты: что есть на машине и чего не хватает.
 * `missing` — `engine` и/или `model`; пусто — готово. Локальное распознавание
 * (`speech_*`) для первого разговора необязательно и в `missing` не входит:
 * без него голос идёт системной службой, с ним — не покидает компьютер.
 */
export interface ReadinessStatus {
  download_name: string | null;
  runtime_managed: boolean;
  runtime_supported: boolean;
  engine_found: boolean;
  engine_running: boolean;
  engine_program: string | null;
  engine_search_dir: string;
  model_present: boolean;
  model_name: string | null;
  model_bytes: number;
  models_dir: string;
  free_bytes: number | null;
  speech_found: boolean;
  speech_model: string | null;
  speech_search_dir: string;
  /** Движок распознавания установлен нашим установщиком (управляемый каталог). */
  speech_runtime_managed: boolean;
  /** Pinned-спецификации необязательного локального распознавания. */
  speech_runtime_spec: RuntimeSpec;
  speech_model_spec: ModelSpec;
  model_spec: ModelSpec;
  runtime_spec: RuntimeSpec;
  ready: boolean;
  missing: string[];
}

/** Какой движок доставляет `download_runtime`/`remove_runtime`. */
export type RuntimeKind = "llama" | "whisper";

/** Итог проверки разговора: движок запущен и ответил (или нет) на тестовый вопрос. */
/**
 * Что произошло с движком после сна машины.
 *
 * `action` — что сделали, `note` — почему, словами. Фраза человека при этом не
 * теряется: она живёт в поле экрана и в черновике, а не в движке.
 */
export interface WakeReport {
  /** `nothing` — отвечал; `restart` — был и умер, подняли; `leave` — не было, не трогали; `restart-stuck` — завис, сняли и подняли. */
  action: "nothing" | "restart" | "leave" | "restart-stuck";
  /** Что именно проверено и чем кончилось — для журнала и для человека. */
  note: string;
  /** Движок под управлением приложения после всего этого. */
  running: boolean;
}

export interface SmokeResult {
  ok: boolean;
  answer: string | null;
  model: string | null;
  port: number | null;
  note: string;
}

/** Результат сверки хеша. `verdict`: `first` | `same` | `changed`. */
export interface HashCheck {
  name: string;
  actual: string;
  previous: string | null;
  verdict: string;
}

export interface ModelsView {
  dir: string;
  items: ModelFile[];
  /** Папку не прочитать — это не то же самое, что пустая папка. */
  error: string | null;
  total_bytes: number;
  /** Свободно на диске; `null` — спросить не удалось. */
  free_bytes: number | null;
}

/** Запуск из памяти приложения (SQLite). */
/** Шаг запуска: что сделали, чем кончилось, чем подтверждено. */
export interface RunStep {
  position: number;
  tool: string;
  ok: boolean;
  reason: string;
  evidence: string;
}

export interface RunRecord {
  id: number;
  /** `tool` — одиночный инструмент, `flow` — сценарий, `download` — скачивание. */
  kind: string;
  subject: string;
  started_ms: number;
  finished_ms: number | null;
  /** `running` | `ok` | `failed` | `denied` | `cancelled`. */
  outcome: string;
  /** Шаги по порядку; пусто у запусков без шагов (например, скачивания). */
  steps: RunStep[];
  /** Сессия, в которой шло дело: по ней откат знает, что отменять (шаг 364). */
  session?: string;
}

/** Доказательство того, что шаг действительно выполнен. */
export type Evidence =
  | { kind: "exit_code"; code: number }
  | { kind: "path_exists"; path: string; exists: boolean }
  | { kind: "stdout_marker"; marker: string; found: boolean }
  | { kind: "file_text"; path: string; matches: boolean }
  | { kind: "file_read"; path: string; bytes: number }
  | {
      kind: "compared";
      same: number;
      different: number;
      only_left: number;
      only_right: number;
    }
  | { kind: "search"; files: number; hits: number }
  | { kind: "renamed"; folder: string; count: number }
  | { kind: "ui_changed"; what: string; changed: boolean }
  | { kind: "failed"; reason: string };

export interface StepResult {
  registry: string;
  ok: boolean;
  evidence: Evidence;
  reason: string;
  stdout_tail: string;
  stderr_tail: string;
  exit_code: number | null;
  timed_out: boolean;
  cancelled: boolean;
  duration_ms: number;
}

export interface ConfirmToken {
  token: number;
  ttl_sec: number;
}

/**
 * Сценарий — план из нескольких инструментов. Шаги исполняются по одному, каждый
 * своим путём: политика, журнал и проверка результата у каждого свои.
 */
export interface FlowInput {
  name: string;
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
}

export interface FlowStepView {
  /** Ключ инструмента из `data/tools.json`. */
  tool: string;
  title: string;
  /** Что произойдёт — словами, а не именем инструмента. */
  note: string;
  params: Record<string, string>;
  risk: Risk;
  decision: Decision;
  decision_reason: string;
  needs_token: boolean;
}

export interface FlowView {
  id: string;
  title: string;
  summary: string;
  /** Строка реестра, которую сценарий обещает выполнить. */
  registry: string;
  /** Риск самого опасного шага. */
  risk: Risk;
  decision: Decision;
  decision_reason: string;
  needs_token: boolean;
  inputs: FlowInput[];
  steps: FlowStepView[];
}

/**
 * Событие журнала — то, что ядро записало в `audit.jsonl`.
 *
 * В журнале нет ни путей, ни текста: только ключ действия, риск, решение политики,
 * отпечаток аргументов и итог. Поэтому его можно показывать целиком.
 */
export type AuditKind = "requested" | "confirmed" | "started" | "finished" | "denied";

export interface AuditEvent {
  /** Unix-время в миллисекундах. */
  at_ms: number;
  kind: AuditKind;
  /** Ключ `domain|verb|object` или `policy` для решений без действия. */
  subject: string;
  risk: string;
  decision: string;
  args_fingerprint: string;
  outcome: string;
  duration_ms: number;
}

/**
 * Профиль приложения — слой «как именно»: что и в каком порядке делать в конкретной
 * программе. Профили проверяются данными (`tools/profiles.py`), поэтому интерфейс
 * показывает их как есть: описание, якоря и операции с риском из реестра.
 */
export interface ProfileOpView {
  name: string;
  /** Ссылка из профиля; может быть короткой (`domain|verb`). */
  registry: string;
  /** Строка реестра, в которую она разрешилась. */
  resolved: string;
  risk: Risk | "unknown";
  decision: Decision;
  decision_reason: string;
  needs_token: boolean;
  /** Есть ли уже инструмент, который это выполняет. */
  has_tool: boolean;
}

export interface ProfileView {
  slug: string;
  app: string;
  kind: string;
  exe: string[];
  ui_stack: string;
  version_seen: string;
  verified_at: string;
  anchors: number;
  executable: number;
  operations: ProfileOpView[];
}

/**
 * Откат за сессию.
 *
 * Откат отвечает не на «что сделали» (это журнал), а на «как вернуть». Поэтому здесь
 * только обратимое: перенос и переименование. У остального старого содержимого уже нет,
 * и `note` говорит об этом рядом со списком, а не в документации.
 */
export type UndoKind = "move" | "rename" | "copy" | "compress" | "product" | "autostart" | "service";

export interface UndoEntry {
  at: number;
  session: string;
  kind: UndoKind;
  from: string;
  to: string;
}

export interface UndoStep {
  entry: UndoEntry;
  /** `null` — шаг можно выполнить; строка — причина, по которой нельзя. */
  refusal: string | null;
}

/**
 * Автозапуск при входе в Windows.
 *
 * `enabled` — прочитано из реестра, а не из нашей памяти: «я включил» и «включено»
 * разные утверждения. `note` объясняет, если что-то не так (например, под этим
 * именем уже записана другая программа).
 */
export interface Autostart {
  enabled: boolean;
  command: string | null;
  target: string;
  note: string;
}

/**
 * Горячая клавиша: что действует и удалось ли проверить занятость.
 *
 * `known: false` — не «свободна», а «не знаю»: занятость чужих программ Windows
 * не показывает, пока не попробуешь зарегистрировать.
 */
export interface HotkeyView {
  /** Действующая клавиша в форме правила: `ctrl+alt+space`. */
  spec: string;
  /** Она же словами человека: `Ctrl+Alt+Space`. */
  shown: string;
  /** Проверена ли занятость. */
  known: boolean;
  /** Почему не проверена. Пусто — проверена. */
  why: string;
}

/**
 * Расписание, как его видит человек.
 *
 * `when` считает ядро (`schedule::store::Saved::when`), а не экран: подпись и
 * настоящее время срабатывания обязаны быть одним и тем же.
 */
export interface ScheduleRow {
  id: string;
  what: string;
  /** `daily` или `hourly`. */
  cadence: string;
  /** Минута внутри дня (0–1439) или часа (0–59). */
  minute: number;
  paused: boolean;
  /**
   * Что делать с пропущенным запуском: `catchUp` — сделать один раз, `skip` —
   * пропустить, `ask` — спросить. Выбор у дела, а не общей настройкой.
   */
  policy: string;
  /** Когда — словами: «каждый день в 09:00». */
  when: string;
}

/**
 * Правило «когда …, тогда …» (шаг 284).
 *
 * `on: false` — не удалено, а отложено: выключение это решение «сейчас не надо»,
 * а удаление — потеря.
 */
export interface WhenThenRow {
  id: string;
  /** `time`, `app`, `file`, `said`. */
  kind: string;
  /** Условие словами: «откроется chrome». */
  when: string;
  then: string;
  /** Опасное действие спрашивает, даже внутри правила. */
  risky: boolean;
  on: boolean;
  fired: number;
}

/**
 * Файл предыдущей версии рядом с программой.
 *
 * `bytes: 0` — файла нет: откат без сети невозможен, и это говорится словами, а
 * не серой кнопкой.
 */
export interface RollbackFile {
  file: string;
  bytes: number;
  looked_in: string;
}

/**
 * Незавершённое дело (шаг 458): что сохраняет выключение и что ждёт ответа после
 * включения. Пустой `deed` и пустые фразы — сохранять нечего.
 */
export interface UnfinishedNeed {
  deed: string | null;
  step: number;
  said: string;
  draft: string;
}

/** Что успели сохранить при выходе. `allow` — можно ли выключать. */
export interface UnfinishedSaved {
  allow: boolean;
  items: string[];
  said: string;
}

/**
 * Человек за компьютером (шаг 401).
 *
 * `guest` — безопасные дела и ничего больше. `facts` — сколько у него фактов:
 * числом, чтобы «своя память» было видно, а не обещано.
 */
export interface PersonRow {
  id: string;
  name: string;
  guest: boolean;
  facts: number;
}

/** Люди и кто действует сейчас. */
export interface PeopleBook {
  /** id действующего человека; пусто — профилей нет. */
  current: string;
  people: PersonRow[];
}

export interface UndoPreview {
  session: string;
  steps: UndoStep[];
  note: string;
}

export interface UndoReport {
  session: string;
  undone: number;
  refused: string[];
}

/**
 * Место, где приложение держит свои файлы.
 *
 * `exists: false` — «файла ещё нет», а не «занимает 0 КБ»: это разные утверждения, и
 * путать их в интерфейсе значит врать про состояние.
 */
/**
 * Сколько чего приложение тратит — и сколько обещало (шаг 400).
 *
 * `value: null` — не измерили. Это не «хорошо»: пустая зелёная строка
 * приучает не смотреть, поэтому неизмеренное названо словами.
 */
export interface ResourceMetric {
  name: string;
  value: number | null;
  unit: string;
  budget: number | null;
  within: boolean | null;
  how: string;
}

export interface ResourceReport {
  metrics: ResourceMetric[];
  over: number;
  unknown: number;
  summary: string;
}

export interface DataPlace {
  title: string;
  path: string;
  exists: boolean;
  bytes: number;
  note: string;
}

/**
 * Сколько занимает установка целиком (шаг 395).
 *
 * Части названы отдельно, а не одним числом: «12 ГБ» без разбивки человеку ничего
 * не говорит — почти всё это модели, и именно их он может убрать или не скачивать.
 */
export interface DataTotals {
  /** Данные приложения: журналы, память, копии. */
  dataBytes: number;
  /** Модели: главная часть установки. */
  modelsBytes: number;
  /** Движки: llama и whisper. */
  runtimesBytes: number;
  /** Сама программа. */
  programBytes: number;
  /** Всё вместе, без двойного счёта. */
  totalBytes: number;
}

/**
 * Итог одной самопроверки.
 *
 * `passed: false` — не поломка интерфейса, а честный ответ: обещание не подтвердилось, и
 * `detail` говорит, что именно увидели.
 */
export interface SelfCheckVerdict {
  name: string;
  promise: string;
  passed: boolean;
  detail: string;
  ms: number;
  /**
   * Чем грозит провал, словами человека. Не то же, что `promise`: обещание
   * говорит, что проверяли, риск — что случится без этого.
   */
  risk: string;
}

export interface Installed { program: string }

/**
 * Один сетевой адрес приложения.
 *
 * Список нужен не для отладки, а для человека: «бесплатно и локально» —
 * обещание, которое нельзя проверить, не видя, куда приложение ходит. Здесь
 * видно каждый адрес, что по нему качается и нужно ли это для разговора.
 */
export interface NetworkAddress {
  purpose: string;
  url: string;
  bytes: number;
  needed: boolean;
  reason: string;
  /**
   * Закреплённый sha256 (шаг 72). Пустая строка — адрес не закреплён, и такой
   * файл не скачивается: проверить его нечем.
   */
  pinned_sha256: string;
}

/**
 * Что сеть на самом деле ответила про адрес.
 *
 * `status` — HTTP-код, ноль означает «ответа не было» (сеть, DNS, таймаут).
 * `problem` — человеческая причина, если проверка не удалась; тогда `status`,
 * `bytes` и `tag` ничего не обещают.
 */
export interface AddressProbe {
  url: string;
  status: number;
  bytes: number | null;
  tag: string | null;
  problem: string | null;
}

/**
 * Итог «удалить всё скачанное».
 *
 * Три поля, а не одно: удаление пяти вещей — пять разных исходов. Движок может
 * работать, распознавание — быть занято, файл — открыт. Одна строка ошибки
 * заставила бы человека догадываться, что осталось на диске.
 */
export interface RemovedAll {
  freed_bytes: number;
  removed: string[];
  kept: string[];
}
