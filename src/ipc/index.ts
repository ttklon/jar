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
  Downloaded,
  EngineStatus,
  CustomHand,
  Episode,
  Evidence,
  Fact,
  FlowInput,
  FlowStepView,
  FlowView,
  HashCheck,
  Learning,
  ModelFile,
  ModelsView,
  ParamSpec,
  Plan,
  PlanAnswer,
  PlanCheck,
  PlanGate,
  PlanQuestion,
  PlanItem,
  PlanProblem,
  PlanReport,
  ProfileOpView,
  ProfileView,
  RegistrySnapshot,
  RegistryStats,
  RunRecord,
  RunStep,
  Risk,
  RoleView,
  ForegroundWindow,
  HandDraft,
  IsolationStatus,
  Proposal,
  TrialReport,
  Thought,
  SpeechStatus,
  StepResult,
  Tier,
  ToolView,
  MachineState,
  UiDump,
  UiElement,
} from "./types";
export { RISK_ORDER, STATUS_ORDER, TIER_ORDER } from "./types";

import type { AuditEvent, ConfirmToken, CustomHand, Downloaded, EngineStatus, Episode, Fact, FlowView, ForegroundWindow, HandDraft, HashCheck, IsolationStatus, Learning, MachineState, ModelsView, Plan, PlanAnswer, PlanCheck, PlanItem, PlanReport, ProfileView, RoleView, RunRecord, SpeechStatus, StepResult, Thought, ToolView, TrialReport, UiDump } from "./types";

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

/**
 * Поиск по прошлым запускам: «что я делал с этой папкой?». Каждое слово запроса
 * обязано найтись; ответ называет совпавшие слова.
 */
export async function searchEpisodes(query: string, limit = 20): Promise<Episode[]> {
  if (isTauri()) {
    const { searchEpisodes: fromCore } = await import("./tauri");
    return fromCore(query, limit);
  }
  const { searchEpisodes: fromData } = await import("./dev");
  return fromData(query, limit);
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

/** Сверка хеша файла модели: та же папка, тот же вопрос, ответ из памяти. */
export async function verifyModel(name: string): Promise<HashCheck> {
  if (isTauri()) {
    const { verifyModel: fromCore } = await import("./tauri");
    return fromCore(name);
  }
  const { verifyModel: fromData } = await import("./dev");
  return fromData(name);
}

/**
 * Скачать файл модели по ссылке. Ссылку даёт человек: приложение не знает адресов,
 * которые не проверило. В браузере скачивания нет — файлов на диске тоже нет.
 */
export async function downloadModel(
  url: string,
  name: string,
  sha256?: string,
): Promise<Downloaded> {
  if (isTauri()) {
    const { downloadModel: fromCore } = await import("./tauri");
    return fromCore(url, name, sha256);
  }
  const { downloadModel: fromData } = await import("./dev");
  return fromData(url, name, sha256);
}

/**
 * Удалить файл модели. Необратимо, поэтому вызывается только после подтверждения
 * в интерфейсе; в браузере файлов нет — там отказ, а не тихий успех.
 */
export async function removeModel(name: string): Promise<void> {
  if (isTauri()) {
    const { removeModel: fromCore } = await import("./tauri");
    return fromCore(name);
  }
  const { removeModel: fromData } = await import("./dev");
  return fromData(name);
}

// ── Движок моделей ──────────────────────────────────────────────────────────

/** Состояние `llama-server`: найден ли бинарник и запущен ли он. */
export async function engineStatus(): Promise<EngineStatus> {
  if (isTauri()) {
    const { engineStatus: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { engineStatus: fromData } = await import("./dev");
  return fromData();
}

/**
 * Запустить движок с файлом модели. В браузере процессов нет — там отказ,
 * и он честно объясняет, почему.
 */
export async function startEngine(name: string): Promise<EngineStatus> {
  if (isTauri()) {
    const { startEngine: fromCore } = await import("./tauri");
    return fromCore(name);
  }
  const { startEngine: fromData } = await import("./dev");
  return fromData(name);
}

/** Остановить движок. В приложении это делает ядро по PID. */
export async function stopEngine(): Promise<EngineStatus> {
  if (isTauri()) {
    const { stopEngine: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { stopEngine: fromData } = await import("./dev");
  return fromData();
}

// ── Роли моделей ────────────────────────────────────────────────────────────

/** Роли и то, что на них назначено. В браузере назначений нет — память живёт в ядре. */
export async function listRoles(): Promise<RoleView[]> {
  if (isTauri()) {
    const { listRoles: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { listRoles: fromData } = await import("./dev");
  return fromData();
}

/** Назначить файл на роль. Ядро проверит, что файл существует. */
export async function assignRole(role: string, name: string): Promise<RoleView[]> {
  if (isTauri()) {
    const { assignRole: fromCore } = await import("./tauri");
    return fromCore(role, name);
  }
  const { assignRole: fromData } = await import("./dev");
  return fromData(role, name);
}

/** Снять назначение с роли. */
export async function clearRole(role: string): Promise<RoleView[]> {
  if (isTauri()) {
    const { clearRole: fromCore } = await import("./tauri");
    return fromCore(role);
  }
  const { clearRole: fromData } = await import("./dev");
  return fromData(role);
}

// ── Планы ───────────────────────────────────────────────────────────────────

/**
 * Проверить план из JSON: каждая строка — реестр, у каждой есть «рука», политика не
 * против, у шага есть «зачем». Ничего не исполняет.
 */
export async function checkPlan(json: string): Promise<PlanCheck> {
  if (isTauri()) {
    const { checkPlan: fromCore } = await import("./tauri");
    return fromCore(json);
  }
  const { checkPlan: fromData } = await import("./dev");
  return fromData(json);
}

/** Запустить проверенный план. `approved` — номера шагов, которые человек разрешил. */
export async function runPlan(json: string, approved: number[]): Promise<PlanReport> {
  if (isTauri()) {
    const { runPlan: fromCore } = await import("./tauri");
    return fromCore(json, approved);
  }
  const { runPlan: fromData } = await import("./dev");
  return fromData(json, approved);
}

/**
 * Черновик плана по сказанному: один шаг из реестра, который приложение правда умеет,
 * с данными из памяти прошлого запуска. `null` — предложить нечего.
 */
export async function draftPlan(query: string): Promise<PlanCheck | null> {
  if (isTauri()) {
    const { draftPlan: fromCore } = await import("./tauri");
    return fromCore(query);
  }
  const { draftPlan: fromData } = await import("./dev");
  return fromData(query);
}

/**
 * Ответить на вопросы плана: вписать недостающие данные и перепроверить.
 * Это уточнение, а не запуск — запуск остаётся отдельным решением.
 */
export async function fillPlan(json: string, answers: PlanAnswer[]): Promise<PlanCheck> {
  if (isTauri()) {
    const { fillPlan: fromCore } = await import("./tauri");
    return fromCore(json, answers);
  }
  const { fillPlan: fromData } = await import("./dev");
  return fromData(json, answers);
}

/** Сохранить проверенный план в памяти. Невалидный не сохраняется. */
export async function savePlan(json: string): Promise<PlanCheck> {
  if (isTauri()) {
    const { savePlan: fromCore } = await import("./tauri");
    return fromCore(json);
  }
  const { savePlan: fromData } = await import("./dev");
  return fromData(json);
}

export async function lastPlan(): Promise<Plan | null> {
  if (isTauri()) {
    const { lastPlan: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { lastPlan: fromData } = await import("./dev");
  return fromData();
}

// ── Чему учиться ────────────────────────────────────────────────────────────

/**
 * Записать сказанное как задачу на обучение. Вызывается, когда приложение не нашло,
 * чем это выполнить: «не умею» превращается в задачу, а не в тупик.
 */
export async function requestLearning(query: string): Promise<Learning | null> {
  if (isTauri()) {
    const { requestLearning: fromCore } = await import("./tauri");
    return fromCore(query);
  }
  const { requestLearning: fromData } = await import("./dev");
  return fromData(query);
}

/** Всё, чему приложение ещё не научилось, — самое просимое сверху. */
export async function learningRequests(): Promise<Learning[]> {
  if (isTauri()) {
    const { learningRequests: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { learningRequests: fromData } = await import("./dev");
  return fromData();
}

// ── Локальное распознавание ─────────────────────────────────────────────────

/** Попросить модель написать черновик руки. Черновик не исполняется никогда. */
export async function draftHand(key: string): Promise<HandDraft> {
  if (isTauri()) {
    const { draftHand: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { draftHand: fromData } = await import("./dev");
  return fromData();
}

/** Принять проверенный черновик в привнесённые руки. Явное действие человека. */
export async function adoptHand(key: string, title = ""): Promise<CustomHand> {
  if (isTauri()) {
    const { adoptHand: fromCore } = await import("./tauri");
    return fromCore(key, title);
  }
  const { adoptHand: fromData } = await import("./dev");
  return fromData();
}

/** Привнесённые руки: то, что человек добавил сам. */
export async function customHands(): Promise<CustomHand[]> {
  if (isTauri()) {
    const { customHands: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { customHands: fromData } = await import("./dev");
  return fromData();
}

/** Убрать привнесённую руку. */
export async function removeCustomHand(key: string): Promise<void> {
  if (isTauri()) {
    const { removeCustomHand: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { removeCustomHand: fromData } = await import("./dev");
  return fromData();
}

/** Ручной запуск своей руки: только в клетке, только с отчётом. */
export async function runCustomHand(key: string): Promise<TrialReport> {
  if (isTauri()) {
    const { runCustomHand: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { runCustomHand: fromData } = await import("./dev");
  return fromData();
}

/** Последний запуск своей руки. `null` — не запускали. */
export async function customRunReport(key: string): Promise<TrialReport | null> {
  if (isTauri()) {
    const { customRunReport: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { customRunReport: fromData } = await import("./dev");
  return fromData();
}

/** Проба черновика в клетке. Отчёт, а не умение. */
export async function trialHand(key: string): Promise<TrialReport> {
  if (isTauri()) {
    const { trialHand: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { trialHand: fromData } = await import("./dev");
  return fromData();
}

/** Последний отчёт о пробе. `null` — не пробовали. */
export async function trialReport(key: string): Promise<TrialReport | null> {
  if (isTauri()) {
    const { trialReport: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { trialReport: fromData } = await import("./dev");
  return fromData();
}

/** Черновики рук, свежие сверху. */
export async function handDrafts(): Promise<HandDraft[]> {
  if (isTauri()) {
    const { handDrafts: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { handDrafts: fromData } = await import("./dev");
  return fromData();
}

/** Забыть черновик. */
export async function forgetHand(key: string): Promise<void> {
  if (isTauri()) {
    const { forgetHand: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { forgetHand: fromData } = await import("./dev");
  return fromData();
}

/** Спросить модель, что делать. Ничего не выполняет: предложение — не действие. */
export async function think(
  query: string,
  around: { title: string; process: string; screen?: string | null } | null = null,
): Promise<Thought> {
  if (isTauri()) {
    const { think: fromCore } = await import("./tauri");
    return fromCore(query, around);
  }
  const { think: fromData } = await import("./dev");
  return fromData();
}

/** Что мы спросим у модели по этой фразе: задача, окно, память и найденные руки. */
export async function modelPrompt(
  query: string,
  around: { title: string; process: string; screen?: string | null } | null = null,
): Promise<string> {
  if (isTauri()) {
    const { modelPrompt: fromCore } = await import("./tauri");
    return fromCore(query, around);
  }
  const { modelPrompt: fromData } = await import("./dev");
  return fromData();
}

/** Что приложение уже знает. Пустая память — пустой список, а не ошибка. */
export async function facts(): Promise<Fact[]> {
  if (isTauri()) {
    const { facts: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { facts: fromData } = await import("./dev");
  return fromData();
}

/** Запомнить сказанное, чтобы не спрашивать второй раз. */
export async function rememberFact(key: string, value: string): Promise<void> {
  if (isTauri()) {
    const { rememberFact: fromCore } = await import("./tauri");
    return fromCore(key, value);
  }
  const { rememberFact: fromData } = await import("./dev");
  return fromData(key, value);
}

/** Забыть факт: человек имеет право на «я этого больше не говорил». */
export async function forgetFact(key: string): Promise<void> {
  if (isTauri()) {
    const { forgetFact: fromCore } = await import("./tauri");
    return fromCore(key);
  }
  const { forgetFact: fromData } = await import("./dev");
  return fromData(key);
}

/** Что сейчас перед человеком. В браузере этого нет и быть не может. */
export async function foregroundWindow(): Promise<ForegroundWindow> {
  if (isTauri()) {
    const { foregroundWindow: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { foregroundWindow: fromData } = await import("./dev");
  return fromData();
}

/** Сколько сейчас можно: загрузка, память и присутствие человека. Ничего не запускает. */
export async function machineState(): Promise<MachineState> {
  if (isTauri()) {
    const { machineState: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { machineState: fromData } = await import("./dev");
  return fromData();
}

/** Что видно в активном окне — по элементам. В браузере этого нет и быть не может. */
export async function uiDump(max?: number): Promise<UiDump> {
  if (isTauri()) {
    const { uiDump: fromCore } = await import("./tauri");
    return fromCore(max);
  }
  const { uiDump: fromData } = await import("./dev");
  return fromData();
}

/** Потолки запуска на этой машине: что есть и чего нет. */
export async function isolationStatus(): Promise<IsolationStatus> {
  if (isTauri()) {
    const { isolationStatus: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { isolationStatus: fromData } = await import("./dev");
  return fromData();
}

/** Есть ли чем распознавать локально: движок и модель. Ничего не запускает. */
export async function speechStatus(): Promise<SpeechStatus> {
  if (isTauri()) {
    const { speechStatus: fromCore } = await import("./tauri");
    return fromCore();
  }
  const { speechStatus: fromData } = await import("./dev");
  return fromData();
}

/**
 * Распознать запись своим движком. В браузере этого нет и быть не может: движок —
 * это файл рядом с приложением, а не то, что умеет вкладка.
 */
export async function transcribeLocal(audio: number[]): Promise<string> {
  if (isTauri()) {
    const { transcribeLocal: fromCore } = await import("./tauri");
    return fromCore(audio);
  }
  const { transcribeLocal: fromData } = await import("./dev");
  return fromData(audio);
}
