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
