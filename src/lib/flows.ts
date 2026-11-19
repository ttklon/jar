/**
 * Исполнение сценария: шаги по одному, с остановкой на первом провале.
 *
 * Здесь нет политики и нет запуска процессов — это делает ядро для каждого шага
 * отдельно (`runTool`). Задача этого модуля одна: не дать сценарию «продолжить
 * после ошибки» и не дать опасному шагу пройти без ответа человека.
 *
 * Правила, зашитые в код (и проверенные тестами):
 *   * шаг, требующий подтверждения, спрашивает человека **перед** запуском;
 *   * отказ человека останавливает сценарий, следующие шаги не выполняются;
 *   * провал шага (нет доказательства) останавливает сценарий;
 *   * отмена проверяется перед каждым шагом — начатый шаг не бросается на полпути:
 *     его отменяет сам инструмент через `cancel_tool`.
 */

import type { FlowStepView, FlowView, StepResult } from "../ipc/types";

export type StepStatus = "pending" | "running" | "ok" | "failed" | "skipped" | "declined";

export interface StepRecord {
  index: number;
  step: FlowStepView;
  status: StepStatus;
  /** Параметры после подстановки входов — то, что реально уйдёт в ядро. */
  params?: Record<string, string>;
  result?: StepResult;
  /** Почему шаг не выполнялся — человеческим языком. */
  reason?: string;
}

export type StopReason = "done" | "failed" | "declined" | "cancelled";

export interface FlowRun {
  ok: boolean;
  stopped: StopReason;
  records: StepRecord[];
}

export interface FlowDeps {
  /** Показать диалог и дождаться ответа человека. */
  confirm: (step: FlowStepView, params: Record<string, string>) => Promise<boolean>;
  /** Выполнить шаг (в приложении — `runTool` с токеном, если он нужен). */
  run: (step: FlowStepView, params: Record<string, string>) => Promise<StepResult>;
  /** Прогресс: вызывается после каждого изменения состояния. */
  onProgress?: (records: StepRecord[]) => void;
  /** Внешняя отмена: проверяется перед каждым шагом. */
  shouldStop?: () => boolean;
}

/** Порядок рисков — для честной подписи «самый опасный шаг». */
const RISK_ORDER = ["read", "write-local", "external", "destructive", "identity", "money"] as const;

/**
 * Подставляет значения входов в параметры шага. `$имя` → значение.
 * Пустой вход — ошибка: шаг с пустым путём не должен уйти в ядро.
 */
export function resolveParams(
  step: FlowStepView,
  values: Record<string, string>,
): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [name, raw] of Object.entries(step.params)) {
    if (raw.startsWith("$")) {
      const input = raw.slice(1);
      const value = (values[input] ?? "").trim();
      if (!value) {
        throw new Error(`не заполнен вход «${input}»`);
      }
      resolved[name] = value;
    } else {
      resolved[name] = raw;
    }
  }

  return resolved;
}

/** Риск сценария = риск самого опасного шага. Используется для подписи и тестов. */
export function worstRisk(flow: FlowView): FlowView["risk"] {
  return flow.steps.reduce<FlowView["risk"]>((worst, step) => {
    const rank = RISK_ORDER.indexOf(step.risk);
    return rank > RISK_ORDER.indexOf(worst) ? step.risk : worst;
  }, "read");
}

/** Пустые входы — то, что человек ещё должен заполнить. */
export function missingInputs(flow: FlowView, values: Record<string, string>): string[] {
  return flow.inputs
    .filter((input) => input.required && !(values[input.name] ?? "").trim())
    .map((input) => input.label);
}

export async function runFlow(
  flow: FlowView,
  values: Record<string, string>,
  deps: FlowDeps,
): Promise<FlowRun> {
  const records: StepRecord[] = flow.steps.map((step, index) => ({
    index,
    step,
    status: "pending",
  }));

  const publish = () => deps.onProgress?.(records.map((record) => ({ ...record })));

  const stop = (from: number, reason: string, status: StepStatus) => {
    for (const record of records.slice(from)) {
      record.status = status;
      record.reason = reason;
    }
  };

  publish();

  for (const record of records) {
    if (deps.shouldStop?.()) {
      stop(record.index, "сценарий отменён", "skipped");
      publish();
      return { ok: false, stopped: "cancelled", records };
    }

    record.status = "running";
    publish();

    let params: Record<string, string>;
    try {
      params = resolveParams(record.step, values);
    } catch (reason) {
      record.status = "failed";
      record.reason = reason instanceof Error ? reason.message : String(reason);
      stop(record.index + 1, "шаг до этого не выполнен", "skipped");
      publish();
      return { ok: false, stopped: "failed", records };
    }

    record.params = params;

    if (record.step.needs_token) {
      const agreed = await deps.confirm(record.step, params);
      if (!agreed) {
        record.status = "declined";
        record.reason = "человек не подтвердил шаг";
        stop(record.index + 1, "сценарий остановлен на подтверждении", "skipped");
        publish();
        return { ok: false, stopped: "declined", records };
      }
    }

    let result: StepResult;
    try {
      result = await deps.run(record.step, params);
    } catch (reason) {
      record.status = "failed";
      record.reason = reason instanceof Error ? reason.message : String(reason);
      stop(record.index + 1, "шаг до этого не выполнен", "skipped");
      publish();
      return { ok: false, stopped: "failed", records };
    }

    record.result = result;
    record.status = result.ok ? "ok" : "failed";
    publish();

    if (!result.ok) {
      record.reason = result.cancelled
        ? "отменено"
        : result.timed_out
          ? "истекло время"
          : result.reason || "результат не подтверждён";
      stop(record.index + 1, "шаг до этого не выполнен", "skipped");
      publish();
      return { ok: false, stopped: result.cancelled ? "cancelled" : "failed", records };
    }
  }

  return { ok: true, stopped: "done", records };
}
