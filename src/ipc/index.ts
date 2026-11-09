/**
 * Единственная точка доступа UI к ядру.
 *
 * В приложении работает адаптер Tauri, в браузере (разработка и предпросмотр) —
 * dev-адаптер, читающий те же данные из репозитория. Компоненты не знают, какой
 * из них подключён, поэтому верстку можно делать без Rust-тулчейна.
 */

export type {
  Action,
  AuditEvent,
  AuditKind,
  ConfirmToken,
  Decision,
  Evidence,
  FlowInput,
  FlowStepView,
  FlowView,
  ModelFile,
  ModelsView,
  ParamSpec,
  PlanItem,
  ProfileOpView,
  ProfileView,
  RegistrySnapshot,
  RegistryStats,
  RunRecord,
  Risk,
  StepResult,
  Tier,
  ToolView,
} from "./types";
export { RISK_ORDER, STATUS_ORDER, TIER_ORDER } from "./types";

import type {
  AuditEvent,
  ConfirmToken,
  FlowView,
  ModelsView,
  PlanItem,
  ProfileView,
  RunRecord,
  StepResult,
  ToolView,
} from "./types";

/** Ядро Tauri ставит это поле на window до загрузки фронтенда. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function registrySnapshot() {
  if (isTauri()) {
    const { registrySnapshot: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { registrySnapshot: fromData } = await import("./dev");
  return fromData();
}

// ── Инструменты ──────────────────────────────────────────────────────────────

export async function listTools(): Promise<ToolView[]> {
  if (isTauri()) {
    const { listTools: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { listTools: fromData } = await import("./dev");
  return fromData();
}

/** В браузере инструменты не выполняются: это делает только ядро. */
export async function runTool(
  registry: string,
  params: Record<string, string>,
  token?: number,
): Promise<StepResult> {
  if (isTauri()) {
    const { runTool: fromCore } = await import("./tauri");
    return fromCore(registry, params, token);
  }
  const { runTool: fromData } = await import("./dev");
  return fromData(registry, params, token);
}

export async function confirmTool(
  registry: string,
  params: Record<string, string>,
): Promise<ConfirmToken> {
  if (isTauri()) {
    const { confirmTool: fromCore } = await import("./tauri");
    return fromCore(registry, params);
  }
  const { confirmTool: fromData } = await import("./dev");
  return fromData(registry, params);
}

export async function cancelTool(): Promise<void> {
  if (isTauri()) {
    const { cancelTool: fromCore } = await import("./tauri");
    return fromCore();
  }
}

// ── Сценарии ────────────────────────────────────────────────────────────────
//
// Сценарий — это данные, а не отдельная команда ядра: шаги исполняются тем же
// `runTool`, что и одиночный инструмент, со своими подтверждениями и журналом.

export async function listFlows(): Promise<FlowView[]> {
  if (isTauri()) {
    const { listFlows: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { listFlows: fromData } = await import("./dev");
  return fromData();
}

// ── Журнал ──────────────────────────────────────────────────────────────────

/** Последние события журнала, новые сверху. В браузере журнала нет. */
export async function auditTail(limit = 100): Promise<AuditEvent[]> {
  if (isTauri()) {
    const { auditTail: fromCore } = await import("./tauri");
    return fromCore(limit);
  }
  const { auditTail: fromData } = await import("./dev");
  return fromData(limit);
}

// ── Профили приложений ──────────────────────────────────────────────────────

/** Каталог приложений: описание операций и что из них уже исполняется. */
export async function listProfiles(): Promise<ProfileView[]> {
  if (isTauri()) {
    const { listProfiles: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { listProfiles: fromData } = await import("./dev");
  return fromData();
}

// ── Память ──────────────────────────────────────────────────────────────────

/**
 * Последние запуски из памяти приложения. В отличие от журнала это структура:
 * запуск, шаг, итог. В браузере памяти нет — там пусто.
 */
export async function memoryRuns(limit = 20): Promise<RunRecord[]> {
  if (isTauri()) {
    const { memoryRuns: fromCore } = await import("./tauri");
    return fromCore(limit);
  }
  const { memoryRuns: fromData } = await import("./dev");
  return fromData(limit);
}

// ── Поиск по реестру ────────────────────────────────────────────────────────

/**
 * «Что нужно сделать?» — поиск действий по фразе. В приложении считает Rust
 * (`planner.rs`), в браузере — его зеркало (`src/lib/planner.ts`). Возвращается не
 * план, а кандидаты: у каждого видно решение политики и есть ли уже инструмент.
 */
export async function planFor(query: string, limit = 8): Promise<PlanItem[]> {
  if (isTauri()) {
    const { planFor: fromCore } = await import("./tauri");
    return fromCore(query, limit);
  }
  const { planFor: fromData } = await import("./dev");
  return fromData(query, limit);
}

// ── Модели ──────────────────────────────────────────────────────────────────

/**
 * Что лежит в папке моделей. Ядро читает заголовки `.gguf`; в браузере папки нет,
 * поэтому список пуст, а путь пустой — экран честно об этом говорит.
 */
export async function listModels(): Promise<ModelsView> {
  if (isTauri()) {
    const { listModels: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { listModels: fromData } = await import("./dev");
  return fromData();
}
