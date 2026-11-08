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
