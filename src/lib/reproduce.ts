/**
 * Шаг 243: журнал и воспроизведение — любой отчёт можно повторить.
 *
 * Почему это отдельный шаг, а не «журнал уже есть». Журнал хранит **строки**:
 * «14:32, переименование, готово». По такой строке нельзя ответить ни на один
 * вопрос, который задают на самом деле: почему шаг 3 упал, что было
 * доказательством, не соврал ли итог. Отчёт, собранный в момент дела, никто не
 * сохраняет — и через день его не восстановить.
 *
 * Правило: **воспроизведение — это данные, а не повторный запуск**. «Повторить»
 * у нас уже значит «сделать ещё раз» (`repeatDeed.ts`), и оно касается мира:
 * файлы изменились, действие заденет другое. Воспроизведение касается **только
 * отчёта**: из сохранённого входа получается ровно тот же отчёт, побайтово
 * сравнимый. Мир при этом не трогается вовсе — иначе разбор вчерашнего провала
 * менял бы сегодняшние файлы.
 *
 * Три требования, и все три проверяемы:
 *
 *  1. **вход сохранён целиком.** Не «шаги», а ещё и фраза человека, время,
 *     сессия: без них отчёт не собрать заново;
 *  2. **восстановление — чистая функция.** Тот же вход даёт тот же отчёт
 *     (одинаковый `summary`, одинаковые шаги), и это сравнение побайтовое;
 *  3. **чего не хватило — сказано.** Старая запись без доказательств не
 *     превращается в «всё в порядке»: воспроизведение отвечает, чего в журнале
 *     не было, и не достраивает недостающее догадкой.
 */

import type { Report } from "./oneReport";
import type { Whole } from "./oneReport";

/**
 * Что сохраняется в журнал, чтобы отчёт можно было собрать заново.
 *
 * Это **вход**, а не результат: результат пересчитывается. Складывать в журнал
 * готовый отчёт значило бы хранить копию, которая со временем разойдётся с
 * правилами — и «воспроизведение» показывало бы вчерашний код, а не вчерашнее
 * дело.
 */
export interface Entry {
  /** Номер дела: тот же, что в карточке. */
  readonly deed: number;
  /** Фраза человека — то, ради чего всё делалось. */
  readonly subject: string;
  /** Когда началось, мс. */
  readonly startedMs: number;
  /** Шаги в том виде, в каком их отдало ядро. */
  readonly steps: readonly Report[];
  /** Версия правил: по ней видно, изменился ли расчёт с тех пор. */
  readonly rules: string;
}

/** Нынешняя версия правил сборки отчёта. Меняется осознанно, вместе с `oneReport`. */
export const RULES = "report-1";

/** Итог воспроизведения. */
export interface Replay {
  /** Собранный заново отчёт — та же форма, что в момент дела. */
  readonly steps: readonly Report[];
  /** Итог одной строкой, пересчитанный. */
  readonly summary: string;
  /** Чего в записи не хватило и что из-за этого нельзя утверждать. */
  readonly missing: readonly string[];
  /** Совпадает ли с тем, что показывали тогда. */
  readonly matches: boolean;
}

/**
 * Собрать отчёт из журнальной записи.
 *
 * `was` — то, что показывали в момент дела. Если его нет, сравнить не с чем, и
 * это говорится прямо, а не считается совпадением.
 */
export function replay(entry: Entry, was?: { steps: readonly Report[]; summary: string }): Replay {
  const missing: string[] = [];

  // Вход проверяется по частям, и каждая часть названа: «не хватило шагов» —
  // это одно, «не хватило доказательств» — совсем другое.
  if (entry.steps.length === 0) {
    missing.push("шагов в записи нет: отчёт нечего восстанавливать");
  }
  if (!entry.subject.trim()) {
    missing.push("фразы человека нет: непонятно, о чём было дело");
  }
  if (!Number.isFinite(entry.startedMs) || entry.startedMs <= 0) {
    missing.push("времени нет: запись нельзя поставить в журнал по времени");
  }
  if (entry.rules !== RULES) {
    missing.push(
      `правила записи «${entry.rules || "не названы"}», а сейчас «${RULES}»: ` +
        "расчёт мог измениться, и совпадение не гарантировано",
    );
  }
  // Доказательство не достраивается: если шаг сохранён без него, так и
  // остаётся. Придумать доказательство при разборе — худший вид лжи, потому
  // что разбор читают, чтобы понять, что было на самом деле.
  const unproven = entry.steps.filter((step) => step.proof === "");
  if (unproven.length > 0) {
    missing.push(
      `без доказательства ${unproven.length}: шаги ${unproven
        .map((step) => step.position)
        .join(", ")} — что там было, установить нельзя`,
    );
  }

  const steps = entry.steps.map((step) => ({ ...step, conflicts: [...step.conflicts] }));
  const summary = summarize(steps);
  const matches = was === undefined ? false : same(steps, was.steps) && summary === was.summary;

  return { steps, summary, missing, matches };
}

/** Итог по шагам — то же правило, что в `oneReport`, без второго источника правды. */
function summarize(steps: readonly Report[]): string {
  const done = steps.filter((step) => step.ok).length;
  const cancelled = steps.filter((step) => step.cancelled).length;
  const unproven = steps.filter((step) => step.proof === "").length;
  const parts = [`сделано ${done} из ${steps.length}`];
  if (cancelled > 0) parts.push(`отменено ${cancelled}`);
  if (unproven > 0) parts.push(`без доказательства ${unproven}`);
  const conflicts = steps.reduce((count, step) => count + step.conflicts.length, 0);
  if (conflicts > 0) parts.push(`противоречий ${conflicts}`);
  return parts.join(", ");
}

/**
 * Сравнение двух отчётов — по всем полям, а не по итогу.
 *
 * Итог «сделано 3 из 5» совпадёт и тогда, когда упали разные шаги. Сравнивать
 * надо каждое поле: иначе «воспроизвелось» значит «числа сошлись», а не «отчёт
 * тот же».
 */
function same(left: readonly Report[], right: readonly Report[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((step, index) => {
    const other = right[index]!;
    return (
      step.position === other.position &&
      step.tool === other.tool &&
      step.ok === other.ok &&
      step.reason === other.reason &&
      step.proof === other.proof &&
      step.cancelled === other.cancelled &&
      step.duration_ms === other.duration_ms &&
      step.conflicts.length === other.conflicts.length &&
      step.conflicts.every((conflict, position) => conflict === other.conflicts[position])
    );
  });
}

/** Записать отчёт в журнал: вход целиком, без «пересказа». */
export function record(deed: number, subject: string, startedMs: number, steps: readonly Report[]): Entry {
  // Копия **на два уровня**: массив и каждый шаг. Первая версия копировала
  // только массив — и объект шага оставался общим с экраном. Тогда разбор
  // вчерашнего дела показывал сегодняшнее состояние: шаг на экране поправили,
  // и «сохранённый» отчёт поправился вместе с ним. Это не теория: тест на
  // мутацию поймал ровно это.
  return {
    deed,
    subject,
    startedMs,
    steps: steps.map((step) => ({ ...step, conflicts: [...step.conflicts] })),
    rules: RULES,
  };
}

/** Можно ли разобрать вчерашнее дело, не трогая мир. */
export function harmless(entry: Entry): boolean {
  // Воспроизведение — чтение журнала. Если оно когда-нибудь начнёт «повторять»
  // шаги, этот ответ станет ложью, и тест это заметит.
  return entry.steps.every((step) => step.tool !== "system|run|replay");
}

/** Строка для человека: воспроизвелось или нет и почему. */
export function say(got: Replay): string {
  if (got.missing.length > 0) {
    return `воспроизведено с пробелами: ${got.missing.join("; ")}`;
  }
  if (got.matches) {
    return `воспроизведено: ${got.summary} — совпадает с тем, что показывали`;
  }
  return `воспроизведено: ${got.summary} — но с прежним отчётом не совпало`;
}

/** Итог по шагам в форме `Whole` — для экранов, которые её уже понимают. */
export function asWhole(steps: readonly Report[]): Whole {
  return {
    steps: [...steps],
    done: steps.filter((step) => step.ok).length,
    cancelled: steps.filter((step) => step.cancelled).length,
    unproven: steps.filter((step) => step.proof === "").length,
  };
}
