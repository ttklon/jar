/**
 * «Пока вас не было» (шаг 81).
 *
 * Дефект: дело, сделанное без человека, заканчивалось молча. Он уходил пить
 * чай, возвращался — и не знал, было ли что-то вообще. Журнал это помнит, но
 * журнал надо **пойти и открыть**, а человек не знает, что там что-то есть.
 *
 * Правила, из которых складывается одно сообщение:
 *
 *  * **одно на возвращение, а не поток**: пять дел — одна строка со списком
 *    (правило `resultNotice.onReturn`, а не второй счётчик);
 *  * **считаем только то, что человек пропустил**: дела, закончившиеся за время
 *    его отсутствия, а не всё, что было за неделю;
 *  * **ошибка не прячется в списке**: «2 дела, 1 не получилось» — не «2 дела»;
 *  * **прочитанное не повторяется**: сказал один раз — отметка, а не напоминание
 *    при каждом переходе между экранами.
 */

import type { RunRecord } from "../ipc/types";
import { bundle, onReturn } from "./resultNotice";

/** Сколько ждём, прежде чем считать, что человек ушёл. */
export const GONE_MS = 5 * 60 * 1000;

/** Что случилось, пока человек не смотрел. */
export interface Missed {
  /** Сколько дел закончилось хорошо. */
  readonly done: number;
  /** Сколько не получилось. */
  readonly failed: number;
  /** Успешные — коротко и по имени, для списка. */
  readonly names: readonly string[];
  /** Когда человек видел последнюю сводку (мс). */
  readonly since: number;
}

/**
 * Найти пропущенное.
 *
 * `lastSeen` — когда человек последний раз был у экрана. Всё, что закончилось
 * позже, он не видел; всё, что раньше, — видел или мог видеть.
 */
export function missed(runs: readonly RunRecord[], lastSeen: number): Missed {
  const finished = runs.filter(
    (run) =>
      run.finished_ms !== null &&
      run.finished_ms > lastSeen &&
      run.outcome !== "running" &&
      run.outcome !== "cancelled",
  );
  const ok = finished.filter((run) => run.outcome === "ok");
  const bad = finished.filter((run) => run.outcome === "failed" || run.outcome === "denied");
  return {
    done: ok.length,
    failed: bad.length,
    names: ok.map((run) => run.subject),
    since: lastSeen,
  };
}

/**
 * Строка для человека.
 *
 * Пусто — говорить нечего, и тогда молчим. Не «ничего нового»: это тоже
 * сообщение, а сообщение ни о чём приучает не читать сообщения.
 */
export function line(got: Missed): string {
  if (got.done === 0 && got.failed === 0) return "";
  if (got.done === 0) {
    // Только провалы: называем их, а не «дела были».
    return got.failed === 1
      ? "пока вас не было: одно дело не получилось — подробности в журнале"
      : `пока вас не было: не получилось дел ${got.failed} — подробности в журнале`;
  }
  const body = bundle(got.names);
  if (got.failed === 0) return onReturn([body]);
  // Ошибки — отдельной фразой, а не спрятанные в конце списка: «2 дела» без
  // этого читается как «оба получились».
  return onReturn([`${body}; ${got.failed === 1 ? "одно" : `${got.failed}`} не получилось`]);
}

/**
 * Пора ли сказать.
 *
 * Два условия вместе: человек вернулся (был у экрана) **и** прошло достаточно
 * времени, чтобы «ушёл» было правдой. Четыре секунды на переключение экрана —
 * не отсутствие, и сообщение о них было бы шумом.
 */
export function when(goneMs: number, got: Missed): { say: boolean; why: string } {
  if (got.done === 0 && got.failed === 0) {
    return { say: false, why: "пока вас не было, автоматических дел не было" };
  }
  if (goneMs < GONE_MS) {
    return { say: false, why: "вы были рядом: результат виден на экране, отдельное сообщение не нужно" };
  }
  return { say: true, why: "вы вернулись, а дела закончились без вас — иначе об этом не узнать" };
}

/**
 * Отметка «прочитано».
 *
 * Хранится временем последнего показа, а не флагом: тогда следующая сводка
 * считается от него, и одно и то же дело не всплывает дважды.
 */
export function markSeen(storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null, at: number): void {
  try {
    storage?.setItem(KEY, String(at));
  } catch {
    // Хранилища нет — сводка покажется ещё раз. Это лучше, чем потерять её.
  }
}

/** Когда человек видел сводку в прошлый раз. `null` — не видел ни разу. */
export function lastSeen(storage: { getItem(k: string): string | null } | null): number | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export const KEY = "zshelper.missed.at";

/** Что сводка не делает. */
export function notDo(): string[] {
  return [
    "не показывает себя при каждом переходе между экранами — один раз на возвращение",
    "не заменяет ошибку списком успехов: «2 дела, 1 не получилось»",
    "не говорит «ничего нового» — это сообщение ни о чём",
  ];
}
