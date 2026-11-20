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

/** Чего не хватает для локального распознавания (необязательной части). */
export type SpeechMissingKind = "speech-engine" | "speech-model";

/** Оценка готовности: готово ли и что именно не хватает. */
export interface ReadinessAssessment {
  ready: boolean;
  missing: MissingKind[];
  /** Есть ли локальное распознавание (необязательно, но звук не покидает компьютер). */
  speechLocal: boolean;
  /** Чего не хватает для локального распознавания; пусто — всё на месте. */
  speechMissing: SpeechMissingKind[];
  /** Движок уже запущен. */
  engineRunning: boolean;
}

/** Оценивает готовность по фактам ядра. Неизвестный вид в `missing` не выдумываем. */
export function assessReadiness(status: ReadinessStatus): ReadinessAssessment {
  const missing: MissingKind[] = [];
  if (!status.engine_found) missing.push("engine");
  if (!status.model_present) missing.push("model");

  const speechMissing: SpeechMissingKind[] = [];
  if (!status.speech_found) speechMissing.push("speech-engine");
  if (status.speech_model === null) speechMissing.push("speech-model");

  return {
    ready: missing.length === 0,
    missing,
    speechLocal: speechMissing.length === 0,
    speechMissing,
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

/** Шаг одной подготовки. `smoke` — запуск движка после сверки, не во время скачивания. */
export type PrepareStep = "runtime" | "model" | "speech-runtime" | "speech-model" | "smoke";

/** Почему одним заходом разговор не собрать. Чужой каталог при этом не удаляется. */
export type PrepareBlock = "runtime-unsupported" | "runtime-owned" | "no-room";

export interface PreparePlan {
  steps: PrepareStep[];
  bytes: number;
  block: PrepareBlock | null;
  /** Локальная речь в этот заход не входит. Разговор от этого не отменяется. */
  speechSkipped: "unsupported" | "owned" | "no-room" | null;
}

/**
 * Что скачать одним согласием.
 *
 * Обязательны только движок разговора и модель. Речь добавляется, если человек
 * не снял отметку и для неё хватает места. Нехватка места на речь не отменяет
 * разговор. Нехватка места на модель или чужой каталог движка — отменяют весь
 * заход: по частям это уже отдельные кнопки, а не «всё само».
 */
export function planPrepare(status: ReadinessStatus, includeSpeech: boolean): PreparePlan {
  const steps: PrepareStep[] = [];
  let bytes = 0;
  let block: PrepareBlock | null = null;
  let speechSkipped: PreparePlan["speechSkipped"] = null;
  const fits = (extra: number) => hasRoom(status.free_bytes, bytes + extra);

  if (!status.engine_found) {
    if (!status.runtime_supported) block = "runtime-unsupported";
    else if (status.runtime_managed) block = "runtime-owned";
    else if (!fits(status.runtime_spec.bytes)) block = "no-room";
    else {
      steps.push("runtime");
      bytes += status.runtime_spec.bytes;
    }
  }

  if (!block && !status.model_present) {
    if (!fits(status.model_spec.bytes)) block = "no-room";
    else {
      steps.push("model");
      bytes += status.model_spec.bytes;
    }
  }

  if (block) return { steps: [], bytes: 0, block, speechSkipped: null };

  if (includeSpeech) {
    let speechEngine = status.speech_found;
    if (!status.speech_found) {
      if (!status.runtime_supported) speechSkipped = "unsupported";
      else if (status.speech_runtime_managed) speechSkipped = "owned";
      else if (!fits(status.speech_runtime_spec.bytes)) speechSkipped = "no-room";
      else {
        steps.push("speech-runtime");
        bytes += status.speech_runtime_spec.bytes;
        speechEngine = true;
      }
    }
    if (status.speech_model === null) {
      if (!speechEngine) speechSkipped = speechSkipped ?? "unsupported";
      else if (!fits(status.speech_model_spec.bytes)) {
        speechSkipped = "no-room";
        const runtime = steps.indexOf("speech-runtime");
        if (runtime >= 0) {
          steps.splice(runtime, 1);
          bytes -= status.speech_runtime_spec.bytes;
        }
      } else {
        steps.push("speech-model");
        bytes += status.speech_model_spec.bytes;
      }
    }
  }

  const canTalk = status.engine_found || steps.includes("runtime");
  const hasModel = status.model_present || steps.includes("model");
  if (canTalk && hasModel && !status.engine_running && steps.length > 0) steps.push("smoke");
  return { steps, bytes, block: null, speechSkipped };
}
