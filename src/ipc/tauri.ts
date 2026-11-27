/**
 * Адаптер для приложения: тонкие обёртки над командами ядра.
 * Никакой логики здесь нет и быть не должно — только транспорт.
 */

import { invoke } from "@tauri-apps/api/core";
import { transcribeCancellable } from "../lib/transcription";
import type {
  AddressProbe,
  ResourceReport,
  Autostart,
  MachineState,
  Presence,
  UiPress,
  UiTyped,
  AuditEvent,
  ConfirmToken,
  CustomHand,
  Downloaded,
  EngineStatus,
  Episode,
  Fact,
  FlowView,
  ForegroundWindow,
  HandDraft,
  HashCheck,
  ScheduleRow,
  HotkeyView,
  IsolationStatus,
  Learning,
  ModelsView,
  Plan,
  PlanAnswer,
  PlanCheck,
  PlanItem,
  PlanReport,
  ProfileView,
  NetworkAddress,
  ReadinessStatus,
  RemovedAll,
  RegistrySnapshot,
  RoleView,
  RunRecord,
  SmokeResult,
  WakeReport,
  SpeechStatus,
  StepResult,
  Thought,
  ToolView,
  TrialReport,
  UiDump,
  DataPlace,
  DataTotals,
  SelfCheckVerdict,
  UndoPreview,
  UndoReport,
  VoiceTrayStatus,
} from "./types";

export interface AppStatus {
  version: string;
  actions: number;
  domains: number;
  data_loaded: boolean;
  log_file: string;
  audit_file: string;
  tools: number;
  flows: number;
  profiles: number;
  /** Проблема с базой памяти на старте. Пусто или `null` — всё хорошо. */
  memory_note: string | null;
}

export function registrySnapshot(): Promise<RegistrySnapshot> {
  return invoke<RegistrySnapshot>("registry_snapshot");
}

export function appStatus(): Promise<AppStatus> {
  return invoke<AppStatus>("app_status");
}

export function setVoiceTrayStatus(status: VoiceTrayStatus): Promise<void> {
  return invoke<void>("set_voice_tray_status", { status });
}

export function planFor(query: string, limit = 8): Promise<PlanItem[]> {
  return invoke<PlanItem[]>("plan_for", { query, limit });
}

export function listModels(): Promise<ModelsView> {
  return invoke<ModelsView>("list_models");
}

export function removeModel(name: string): Promise<void> {
  return invoke<void>("remove_model", { name });
}

export function verifyModel(name: string): Promise<HashCheck> {
  return invoke<HashCheck>("verify_model", { name });
}

export function downloadModel(
  url: string,
  name: string,
  sha256?: string,
): Promise<Downloaded> {
  return invoke<Downloaded>("download_model", { url, name, sha256: sha256 ?? null });
}

/** Отменить текущее скачивание. Скачивания нет — не ошибка. */
export function cancelDownload(): Promise<void> {
  return invoke<void>("cancel_download");
}

/** Сколько байт уже скачано в `<имя>.part`. `null` — скачивания нет. */
export function downloadProgress(name: string): Promise<number | null> {
  return invoke<number | null>("download_progress", { name });
}

/** Готовность к первому разговору. Только чтение: ничего не скачивает и не запускает. */
/** Удалить всё скачанное — одной командой. */
export function removeEverything(): Promise<RemovedAll> {
  return invoke<RemovedAll>("remove_everything");
}

/** Все сетевые адреса — из ядра, списком. */
export function networkAddresses(): Promise<NetworkAddress[]> {
  return invoke<NetworkAddress[]>("network_addresses");
}

/** Живая проверка адресов: заголовки вместо файла, несколько байт трафика. */
export function probeNetwork(): Promise<AddressProbe[]> {
  return invoke<AddressProbe[]>("probe_network");
}

export function readinessStatus(): Promise<ReadinessStatus> {
  return invoke<ReadinessStatus>("readiness_status");
}





/**
 * Запустить движок (если ещё не запущен) и проверить разговор одним безопасным вопросом.
 * Ничего не скачивает. Вызов — явная кнопка или фраза, которой нужна уже установленная модель.
 */
export function smokeCheck(): Promise<SmokeResult> {
  return invoke<SmokeResult>("smoke_check");
}

/**
 * Машина проснулась: проверить движок и, если он умер, поднять.
 *
 * Не скачивает и не запускает движок, которого не было: человек мог выключить
 * его намеренно.
 */
export function afterWake(): Promise<WakeReport> {
  return invoke<WakeReport>("after_wake");
}

export function engineStatus(): Promise<EngineStatus> {
  return invoke<EngineStatus>("engine_status");
}

export function startEngine(name: string): Promise<EngineStatus> {
  return invoke<EngineStatus>("start_engine", { name });
}

export function stopEngine(): Promise<EngineStatus> {
  return invoke<EngineStatus>("stop_engine");
}

export function listRoles(): Promise<RoleView[]> {
  return invoke<RoleView[]>("list_roles");
}

export function assignRole(role: string, name: string): Promise<RoleView[]> {
  return invoke<RoleView[]>("assign_role", { role, name });
}

export function clearRole(role: string): Promise<RoleView[]> {
  return invoke<RoleView[]>("clear_role", { role });
}

export function requestLearning(query: string): Promise<Learning | null> {
  return invoke<Learning | null>("request_learning", { query });
}

export function learningRequests(): Promise<Learning[]> {
  return invoke<Learning[]>("learning_requests");
}

/** Попросить модель написать черновик руки. Черновик не исполняется никогда. */
export function draftHand(key: string): Promise<HandDraft> {
  return invoke<HandDraft>("draft_hand", { key });
}

/** Принять проверенный черновик в привнесённые руки. Явное действие человека. */
export function adoptHand(key: string, title = ""): Promise<CustomHand> {
  return invoke<CustomHand>("adopt_hand", { key, title });
}

/** Привнесённые руки. */
export function customHands(): Promise<CustomHand[]> {
  return invoke<CustomHand[]>("custom_hands");
}

/** Убрать привнесённую руку. */
export function removeCustomHand(key: string): Promise<void> {
  return invoke<void>("remove_custom_hand", { key });
}

/** Ручной запуск своей руки: только в клетке, только с отчётом. */
export function runCustomHand(key: string): Promise<TrialReport> {
  return invoke<TrialReport>("run_custom_hand", { key });
}

/** Последний запуск своей руки. `null` — не запускали. */
export function customRunReport(key: string): Promise<TrialReport | null> {
  return invoke<TrialReport | null>("custom_run_report", { key });
}

/** Проба черновика в клетке. Отчёт, а не умение. */
export function trialHand(key: string): Promise<TrialReport> {
  return invoke<TrialReport>("trial_hand", { key });
}

/** Последний отчёт о пробе. `null` — не пробовали. */
export function trialReport(key: string): Promise<TrialReport | null> {
  return invoke<TrialReport | null>("trial_report", { key });
}

/** Черновики рук, свежие сверху. */
export function handDrafts(): Promise<HandDraft[]> {
  return invoke<HandDraft[]>("hand_drafts");
}

/** Забыть черновик. */
export function forgetHand(key: string): Promise<void> {
  return invoke<void>("forget_hand", { key });
}

/** Спросить модель, что делать. Ничего не выполняет. */
export function think(
  query: string,
  around: { title: string; process: string; screen?: string | null } | null,
): Promise<Thought> {
  return invoke<Thought>("think", { query, around });
}

/**
 * Сказать ответ по кускам, пока он ещё пишется.
 *
 * Отдельно от `think` нарочно: понять намерение можно только по всему JSON, а
 * сказать первую фразу — сразу. Возвращается тот же текст, что ушёл кусками.
 */
export function thinkStream(query: string): Promise<string> {
  return invoke<string>("think_stream", { query });
}

/** Подписка на куски ответа. Отдельно от `thinkStream`, чтобы её можно было отменить. */
export async function onThinkPiece(
  handler: (piece: string) => void,
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<string>("think://piece", (event) => handler(event.payload));
  return unlisten;
}

/**
 * Сказать человеку словами: без JSON, без плана, без действий.
 *
 * Отдельно от `think` нарочно: `think` просит намерение, а его произносить вслух
 * нельзя. Здесь модель отвечает обычным текстом.
 */
export function say(question: string): Promise<string> {
  return invoke<string>("say", { question });
}

/** Что мы спросим у модели. Вопрос собирает ядро: в браузере его не собрать. */
export function modelPrompt(
  query: string,
  around: { title: string; process: string; screen?: string | null } | null,
): Promise<string> {
  return invoke<string>("model_prompt", { query, around });
}

/** Что приложение уже знает. Пустая память — пустой список, а не ошибка. */
export function facts(): Promise<Fact[]> {
  return invoke<Fact[]>("facts");
}

/** Запомнить сказанное, чтобы не спрашивать второй раз. */
export function rememberFact(key: string, value: string): Promise<void> {
  return invoke<void>("remember_fact", { key, value });
}

/** Забыть факт: человек имеет право на «я этого больше не говорил». */
export function forgetFact(key: string): Promise<void> {
  return invoke<void>("forget_fact", { key });
}

/** Что сейчас перед человеком: заголовок и программа. Только чтение. */
export function foregroundWindow(): Promise<ForegroundWindow> {
  return invoke<ForegroundWindow>("foreground_window");
}

/**
 * Нажать элемент активного окна по имени. Без `confirmed` не нажимает ничего:
 * подтверждение приходит из интерфейса, где человек видит, что именно нажмётся.
 */
export function uiPress(name: string, confirmed: boolean): Promise<UiPress> {
  return invoke<UiPress>("ui_press", { name, confirmed });
}

/** Ввести текст в поле активного окна. Без `confirmed` не вводит ничего. */
export function uiType(name: string, text: string, confirmed: boolean): Promise<UiTyped> {
  return invoke<UiTyped>("ui_type", { name, text, confirmed });
}

/** Сколько сейчас можно и почему именно столько. Ничего не запускает. */
export function machineState(): Promise<MachineState> {
  return invoke<MachineState>("machine_state");
}

/**
 * Сказать, уходит человек или работает. Это слово, а не приказ что-то запустить:
 * оно меняет только ответ машины про то, сколько можно.
 */
export function declarePresence(said: Presence | null): Promise<MachineState> {
  return invoke<MachineState>("declare_presence", { said });
}

/** Что видно в активном окне: элементы, а не пиксели. Только чтение. */
export function uiDump(max?: number): Promise<UiDump> {
  return invoke<UiDump>("ui_dump", { max: max ?? null });
}

/** Потолки запуска: что есть на самом деле. Ничего не запускает. */
export function isolationStatus(): Promise<IsolationStatus> {
  return invoke<IsolationStatus>("isolation_status");
}

export function speechStatus(): Promise<SpeechStatus> {
  return invoke<SpeechStatus>("speech_status");
}

/** Распознать запись своим движком: звук не покидает компьютер. */
export function transcribeLocal(audio: number[], signal?: AbortSignal): Promise<string> {
  return transcribeCancellable(invoke, audio, signal);
}

export function searchEpisodes(query: string, limit = 20): Promise<Episode[]> {
  return invoke<Episode[]>("search_episodes", { query, limit });
}

export function checkPlan(json: string): Promise<PlanCheck> {
  return invoke<PlanCheck>("check_plan", { json });
}

/**
 * Где остановился прерванный запуск этой цели (шаг 141). `null` — запуск
 * закончился сам или его не было: продолжать нечего.
 */
export function planCheckpoint(goal: string, total: number): Promise<number | null> {
  return invoke<number | null>("plan_checkpoint", { goal, total });
}

export function runPlan(
  json: string,
  approved: number[],
  fromStep?: number | null,
): Promise<PlanReport> {
  return invoke<PlanReport>("run_plan", { json, approved, fromStep: fromStep ?? null });
}

export function savePlan(json: string): Promise<PlanCheck> {
  return invoke<PlanCheck>("save_plan", { json });
}

export function draftPlan(query: string): Promise<PlanCheck | null> {
  return invoke<PlanCheck | null>("draft_plan", { query });
}

export function fillPlan(json: string, answers: PlanAnswer[]): Promise<PlanCheck> {
  return invoke<PlanCheck>("fill_plan", { json, answers });
}

export function lastPlan(): Promise<Plan | null> {
  return invoke<Plan | null>("last_plan");
}

export function listTools(): Promise<ToolView[]> {
  return invoke<ToolView[]>("list_tools");
}

export function listFlows(): Promise<FlowView[]> {
  return invoke<FlowView[]>("list_flows");
}

export function confirmTool(
  registry: string,
  params: Record<string, string>,
): Promise<ConfirmToken> {
  return invoke<ConfirmToken>("confirm_tool", { registry, params });
}

export function runTool(
  registry: string,
  params: Record<string, string>,
  token?: number,
): Promise<StepResult> {
  return invoke<StepResult>("run_tool", { registry, params, token: token ?? null });
}

export function cancelTool(): Promise<void> {
  return invoke<void>("cancel_tool");
}

export function selfCheck(): Promise<SelfCheckVerdict[]> {
  return invoke<SelfCheckVerdict[]>("self_check");
}

/** Починить одну вещь, названную проверкой: по частям, а не переустановкой. */
export function repair(what: string): Promise<string> {
  return invoke<string>("repair", { repair: what });
}

export function resourceReport(): Promise<ResourceReport> {
  return invoke<ResourceReport>("resource_report");
}

export function dataPlaces(): Promise<DataPlace[]> {
  return invoke<DataPlace[]>("data_places");
}

export function dataTotals(): Promise<DataTotals> {
  return invoke<DataTotals>("data_totals");
}

export function undoReport(): Promise<UndoPreview> {
  return invoke<UndoPreview>("undo_report");
}

export function undoApply(): Promise<UndoReport> {
  return invoke<UndoReport>("undo_apply");
}

/** Список расписаний из ядра. */
export function schedules(): Promise<ScheduleRow[]> {
  return invoke<ScheduleRow[]>("schedules");
}

export function scheduleAdd(what: string, cadence: string, minute: number): Promise<ScheduleRow[]> {
  return invoke<ScheduleRow[]>("schedule_add", { what, cadence, minute });
}

export function schedulePause(id: string, paused: boolean): Promise<ScheduleRow[]> {
  return invoke<ScheduleRow[]>("schedule_pause", { id, paused });
}

export function scheduleRemove(id: string): Promise<ScheduleRow[]> {
  return invoke<ScheduleRow[]>("schedule_remove", { id });
}

/** Какая клавиша действует. Доступно и в браузере через dev-адаптер. */
export function hotkeyCurrent(): Promise<HotkeyView> {
  return invoke<HotkeyView>("hotkey_current");
}

/**
 * Назначить клавишу. Проверка занятости — в ядре, **до** сохранения: при отказе
 * прежняя клавиша остаётся, а причина приходит словами.
 */
export function hotkeyAssign(spec: string): Promise<HotkeyView> {
  return invoke<HotkeyView>("hotkey_assign", { spec });
}

export function autostartStatus(): Promise<Autostart> {
  return invoke<Autostart>("autostart_status");
}

export function autostartEnable(): Promise<Autostart> {
  return invoke<Autostart>("autostart_enable");
}

export function autostartDisable(): Promise<Autostart> {
  return invoke<Autostart>("autostart_disable");
}

export function auditTail(limit: number): Promise<AuditEvent[]> {
  return invoke<AuditEvent[]>("audit_tail", { limit });
}

export function listProfiles(): Promise<ProfileView[]> {
  return invoke<ProfileView[]>("list_profiles");
}

export function memoryRuns(limit: number): Promise<RunRecord[]> {
  return invoke<RunRecord[]>("memory_runs", { limit });
}

export function downloadRuntime(
  kind: import("./types").RuntimeKind,
): Promise<import("./types").Installed> {
  return invoke("download_runtime", { kind });
}
export function removeRuntime(kind: import("./types").RuntimeKind): Promise<void> {
  return invoke("remove_runtime", { kind });
}

/** Резервные копии памяти: что можно вернуть (шаг 147 плана). */
export type MemoryBackup = {
  file: string;
  bytes: number;
  usable: boolean;
  problem: string;
};

export type MemoryRestored = {
  file: string;
  previous: string | null;
  bytes: number;
};

export async function memoryBackups(): Promise<MemoryBackup[]> {
  return invoke<MemoryBackup[]>("memory_backups");
}

/**
 * Вернуть память из копии. `confirm` передаётся намеренно: команда заменяет
 * файл, и «нажали случайно» не должно становиться потерей данных.
 */
/** Починить память из лучшей копии — одной кнопкой, без выбора. */
export function repairMemory(): Promise<string> {
  return invoke<string>("repair_memory");
}

export async function memoryRestore(file: string, confirm: boolean): Promise<MemoryRestored> {
  return invoke<MemoryRestored>("memory_restore", { file, confirm });
}

/** Диагностический пакет для просмотра перед отправкой (шаг 148). */
export type DiagnosticsPack = {
  text: string;
  paths_scrubbed: number;
  secrets_scrubbed: number;
  notes: string[];
};

export async function diagnosticsPack(lines?: number): Promise<DiagnosticsPack> {
  return invoke<DiagnosticsPack>("diagnostics_pack", { lines: lines ?? null });
}
