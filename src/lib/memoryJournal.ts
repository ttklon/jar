/**
 * Шаг 270: «не запоминай» — факт не появился после перезапуска, и это видно в журнале.
 *
 * Просьба без следа — это просьба, которую нельзя проверить. Человек сказал «не
 * запоминай это», закрыл приложение, открыл снова и увидел факт (или, наоборот,
 * не увидел и не понял почему). Обе беды — из одного: **решение не записано
 * нигде, кроме памяти процесса**.
 *
 * Поэтому здесь три вещи, которых не было по отдельности:
 *
 *  1. **исключение живёт на диске, а не в процессе** (шаг 267 его придумал, но
 *     держал в памяти процесса). Перезапуск — обычное дело, а люди обещают
 *     вещи, которые должны пережить перезапуск;
 *  2. **отказ записывается в журнал с причиной.** «Не записалось» и «записалось,
 *     но не показывается» — разные беды, и различает их только причина. Журнал
 *     отвечает на вопрос «почему этого нет», а не только «этого нет»;
 *  3. **журнал переживает перезапуск тоже.** Иначе после перезапуска причина
 *     снова исчезает, а факта всё ещё нет — и человек ищет сбой.
 *
 * Границы: журнал не растёт бесконечно (предел — не место, а сигнал), сломанное
 * хранилище — пустой журнал с честным «не читается», а не падение.
 */

import { allowed as exceptionAllows, live, type Exception } from "./dontStore";

/** Хранилище: как `localStorage`, но без глобального объекта. */
export interface Store {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** Ключ исключений. С версией: формат может измениться. */
export const KEY = "jar.dontStore.v1";

/** Ключ журнала решений. Отдельно: журнал читают, даже когда исключений нет. */
export const LOG_KEY = "jar.memoryLog.v1";

/** Факт, который собирались записать. */
export interface Fact {
  readonly kind: string;
  readonly value: string;
}

/** Одно решение о записи: что решили и почему. */
export interface Entry {
  /** Когда решали. */
  readonly at: number;
  /** Что собирались записать — словами, а не ключами. */
  readonly label: string;
  /** Итог: записано или нет. */
  readonly written: boolean;
  /** Почему не записано. Пусто — записано. */
  readonly because: string;
}

/**
 * Предел журнала.
 *
 * Сорок — столько же, сколько у журнала первого запуска: это не летопись всей
 * жизни. Двести строк значат, что в журнал пишут не то.
 */
export const LIMIT = 40;

/** Прочитанные исключения и честный ответ, если их не прочитать. */
export function loadExceptions(store: Store | null): { exceptions: Exception[]; said: string } {
  if (store === null) return { exceptions: [], said: "хранилище недоступно — исключения не переживут перезапуск" };
  let raw: string | null = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return { exceptions: [], said: "хранилище не читается — исключения не переживут перезапуск" };
  }
  if (raw === null || raw === "") {
    return { exceptions: [], said: "" };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { exceptions: [], said: "исключения в файле не список — начнём заново" };
    const exceptions: Exception[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.kind !== "string" || row.kind === "") continue;
      if (typeof row.at !== "number" || !Number.isFinite(row.at)) continue;
      exceptions.push({
        kind: row.kind,
        value: typeof row.value === "string" ? row.value : "",
        at: row.at,
        said: typeof row.said === "string" ? row.said : "",
      });
    }
    return { exceptions, said: "" };
  } catch {
    // Сломанное хранилище не должно стирать обещание молча: лучше сказать.
    return { exceptions: [], said: "исключения повреждены — прочитать не удалось" };
  }
}

/** Сохранить исключения. Не смогли — сказано, а не проглочено. */
export function saveExceptions(store: Store | null, exceptions: readonly Exception[]): { ok: boolean; said: string } {
  if (store === null) return { ok: false, said: "хранилище недоступно — обещание не переживёт перезапуск" };
  try {
    store.setItem(KEY, JSON.stringify(exceptions));
    return { ok: true, said: "" };
  } catch {
    return { ok: false, said: "не удалось сохранить исключения — обещание не переживёт перезапуск" };
  }
}

/**
 * Попытка записи факта: проверка по исключениям, журнал, честный итог.
 *
 * Проверка идёт по **действующим** исключениям: истёкшее не запрещает запись, но
 * и не стирается молча — оно останется в файле со своей датой.
 */
export function attempt(
  fact: Fact,
  exceptions: readonly Exception[],
  now: number,
): { write: boolean; entry: Entry; said: string } {
  const verdict = exceptionAllows(fact, live(exceptions, now));
  const label = nameOf(fact);
  const entry: Entry = {
    at: now,
    label,
    written: verdict.ok,
    because: verdict.ok ? "" : verdict.because,
  };
  if (verdict.ok) {
    return { write: true, entry, said: `${label} — запомню` };
  }
  return { write: false, entry, said: `${label} — не запомню: ${verdict.because}` };
}

/** Дописать журнал. Новые — в конец, старые уходят первыми. */
export function append(log: readonly Entry[], entry: Entry): Entry[] {
  const next = [...log, entry];
  return next.length <= LIMIT ? next : next.slice(next.length - LIMIT);
}

/** Прочитать журнал. Сломанный — пустой, с причиной. */
export function loadLog(store: Store | null): { log: Entry[]; said: string } {
  if (store === null) return { log: [], said: "хранилище недоступно — журнал не ведётся" };
  let raw: string | null = null;
  try {
    raw = store.getItem(LOG_KEY);
  } catch {
    return { log: [], said: "журнал не читается — записи о решениях потеряны" };
  }
  if (raw === null || raw === "") return { log: [], said: "" };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { log: [], said: "журнал в файле не список — потерян" };
    const log: Entry[] = [];
    for (const item of parsed) {
      if (typeof item !== "object" || item === null) continue;
      const row = item as Record<string, unknown>;
      if (typeof row.at !== "number" || !Number.isFinite(row.at)) continue;
      if (typeof row.label !== "string") continue;
      log.push({
        at: row.at,
        label: row.label,
        written: row.written === true,
        because: typeof row.because === "string" ? row.because : "",
      });
    }
    return { log, said: "" };
  } catch {
    return { log: [], said: "журнал повреждён — прочитать не удалось" };
  }
}

/** Сохранить журнал. */
export function saveLog(store: Store | null, log: readonly Entry[]): { ok: boolean; said: string } {
  if (store === null) return { ok: false, said: "" };
  try {
    store.setItem(LOG_KEY, JSON.stringify(log));
    return { ok: true, said: "" };
  } catch {
    return { ok: false, said: "журнал не сохранился — причина отказа не переживёт перезапуск" };
  }
}

/**
 * Что человек увидит в журнале.
 *
 * Ответ на вопрос, с которым приходят: «почему этой папки нет в памяти». Поэтому
 * отказы идут первыми и с причиной, а записанное — следом и одной строкой: журнал
 * не должен превращаться в список всего, что когда-либо запомнилось.
 */
export function view(log: readonly Entry[], limit = 5): { lines: string[]; said: string } {
  if (log.length === 0) {
    return { lines: [], said: "в журнале пусто: память ещё ничего не решала" };
  }
  const refused = log.filter((entry) => !entry.written);
  const lines: string[] = [];
  for (const entry of refused.slice(-limit).reverse()) {
    lines.push(`${when(entry.at)} — ${entry.label}: не записано, ${entry.because}`);
  }
  if (lines.length === 0) {
    lines.push(`отказов не было: решений ${log.length}`);
  }
  const word = refused.length === 1 ? "отказ" : refused.length < 5 ? "отказа" : "отказов";
  // «Из двух **решений**», а не «из 2 решения»: после «из» нужен родительный
  // падеж, и `plural` с именительным здесь не годится — ровно та ошибка, из-за
  // которой «3 раз» вместо «3 раза».
  return { lines, said: `${refused.length} ${word} из ${log.length} ${genitive(log.length, "решения", "решений")}` };
}

function nameOf(fact: Fact): string {
  if (fact.kind === "folder") return `папка ${fact.value}`;
  if (fact.kind === "program") return `программа ${fact.value}`;
  if (fact.kind === "voice") return `голос ${fact.value}`;
  if (fact.value === "") return fact.kind;
  return `${fact.kind} ${fact.value}`;
}

function when(at: number): string {
  const date = new Date(at);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month} ${hours}:${minutes}`;
}

/**
 * Родительный падеж после «из»: 1 из 1 решения, 2 из 2 решений.
 *
 * Одной формы «решений» мало: «1 решения» звучит как ошибка. Но и `plural` не
 * подходит — он про именительный.
 */
function genitive(n: number, one: string, many: string): string {
  const ten = n % 100;
  if (ten >= 11 && ten <= 14) return many;
  return n % 10 === 1 ? one : many;
}

