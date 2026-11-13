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
import type { Action, MachineState, RegistrySnapshot, RegistryStats, UiDump, UiPress } from "./types";
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
  EngineStatus,
  Episode,
  Learning,
  HashCheck,
  ModelsView,
  Plan,
  PlanAnswer,
  PlanCheck,
  PlanReport,
  RoleView,
  CustomHand,
  Fact,
  HandDraft,
  TrialReport,
  ForegroundWindow,
  IsolationStatus,
  SpeechStatus,
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

export async function searchEpisodes(_query: string, _limit = 20): Promise<Episode[]> {
  // Памяти в браузере нет: пустой ответ здесь честнее выдуманных запусков.
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

/**
 * Черновик плана в браузере: то же правило, что в ядре (`plan::draft`) — первый
 * найденный шаг, у которого есть рука и который не запрещён. Параметров здесь нет:
 * памяти в браузере тоже нет, поэтому план честно скажет, каких данных не хватает.
 */
export async function draftPlan(query: string): Promise<PlanCheck | null> {
  const found = await planFor(query, 8);
  const item = found.find((candidate) => candidate.tool && candidate.decision !== "deny");
  if (!item) return null;

  const plan: Plan = {
    goal: query,
    source: "registry",
    steps: [
      {
        registry: item.key,
        params: {},
        why: `единственное, что здесь умею и что подходит: ${item.example}`,
      },
    ],
  };

  return buildCheck(plan, item.decision, item.risk);
}

/** Вопросы и проблемы по плану — по тем же данным, что читает ядро. */
function buildCheck(
  plan: Plan,
  decision: string,
  risk: string,
): PlanCheck {
  const questions = (plan.steps ?? []).flatMap((step, index) =>
    missingQuestions(step.registry, index + 1, step.params ?? {}),
  );

  const first = plan.steps?.[0];
  return {
    plan,
    gates: first
      ? [
          {
            position: 1,
            registry: first.registry,
            decision: decision as PlanCheck["gates"][number]["decision"],
            risk,
            wants_approval: decision === "confirm",
          },
        ]
      : [],
    questions,
    problems: questions.map((question) => ({
      position: question.position,
      registry: first?.registry ?? "",
      problem: `шагу не хватает данных: не задан параметр «${question.label}»`,
    })),
  };
}

/** Обязательные параметры шага, которых в нём нет. */
function missingQuestions(
  key: string,
  position: number,
  params: Record<string, string>,
) {
  const tool = TOOL_SPECS.find((candidate) => candidate.registry === key);
  const required = tool?.params.filter((param) => param.required) ?? [];

  return required
    .filter((param) => (params[param.name] ?? "").trim().length === 0)
    .map((param) => ({
      position,
      name: param.name,
      label: param.label,
      hint: param.hint,
    }));
}

/**
 * Ответы вписываются в план и вопросы пересчитываются. Полной проверки здесь нет и
 * быть не может — политика и руки живут в ядре, а исполнение в браузере всё равно
 * отказывает; показываем ровно то, что умеем проверить: хватает ли данных.
 */
export async function fillPlan(json: string, answers: PlanAnswer[]): Promise<PlanCheck> {
  const plan = JSON.parse(json) as Plan;

  for (const answer of answers) {
    const step = plan.steps[answer.position - 1];
    if (!step) continue;
    step.params = { ...(step.params ?? {}), [answer.name]: answer.value.trim() };
  }

  const item = (await planFor(plan.goal, 8)).find(
    (candidate) => candidate.key === plan.steps[0]?.registry,
  );

  return buildCheck(plan, item?.decision ?? "allow", item?.risk ?? "read");
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

// ── Движок в браузере ───────────────────────────────────────────────────────
//
// Процессов в браузере нет: состояние честное («не найден, не запущен»), а запуск
// отвечает отказом. Имитировать работающий движок значило бы врать про готовность.

export async function engineStatus(): Promise<EngineStatus> {
  return { found: false, program: null, search_dir: "", running: false, port: null, pid: null };
}

export async function startEngine(_name: string): Promise<EngineStatus> {
  throw new Error("движок запускает приложение: в браузере нет процессов");
}

export async function stopEngine(): Promise<EngineStatus> {
  return engineStatus();
}

// ── Роли в браузере ─────────────────────────────────────────────────────────
//
// Требования ролей — те же данные, что читает ядро (`data/roles.json`), поэтому
// экран верстается без Rust. Назначений здесь нет: они хранятся в памяти ядра.

import rolesJson from "../../data/roles.json";

const ROLE_SPECS = rolesJson.roles as unknown as {
  id: string;
  title: string;
  purpose: string;
  max_bytes: number;
}[];

export async function listRoles(): Promise<RoleView[]> {
  return ROLE_SPECS.map((role) => ({
    ...role,
    assigned: null,
    assigned_bytes: null,
    fits: true,
  }));
}

export async function assignRole(_role: string, _name: string): Promise<RoleView[]> {
  throw new Error("назначение хранится в памяти приложения — в браузере её нет");
}

export async function clearRole(_role: string): Promise<RoleView[]> {
  throw new Error("назначение хранится в памяти приложения — в браузере её нет");
}

// ── Планы в браузере ────────────────────────────────────────────────────────
//
// Проверка плана — это реестр плюс политика плюс наличие «руки». Зеркалить её в TS
// значило бы держать третью правду о том, что исполнимо. Поэтому здесь честный отказ,
// а интерфейс в браузере просто не показывает проверялку.

export async function checkPlan(_json: string): Promise<PlanCheck> {
  throw new Error("план проверяет приложение: правила реестра и политики живут в ядре");
}

export async function savePlan(_json: string): Promise<PlanCheck> {
  throw new Error("план сохраняет приложение: память живёт в ядре");
}

export async function lastPlan(): Promise<Plan | null> {
  return null;
}

export async function runPlan(_json: string, _approved: number[]): Promise<PlanReport> {
  // План исполняет ядро: руки, политика и отмена живут там, и повторять это в браузере
  // значило бы обещать то, чего браузер не умеет.
  throw new Error("план исполняет приложение: руки и политика живут в ядре");
}

// ── Локальное распознавание в браузере ──────────────────────────────────────

// ── Черновики рук в браузере ────────────────────────────────────────────────

export async function draftHand(): Promise<never> {
  throw new Error("черновик руки пишет модель: в браузере её нет");
}

export async function adoptHand(): Promise<never> {
  // Принять руку можно только после пробы в клетке, а клетки в браузере нет.
  throw new Error("привнесённые руки живут в приложении: без пробы в клетке их не бывает");
}

export async function customHands(): Promise<CustomHand[]> {
  return [];
}

export async function removeCustomHand(): Promise<void> {
  // Нечего убирать: руки тут не создаются.
}

export async function runCustomHand(): Promise<never> {
  throw new Error("своя рука запускается только в клетке Windows: в браузере запуска нет");
}

export async function customRunReport(): Promise<TrialReport | null> {
  return null;
}

export async function trialHand(): Promise<never> {
  // Клетка — это Windows и настоящее рабочее место. В браузере пробы нет, и выдумывать
  // «код 0» нельзя: человек поверил бы, что черновик проверен.
  throw new Error("проба идёт в клетке Windows: в браузере её нет");
}

export async function trialReport(): Promise<TrialReport | null> {
  return null;
}

export async function handDrafts(): Promise<HandDraft[]> {
  // В браузере память лежит в localStorage — читаем те же черновики, что записало приложение
  // при последнем запуске на этой машине, но ничего не придумываем.
  return [];
}

export async function forgetHand(): Promise<void> {
  // Нечего забывать: черновики тут не создаются.
}

// ── Модель в браузере ───────────────────────────────────────────────────────

export async function think(): Promise<never> {
  // В браузере нет ни движка на петле, ни реестра: придумывать «модель ответила» нельзя,
  // иначе человек поверит, что помощник что-то понял.
  throw new Error("модель работает только в приложении: в браузере нет движка на 127.0.0.1");
}

// ── Вопрос к модели в браузере ──────────────────────────────────────────────

export async function modelPrompt(): Promise<string> {
  // Вопрос к модели собирает ядро из реестра и памяти на диске. Повторить его здесь
  // значило бы завести вторую версию правил, которая разойдётся с первой.
  throw new Error("вопрос к модели собирает только приложение: в браузере реестра и памяти нет");
}

// ── Память фактов в браузере ────────────────────────────────────────────────

const FACTS_KEY = "jar.facts";

function readFacts(): Fact[] {
  try {
    const raw = globalThis.localStorage?.getItem(FACTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is Fact => typeof row === "object" && row !== null)
      .filter((row) => typeof row.key === "string" && typeof row.value === "string")
      .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  } catch {
    // Испорченная память — это пустая память, а не падение экрана.
    return [];
  }
}

function writeFacts(facts: Fact[]): void {
  try {
    globalThis.localStorage?.setItem(FACTS_KEY, JSON.stringify(facts));
  } catch {
    // Места нет или браузер запретил — сказать об этом нечего, но и врать не надо.
  }
}

export async function facts(): Promise<Fact[]> {
  return readFacts();
}

export async function rememberFact(key: string, value: string): Promise<void> {
  const cleanKey = key.trim();
  const cleanValue = value.trim();
  if (cleanKey.length === 0 || cleanValue.length === 0) {
    throw new Error("нечего запоминать: нужен и вопрос, и ответ");
  }

  const rest = readFacts().filter((fact) => fact.key !== cleanKey);
  writeFacts([...rest, { key: cleanKey, value: cleanValue }].sort((a, b) => (a.key < b.key ? -1 : 1)));
}

export async function forgetFact(key: string): Promise<void> {
  writeFacts(readFacts().filter((fact) => fact.key !== key.trim()));
}

// ── Активное окно в браузере ────────────────────────────────────────────────

export async function foregroundWindow(): Promise<ForegroundWindow> {
  // В браузере окон Windows нет. Придумывать «Блокнот» было бы хуже пустоты: человек
  // решил бы, что приложение видит его экран.
  throw new Error("активное окно видит только приложение: в браузере окон системы нет");
}

export async function uiPress(): Promise<UiPress> {
  // В браузере нажимать нечего: окон Windows нет. Изображать нажатие было бы худшим
  // видом вранья — человек решил бы, что помощник что-то сделал на его машине.
  throw new Error("нажимать элементы можно только в приложении: в браузере окон нет");
}

export async function machineState(): Promise<MachineState> {
  // В браузере машины нет: ни ядер, ни памяти. Отвечаем так, чтобы это было видно, —
  // «одно дело, осторожно», а не «всё свободно».
  return {
    sample: null,
    budget: {
      parallel: 1,
      mode: "near",
      reason: "в браузере машину не измерить — беру одно дело и осторожно",
      may_start: true,
    },
    available: false,
    note: "машина измеряется в приложении: здесь её загрузку не видно",
  };
}

export async function uiDump(): Promise<UiDump> {
  // В браузере нет ни UI Automation, ни окон Windows. Придумать дерево «Вход → кнопка»
  // было бы особенно соблазнительно и особенно вредно: человек решил бы, что помощник
  // видит его экран, а он не видит ничего.
  throw new Error(
    "элементы окна видит только приложение: в браузере нет UI Automation",
  );
}

// ── Потолки запуска в браузере ──────────────────────────────────────────────

export async function isolationStatus(): Promise<IsolationStatus> {
  // Запускать в браузере нечего, поэтому и потолков нет. Врать «всё под контролем»
  // здесь было бы особенно легко — и особенно вредно.
  return {
    available: false,
    summary: "в браузере процессов нет",
    note: "потолки живут в ядре приложения: здесь запускать нечего",
  };
}

export async function speechStatus(): Promise<SpeechStatus> {
  // В браузере движка нет по определению: это файл рядом с приложением.
  return {
    found: false,
    program: null,
    model: null,
    search_dir: "sidecars/ — рядом с приложением",
    models_dir: "папка моделей приложения",
  };
}

export async function transcribeLocal(_audio: number[]): Promise<string> {
  throw new Error("локальное распознавание живёт в приложении: движок — файл рядом с ним");
}

// ── Чему учиться в браузере ─────────────────────────────────────────────────
//
// Памяти здесь нет, поэтому счётчик всегда 1: просьба живёт до перезагрузки страницы.
// Это не притворство — в приложении она хранится, и там счётчик настоящий.

export async function requestLearning(query: string): Promise<Learning | null> {
  const found = await planFor(query, 8);
  const item = found[0];
  if (!item || item.tool) return null;

  const row = ROWS.find((candidate) => `${candidate.domain}|${candidate.verb}|${candidate.object}` === item.key);
  if (!row) return null;

  const implementation = row.implementation ?? [];
  return {
    registry: item.key,
    example: row.example,
    query,
    implementation,
    risk: row.risk,
    notes: row.notes ?? "",
    asked_ms: Date.now(),
    times: 1,
    steps: learningSteps(implementation, row.example),
  };
}

export async function learningRequests(): Promise<Learning[]> {
  return [];
}

/** Тот же чек-лист, что в ядре: галочка стоит только там, где знание уже есть. */
function learningSteps(implementation: string[], example: string) {
  return [
    {
      title:
        implementation.length > 0
          ? `Найти, чем это делается: ${implementation.join(", ")}`
          : "чем это делается — пока неизвестно: искать документацию и способ",
      done: implementation.length > 0,
    },
    { title: "Проверить, что нужное есть на этой машине (программа, доступ, права)", done: false },
    { title: "Написать руку и подключить её к реестру", done: false },
    { title: `Проверить на живом примере: «${example}»`, done: false },
  ];
}
