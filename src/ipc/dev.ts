/**
 * Адаптер для разработки в браузере (`npm run dev` без Tauri).
 *
 * Зачем: UI нужно верстать и показывать без сборки Rust-ядра, а данные уже есть в
 * репозитории. Этот модуль читает `data/actions.json` напрямую и собирает тот же
 * `RegistrySnapshot`, который отдаёт IPC-команда `registry_snapshot` в приложении.
 *
 * Правило: в приложении этот файл не используется — `src/ipc/index.ts` подключает
 * его только когда ядро недоступно. Логика выбора действий, риска и политики живёт
 * в Rust, здесь — только отображение данных.
 */

import actionsJson from "../../data/actions.json";
import type { Action, RegistrySnapshot, RegistryStats } from "./types";
import { RISK_ORDER, STATUS_ORDER, TIER_ORDER } from "./types";

const ROWS = actionsJson as unknown as Action[];

export function emptyRisk(): RegistryStats["byRisk"] {
  return { read: 0, "write-local": 0, external: 0, destructive: 0, identity: 0, money: 0 };
}

export function buildStats(rows: Action[]): RegistryStats {
  const byRisk = emptyRisk();
  const byTier: RegistryStats["byTier"] = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const byStatus: RegistryStats["byStatus"] = { v1: 0, v2: 0, later: 0, never: 0 };

  for (const row of rows) {
    byRisk[row.risk] += 1;
    byTier[row.tier] += 1;
    byStatus[row.status] += 1;
  }

  return {
    actions: rows.length,
    domains: new Set(rows.map((r) => r.domain)).size,
    verbs: new Set(rows.map((r) => r.verb)).size,
    byRisk,
    byTier,
    byStatus,
  };
}

export async function registrySnapshot(): Promise<RegistrySnapshot> {
  return { actions: ROWS, stats: buildStats(ROWS) };
}

/** Только для тестов: убедиться, что порядок риска покрывает все значения. */
export const DEV_ORDERS = { RISK_ORDER, TIER_ORDER, STATUS_ORDER };

// ── Инструменты в браузере ───────────────────────────────────────────────────
//
// Ядро выполняет инструменты на Windows; браузер — нет. Здесь мы только показываем
// тот же список с тем же решением политики, чтобы экран можно было верстать.
// Любая попытка запуска честно заканчивается ошибкой, а не имитацией успеха.

import toolsJson from "../../data/tools.json";
import { decide, decisionReason } from "../lib/policy";
import type { ToolView } from "./types";

const TOOL_SPECS = toolsJson as unknown as {
  registry: string;
  title: string;
  summary: string;
  implementation: string;
  params: { name: string; label: string; placeholder: string; hint: string; required: boolean }[];
}[];

export async function listTools(): Promise<ToolView[]> {
  return TOOL_SPECS.map((spec) => {
    const action = ROWS.find((row) => `${row.domain}|${row.verb}|${row.object}` === spec.registry);
    if (!action) {
      // Данные разъехались — это ошибка сборки данных, а не пользователя.
      throw new Error(`нет действия в реестре для инструмента ${spec.registry}`);
    }
    const decision = decide(action);
    return {
      registry: spec.registry,
      title: spec.title,
      summary: spec.summary,
      implementation: spec.implementation,
      params: spec.params,
      risk: action.risk,
      risk_needs_human: action.risk !== "read",
      decision,
      decision_reason: decisionReason(decision, action.risk),
      needs_token: decision === "confirm",
    };
  });
}

export async function runTool(
  registry: string,
  _params: Record<string, string>,
  _token?: number,
): Promise<never> {
  throw new Error(
    `«${registry}» выполняется только в приложении: браузер не получает доступ к системе. Запусти npm run tauri dev.`,
  );
}

export async function confirmTool(
  _registry: string,
  _params: Record<string, string>,
): Promise<never> {
  throw new Error("подтверждения выдаёт ядро — в браузере их нет");
}

// ── Сценарии в браузере ─────────────────────────────────────────────────────
//
// Ядро отдаёт сценарии командой `list_flows`. Здесь тот же список собирается из
// `data/flows.json`, чтобы экран верстался без Rust. Исполнение сценария в браузере
// невозможно по той же причине, что и одиночного инструмента.

import flowsJson from "../../data/flows.json";
import type { AuditEvent, Decision, FlowStepView, FlowView, Risk } from "./types";

const FLOW_SPECS = flowsJson as unknown as {
  id: string;
  title: string;
  summary: string;
  registry: string;
  inputs: { name: string; label: string; placeholder: string; hint: string; required: boolean }[];
  steps: { tool: string; note: string; params: Record<string, string> }[];
}[];

/** Строка реестра по ключу — с решением политики, без привязки к инструменту. */
function actionView(registry: string): { risk: Risk; decision: Decision; reason: string } {
  const action = ROWS.find((row) => `${row.domain}|${row.verb}|${row.object}` === registry);
  if (!action) {
    throw new Error(`нет строки реестра: ${registry}`);
  }
  const decision = decide(action);
  return { risk: action.risk, decision, reason: decisionReason(decision, action.risk) };
}

function toolViewByKey(registry: string): ToolView {
  const spec = TOOL_SPECS.find((candidate) => candidate.registry === registry);
  const action = ROWS.find((row) => `${row.domain}|${row.verb}|${row.object}` === registry);
  if (!spec || !action) {
    throw new Error(`нет данных для шага сценария: ${registry}`);
  }
  const decision = decide(action);
  return {
    registry: spec.registry,
    title: spec.title,
    summary: spec.summary,
    implementation: spec.implementation,
    params: spec.params,
    risk: action.risk,
    risk_needs_human: action.risk !== "read",
    decision,
    decision_reason: decisionReason(decision, action.risk),
    needs_token: decision === "confirm",
  };
}

export async function listFlows(): Promise<FlowView[]> {
  return FLOW_SPECS.map((spec) => {
    const head = actionView(spec.registry);
    const steps: FlowStepView[] = spec.steps.map((step) => {
      const tool = toolViewByKey(step.tool);
      return {
        tool: step.tool,
        title: tool.title,
        note: step.note,
        params: step.params,
        risk: tool.risk,
        decision: tool.decision,
        decision_reason: tool.decision_reason,
        needs_token: tool.needs_token,
      };
    });

    return {
      id: spec.id,
      title: spec.title,
      summary: spec.summary,
      registry: spec.registry,
      risk: head.risk,
      decision: head.decision,
      decision_reason: head.reason,
      needs_token: head.decision === "confirm",
      inputs: spec.inputs,
      steps,
    };
  });
}

/**
 * Журнала в браузере нет: его пишет ядро на этой машине. Честный ответ — пустой
 * список, а не выдуманные события: экран покажет «пока пусто» и объяснение.
 */
export async function auditTail(_limit: number): Promise<AuditEvent[]> {
  return [];
}
