/**
 * Шаг 313: схема данных с миграциями и проверкой версии при старте.
 *
 * Данные, записанные версией 2.0, читает версия 2.1. А наоборот — нет, и это
 * ловят слишком поздно: человек откатился на 2.0 (шаг 314), программа открылась
 * и **молча переписала** файл, потеряв новые поля. Через неделю выясняется, что
 * память повреждена, и уже не восстановить.
 *
 * Правила:
 *
 *  1. **в файле данных есть номер схемы**, а не «догадаемся по полям»: файлы
 *     читаются людьми, и человек мог отредактировать их руками;
 *  2. **старее — мигрируем**, шагами, и каждый шаг идемпотентен: упавшую
 *     миграцию можно повторить;
 *  3. **новее — не трогаем.** Схема новее программы значит «программа старая»,
 *     и правильный ответ — сказать это, а не переписать файл;
 *  4. **до миграции — копия.** Копия называется так, чтобы её нашли: не
 *     `data.bak2`, а `data-схема-3.bak`.
 */

/** Что нашлось при старте. */
export interface Found {
  /** Номер схемы в файле. */
  readonly schema: number;
  /** Номер схемы, который понимает программа. */
  readonly supported: number;
}

/** Что делать при старте. */
export type Step = "read" | "migrate" | "tooNew" | "broken";

/**
 * Решение на старте.
 *
 * `broken` отдельно от `tooNew`: «номер не число» — это испорченный файл или
 * правка руками, а не старая программа.
 */
export function atStart(found: Found): { step: Step; said: string } {
  if (!Number.isFinite(found.schema) || found.schema <= 0) {
    return {
      step: "broken",
      said: "в файле данных нет номера схемы — читаем осторожно, ничего не переписывая, и предлагаем копию",
    };
  }
  if (found.schema === found.supported) return { step: "read", said: `схема ${found.schema}: читаем как есть` };
  if (found.schema < found.supported) {
    return { step: "migrate", said: `схема ${found.schema} → ${found.supported}: сначала копия, потом миграция шагами` };
  }
  return {
    step: "tooNew",
    said: `файл новее программы (схема ${found.schema} против ${found.supported}): не трогаем, говорим человеку обновиться`,
  };
}

/**
 * Миграция по шагам: 1→2→3, а не 1→3.
 *
 * Прыжок через версию — самый частый способ потерять поле: миграция «1→3» писалась,
 * когда 2 ещё не было, и о её полях никто не помнил.
 */
export function migrations(from: number, to: number): number[] {
  const steps: number[] = [];
  for (let version = from; version < to; version += 1) steps.push(version);
  return steps;
}

/**
 * Копия перед миграцией.
 *
 * Имя говорит, из какой схемы: иначе через месяц непонятно, что в файле.
 */
export function backupName(file: string, schema: number): string {
  const dot = file.lastIndexOf(".");
  const base = dot === -1 ? file : file.slice(0, dot);
  const ext = dot === -1 ? "" : file.slice(dot);
  return `${base}-схема-${schema}.bak${ext}`;
}

/**
 * Что сказать человеку, если файл новее программы.
 *
 * Не «ошибка чтения данных»: человеку нужно понимать, что обновляться надо, а не
 * удалять файл.
 */
export function tooNewText(found: Found): string {
  return `Данные записаны версией новее этой (схема ${found.schema}, программа понимает ${found.supported}). Обновите программу — данные не тронуты`;
}

/**
 * Проверка самого правила миграций.
 *
 * Ловит две вещи: шаг, который прыгает через версию, и миграцию «назад»
 * (которой быть не может: назад — это откат, отдельная операция).
 */
export function auditSteps(steps: readonly number[]): string[] {
  const problems: string[] = [];
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1]!;
    const next = steps[i]!;
    if (next !== prev + 1) problems.push(`шаг ${prev}→${next} прыгает через версию: поле из промежуточной потеряется`);
  }
  if (steps.length > 0 && steps[0]! < 0) problems.push("миграция «назад» — это откат, а не миграция");
  return problems;
}
