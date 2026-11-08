/**
 * Единственная точка доступа UI к ядру.
 *
 * В приложении работает адаптер Tauri, в браузере (разработка и предпросмотр) —
 * dev-адаптер, читающий те же данные из репозитория. Компоненты не знают, какой
 * из них подключён, поэтому верстку можно делать без Rust-тулчейна.
 */

export type { Action, RegistrySnapshot, RegistryStats, Risk, Tier } from "./types";
export { RISK_ORDER, STATUS_ORDER, TIER_ORDER } from "./types";

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
