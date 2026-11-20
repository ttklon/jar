import type { ReadinessStatus } from "../ipc";

/**
 * Уже установленный движок разговора.
 *
 * Фраза может запустить его сама, только если оба файла уже на диске.
 * Скачивание сюда не входит: нет файлов — не угадываем и не ставим.
 * Статус не прочитался — тоже не угадываем.
 */
export type InstalledEngine = "running" | "start" | "missing" | "unknown";

/** Отказ ядра, который значит «некому разобрать», а не «не умею». */
export function isEngineDown(message: string): boolean {
  return message.includes("движок не запущен");
}

export function installedEngine(status: ReadinessStatus | null): InstalledEngine {
  if (!status) return "unknown";
  if (status.engine_running) return "running";
  if (status.engine_found && status.model_present) return "start";
  return "missing";
}
