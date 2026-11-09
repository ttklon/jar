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
}

/** Доказательство того, что шаг действительно выполнен. */
export type Evidence =
  | { kind: "exit_code"; code: number }
  | { kind: "path_exists"; path: string; exists: boolean }
  | { kind: "stdout_marker"; marker: string; found: boolean }
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
