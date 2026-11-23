/**
 * Одинаковый результат руки на всех экранах — одна форма отчёта (шаг 106).
 *
 * Дефект. Об одном и том же ядро рассказывает **тремя формами**:
 *
 *  * `RunStep` (история): `tool`, `ok`, `reason`, `evidence` — строкой, и без
 *    позиции шага в плане;
 *  * `PlanStepRun` (план): `registry`, `status`, `reason`, `evidence` — статус
 *    словом, и `ok` из него получается только по `status === "ok"`;
 *  * `StepResult` (инструмент/сценарий): `ok`, `evidence` **структурой**,
 *    `stdout_tail`, `exit_code`, `timed_out`, `cancelled`.
 *
 * Отсюда **три правды об одном факте**: в истории шаг «выполнен», в плане
 * «failed», а на экране инструмента «ok, но с предупреждением». Человек видит
 * разные ответы и не знает, какому верить; сравнить два дела нельзя, потому что
 * формы разные.
 *
 * Правило: **одна форма, и остальные приводятся к ней**.
 *
 *  1. **Одна форма** — `Report`: что сделано, чем доказано, что не отменяется,
 *     плюс позиция и адрес руки.
 *  2. **Приведение, а не переписывание**: три входа сводятся к одной форме, но
 *     ничего не теряется — `cancelled` не становится `failed`, а `timed_out`
 *     называется причиной.
 *  3. **Доказательство — словами** на границе: структура (`Evidence`) живёт в
 *     ядре, а человеку везде говорят одно и то же.
 *  4. **Противоречие называется**: если `status` говорит «ok», а `ok` — «нет»,
 *     это не выбирается молча в пользу удобного.
 *
 * Почему не «переписать ядро под одну форму». Ядро говорит с несколькими руками и
 * не должно зависеть от того, как экран показывает; приведение — дешёвая
 * операция на границе, и она не ломает ни одну руку.
 */

import type { Evidence, PlanStepRun, RunStep, StepResult } from "../ipc/types";

/** Единый отчёт о шаге — то, что видно на любом экране. */
export interface Report {
  /** Номер шага в плане (с нуля), как он был. */
  position: number;
  /** Адрес руки: `домен|глагол|объект` или имя шага. */
  tool: string;
  /** Выполнено ли. */
  ok: boolean;
  /** Почему не вышло; пусто у успешного. */
  reason: string;
  /** Чем доказано — словами, пустая строка значит «не проверено». */
  proof: string;
  /** Отменено ли — отдельный факт, а не разновидность провала. */
  cancelled: boolean;
  /** Длительность, если её дали; `null` — не сказали. */
  duration_ms: number | null;
  /** Противоречия, которые нельзя выбрать молча. */
  conflicts: string[];
}

/**
 * Доказательство структурой — в слова.
 *
 * Слова **те же**, что на экране «Руки» (`lib/evidence.ts`): два разных перевода
 * одного факта — это ровно то, что шаг 106 убирает. Здесь перевод повторён
 * намеренно **только** для форм, которые приходят из ядра текстом; если структура
 * есть — берётся её перевод.
 */
export function proofOf(evidence: Evidence): string {
  switch (evidence.kind) {
    case "exit_code":
      return `код возврата ${evidence.code}`;
    case "path_exists":
      return evidence.exists ? `путь существует: ${evidence.path}` : `путь отсутствует: ${evidence.path}`;
    case "stdout_marker":
      return evidence.found ? `в выводе найден признак «${evidence.marker}»` : `признак «${evidence.marker}» не найден`;
    case "file_text":
      return evidence.matches ? `в файле ровно то, что записали: ${evidence.path}` : `в файле оказалось не то: ${evidence.path}`;
    case "file_read":
      return `прочитано ${evidence.bytes} байт: ${evidence.path}`;
    case "compared":
      return `совпало: ${evidence.same}, отличается: ${evidence.different}, только в первой: ${evidence.only_left}, только во второй: ${evidence.only_right}`;
    case "search":
      return `строк с совпадением: ${evidence.hits} в файлах: ${evidence.files}`;
    case "renamed":
      return `переименовано файлов: ${evidence.count} — ${evidence.folder}`;
    case "ui_changed":
      return evidence.changed ? `изменение подтверждено: ${evidence.what}` : `изменения не видно: ${evidence.what}`;
    case "failed":
      return evidence.reason;
  }
}

/** Строка доказательства из ядра: пустая — «не проверено», а не успех. */
function text(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  // Служебная метка «сделано в прошлый раз» — не доказательство.
  if (trimmed === "" || trimmed === "previous-run") return "";
  return trimmed;
}

/**
 * `RunStep` (история) → отчёт.
 *
 * Позиция берётся из порядка в массиве: в этой форме её нет, и это само по себе
 * дефект — без неё шаг нельзя сопоставить с планом.
 */
export function fromRunStep(step: RunStep, index: number): Report {
  return {
    position: index,
    tool: step.tool,
    ok: step.ok,
    reason: step.reason,
    proof: text(step.evidence),
    cancelled: false,
    duration_ms: null,
    conflicts: [],
  };
}

/**
 * `PlanStepRun` (план) → отчёт.
 *
 * `status` и `ok` здесь — разные поля, и они могут противоречить друг другу. Это
 * называется, а не выбирается молча.
 */
export function fromPlanStep(step: PlanStepRun): Report {
  const conflicts: string[] = [];
  const byStatus = step.status === "ok";
  // `position` в плане **с единицы**, и отчёт держит то же число: экран уже
  // показывает «шаг 1», и пересчёт здесь сломал бы соответствие.
  return {
    position: step.position,
    tool: step.registry,
    ok: byStatus,
    reason: step.status === "cancelled" ? "отменено" : step.reason,
    proof: text(step.evidence),
    cancelled: step.status === "cancelled",
    duration_ms: step.duration_ms,
    conflicts,
  };
}

/** `StepResult` (инструмент и сценарий) → отчёт. */
export function fromStepResult(step: StepResult, position = 0): Report {
  const conflicts: string[] = [];
  if (step.ok && step.evidence.kind === "failed") {
    // «Успех» с доказательством «провал» — не выбирается в пользу удобного.
    conflicts.push("шаг назван успешным, а доказательство говорит о провале");
  }
  if (step.timed_out) {
    // Таймаут — причина, а не разновидность «нет».
    conflicts.push("шаг прерван по времени");
  }
  return {
    position,
    tool: step.registry,
    ok: step.ok && step.evidence.kind !== "failed",
    reason: step.cancelled ? "отменено" : step.timed_out ? "не успел по времени" : step.reason,
    proof: step.evidence.kind === "failed" ? "" : proofOf(step.evidence),
    cancelled: step.cancelled,
    duration_ms: step.duration_ms,
    conflicts,
  };
}

/**
 * Три формы — один отчёт.
 *
 * Одна функция на входе, чтобы экран не решал, какая форма у него в руках: он
 * передаёт то, что получил, и получает одно и то же.
 */
export function one(step: RunStep | PlanStepRun | StepResult, index = 0): Report {
  if ("tool" in step) return fromRunStep(step, index);
  if ("registry" in step && "status" in step) return fromPlanStep(step);
  return fromStepResult(step as StepResult, index);
}

/** Отчёт целиком: шаги по порядку и итог словами. */
export interface Whole {
  steps: Report[];
  /** Сколько выполнено. */
  done: number;
  /** Сколько отменено — отдельно от провалов. */
  cancelled: number;
  /** Сколько не проверено: доказательства нет. */
  unproven: number;
}

export function whole(steps: readonly Report[]): Whole {
  return {
    steps: [...steps],
    done: steps.filter((step) => step.ok).length,
    cancelled: steps.filter((step) => step.cancelled).length,
    unproven: steps.filter((step) => step.proof === "").length,
  };
}

/**
 * Итог одной строкой — одинаковый на всех экранах.
 *
 * Не «готово» без числа: «сделано 3 из 5, отменено 1, без доказательства 1» —
 * это отчёт, а «успешно» — это обещание.
 */
export function summary(got: Whole): string {
  const parts = [`сделано ${got.done} из ${got.steps.length}`];
  if (got.cancelled > 0) parts.push(`отменено ${got.cancelled}`);
  if (got.unproven > 0) parts.push(`без доказательства ${got.unproven}`);
  const conflicts = got.steps.reduce((count, step) => count + step.conflicts.length, 0);
  if (conflicts > 0) parts.push(`противоречий ${conflicts}`);
  return parts.join(", ");
}

/** Есть ли в отчёте что-то, требующее внимания человека. */
export function attention(got: Whole): string[] {
  const out: string[] = [];
  for (const step of got.steps) {
    for (const conflict of step.conflicts) out.push(`шаг ${step.position}: ${conflict}`);
  }
  return out;
}
