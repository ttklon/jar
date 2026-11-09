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
      // Памяти в браузере нет: подставлять нечего.
      last_params: null,
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
import type {
  AuditEvent,
  Decision,
  Downloaded,
  HashCheck,
  ModelsView,
  PlanItem,
  RunRecord,
  FlowStepView,
  FlowView,
  ProfileOpView,
  ProfileView,
  Risk,
} from "./types";

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

// ── Профили приложений в браузере ───────────────────────────────────────────
//
// Ядро отдаёт профили командой `list_profiles`. Здесь та же сводка читается из
// `data/profiles.json`, а решение политики считается тем же зеркалом, что и для
// остальных экранов, — чтобы верстка не зависела от Rust.

import profilesJson from "../../data/profiles.json";

const PROFILE_SPECS = profilesJson as unknown as {
  slug: string;
  app: string;
  kind: string;
  exe: string[];
  ui_stack: string;
  version_seen: string;
  verified_at: string;
  anchors: number;
  operations: { name: string; registry: string; risk: Risk }[];
}[];

export async function listProfiles(): Promise<ProfileView[]> {
  return PROFILE_SPECS.map((spec) => {
    const operations: ProfileOpView[] = spec.operations.map((operation) => {
      // Ссылка профиля может быть короткой: `domain|verb` или `domain|verb|часть объекта`.
      // Ядро берёт самую рискованную подходящую строку — здесь так же.
      const [domain, verb, object] = operation.registry.split("|");
      const action = ROWS.filter(
        (row) =>
          row.domain === domain &&
          row.verb === verb &&
          (object === undefined || row.object.includes(object)),
      ).sort((left, right) => RISK_ORDER.indexOf(right.risk) - RISK_ORDER.indexOf(left.risk))[0];
      if (!action) {
        // Ссылка профиля не разрешилась — это ошибка данных, показываем её как отказ.
        return {
          name: operation.name,
          registry: operation.registry,
          resolved: "",
          risk: "unknown" as const,
          decision: "deny" as const,
          decision_reason: "в реестре нет такой строки",
          needs_token: false,
          has_tool: false,
        };
      }
      const decision = decide(action);
      return {
        name: operation.name,
        registry: operation.registry,
        resolved: `${action.domain}|${action.verb}|${action.object}`,
        risk: action.risk,
        decision,
        decision_reason: decisionReason(decision, action.risk),
        needs_token: decision === "confirm",
        has_tool: TOOL_SPECS.some(
          (tool) => tool.registry === `${action.domain}|${action.verb}|${action.object}`,
        ),
      };
    });

    return {
      slug: spec.slug,
      app: spec.app,
      kind: spec.kind,
      exe: spec.exe,
      ui_stack: spec.ui_stack,
      version_seen: spec.version_seen,
      verified_at: spec.verified_at,
      anchors: spec.anchors,
      executable: operations.filter((operation) => operation.has_tool).length,
      operations,
    };
  });
}

/**
 * Память приложения живёт в SQLite рядом с журналом. В браузере её нет: честный
 * ответ — пустой список, а не выдуманные запуски.
 */
export async function memoryRuns(_limit: number): Promise<RunRecord[]> {
  return [];
}

// ── Поиск по реестру в браузере ─────────────────────────────────────────────
//
// Ядро ищет фразой по реестру (`plan_for`). Здесь правила повторены в
// `src/lib/planner.ts`, чтобы экран «Спросить» показывал тот же ответ без Rust.

import { plan } from "../lib/planner";

const TOOL_KEYS: ReadonlySet<string> = new Set(TOOL_SPECS.map((spec) => spec.registry));

export async function planFor(query: string, limit = 8): Promise<PlanItem[]> {
  return plan(
    { actions: ROWS, tools: TOOL_KEYS, decide, reason: decisionReason },
    query,
    Math.min(Math.max(limit, 1), 50),
  );
}

// ── Модели в браузере ───────────────────────────────────────────────────────
//
// Браузер не видит файловую систему, поэтому и списка нет. Пустой путь и пустой
// список — не ошибка: экран сам скажет, что смотреть надо в приложении.

export async function listModels(): Promise<ModelsView> {
  return { dir: "", items: [], error: null, total_bytes: 0, free_bytes: null };
}

/** Удалять в браузере нечего: файлов на диске тоже нет. */
export async function removeModel(_name: string): Promise<void> {
  throw new Error("удаляет приложение: в браузере нет файлов на диске");
}

/**
 * Хеша в браузере нет: файлов на диске тоже нет, а придумывать ответ значило бы
 * врать про проверку. Честнее сказать, что это делает только приложение.
 */
export async function verifyModel(_name: string): Promise<HashCheck> {
  throw new Error("хеш считает приложение: в браузере нет файлов на диске");
}

/** Скачивает только ядро: иначе интерфейс обещал бы файл, которого нет. */
export async function downloadModel(
  _url: string,
  _name: string,
  _sha256?: string,
): Promise<Downloaded> {
  throw new Error("скачивание делает приложение: запустите npm run tauri dev");
}
