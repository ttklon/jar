/**
 * Адаптер для приложения: тонкие обёртки над командами ядра.
 * Никакой логики здесь нет и быть не должно — только транспорт.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AuditEvent,
  ConfirmToken,
  Downloaded,
  EngineStatus,
  Episode,
  Learning,
  FlowView,
  HashCheck,
  ModelsView,
  Plan,
  PlanAnswer,
  PlanCheck,
  PlanReport,
  PlanItem,
  ProfileView,
  RoleView,
  IsolationStatus,
  SpeechStatus,
  RegistrySnapshot,
  RunRecord,
  StepResult,
  ToolView,
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
}

export function registrySnapshot(): Promise<RegistrySnapshot> {
  return invoke<RegistrySnapshot>("registry_snapshot");
}

export function appStatus(): Promise<AppStatus> {
  return invoke<AppStatus>("app_status");
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

/** Потолки запуска: что есть на самом деле. Ничего не запускает. */
export function isolationStatus(): Promise<IsolationStatus> {
  return invoke<IsolationStatus>("isolation_status");
}

export function speechStatus(): Promise<SpeechStatus> {
  return invoke<SpeechStatus>("speech_status");
}

/** Распознать запись своим движком: звук не покидает компьютер. */
export function transcribeLocal(audio: number[]): Promise<string> {
  return invoke<string>("transcribe_local", { audio });
}

export function searchEpisodes(query: string, limit = 20): Promise<Episode[]> {
  return invoke<Episode[]>("search_episodes", { query, limit });
}

export function checkPlan(json: string): Promise<PlanCheck> {
  return invoke<PlanCheck>("check_plan", { json });
}

export function runPlan(json: string, approved: number[]): Promise<PlanReport> {
  return invoke<PlanReport>("run_plan", { json, approved });
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

export function auditTail(limit: number): Promise<AuditEvent[]> {
  return invoke<AuditEvent[]>("audit_tail", { limit });
}

export function listProfiles(): Promise<ProfileView[]> {
  return invoke<ProfileView[]>("list_profiles");
}

export function memoryRuns(limit: number): Promise<RunRecord[]> {
  return invoke<RunRecord[]>("memory_runs", { limit });
}
