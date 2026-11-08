/**
 * Единственная точка доступа UI к ядру.
 *
 * В приложении работает адаптер Tauri, в браузере (разработка и предпросмотр) —
 * dev-адаптер, читающий те же данные из репозитория. Компоненты не знают, какой
 * из них подключён, поэтому верстку можно делать без Rust-тулчейна.
 */

export type {
  Action,
  ConfirmToken,
  Decision,
  Evidence,
  FlowInput,
  FlowStepView,
  FlowView,
  ParamSpec,
  RegistrySnapshot,
  RegistryStats,
  Risk,
  StepResult,
  Tier,
  ToolView,
} from "./types";
export { RISK_ORDER, STATUS_ORDER, TIER_ORDER } from "./types";

import type { ConfirmToken, FlowView, StepResult, ToolView } from "./types";

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
