/**
 * Готовность к первому разговору: что есть, чего не хватает и что делать дальше.
 *
 * Чистая логика без React и IPC: её проверяют тесты на пустой установке, настроенной
 * машине, частичных состояниях и в браузере. Ядро отдаёт факты (`ReadinessStatus`),
 * а решает, что это значит для человека, — этот модуль. Правило одно и то же, что в ядре:
 * готов — значит движок найден и есть модель с читаемым заголовком. Локальное распознавание для первого
 * разговора необязательно: голос может идти через системную службу с согласия человека.
 */

import type { ReadinessStatus } from "../ipc";

/** Чего не хватает для первого разговора. */
export type MissingKind = "engine" | "model";

/** Оценка готовности: готово ли и что именно не хватает. */
export interface ReadinessAssessment {
  ready: boolean;
  missing: MissingKind[];
  /** Есть ли локальное распознавание (необязательно, но звук не покидает компьютер). */
  speechLocal: boolean;
  /** Движок уже запущен. */
  engineRunning: boolean;
}

/** Оценивает готовность по фактам ядра. Неизвестный вид в `missing` не выдумываем. */
export function assessReadiness(status: ReadinessStatus): ReadinessAssessment {
  const missing: MissingKind[] = [];
  if (!status.engine_found) missing.push("engine");
  if (!status.model_present) missing.push("model");

  return {
    ready: missing.length === 0,
    missing,
    speechLocal: status.speech_found && status.speech_model !== null,
    engineRunning: status.engine_running,
  };
}

/** Размер человеческим языком: модели измеряются гигабайтами, а не байтами. */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

/** Хватит ли места для скачивания. Место неизвестно — не блокируем, а предупреждаем. */
export function hasRoom(freeBytes: number | null, neededBytes: number): boolean {
  if (freeBytes === null) return true;
  return freeBytes >= neededBytes;
}
