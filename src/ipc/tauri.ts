/**
 * Адаптер для приложения: тонкие обёртки над командами ядра.
 * Никакой логики здесь нет и быть не должно — только транспорт.
 */

import { invoke } from "@tauri-apps/api/core";
import type { RegistrySnapshot } from "./types";

export interface AppStatus {
  version: string;
  actions: number;
  domains: number;
  data_loaded: boolean;
  log_file: string;
}

export function registrySnapshot(): Promise<RegistrySnapshot> {
  return invoke<RegistrySnapshot>("registry_snapshot");
}

export function appStatus(): Promise<AppStatus> {
  return invoke<AppStatus>("app_status");
}
