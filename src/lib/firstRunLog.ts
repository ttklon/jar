/**
 * Журнал первого запуска: что скачано, что проверено, что отложено.
 *
 * Шаг 40. Зачем отдельно от `ReadinessCard`. Карточка отвечает на вопрос «чего
 * не хватает **сейчас**», и это правильный вопрос для неё. Но через неделю
 * человек не помнит, скачивал ли он модель распознавания и откладывал ли её
 * тогда — а карточка к тому времени либо молчит (всё на месте), либо уже не
 * помнит, что было отложено. Журнал отвечает на другой вопрос: «что произошло
 * при первом запуске», и его не стирает успех.
 *
 * Три решения:
 *
 *  * **три состояния, а не два.** «Скачано» и «отложено» — разные вещи, но и
 *    «ещё не дошли» — не отложено. Иначе человек читает «отложено» про то, до
 *    чего просто не дошла очередь, и идёт искать несуществующую причину;
 *  * **проверка — отдельный факт от скачивания.** Файл может быть скачан, но
 *    не проверен (эталона не было, хеш записан, а не сверен). Сливать их
 *    значит говорить «проверено» там, где сверки не было;
 *  * **журнал пишется, а не выводится.** Он в `localStorage`, потому что
 *    перезапуск — обычное дело, а «что было в прошлый раз» нужно именно после
 *    него. Хранилище передаётся снаружи, сломанное — пустой журнал, а не падение.
 */

import { availableStorage, type StorageLike } from "./firstRun";

export const LOG_KEY = "zshelper.firstRun.log";

/** Что бывает при первом запуске. Ровно то, о чём спрашивает шаг 40. */
export type FirstRunEvent =
  | { what: "downloaded"; item: string }
  | { what: "verified"; item: string; how: "hash" | "recorded" }
  | { what: "deferred"; item: string; why: string }
  | { what: "checked"; item: string; result: "present" | "absent" };

/**
 * Предел записей. Не ради места: журнал первого запуска — не летопись всей
 * жизни, и двести строк в нём значат, что кто-то пишет туда не то.
 */
export const LOG_LIMIT = 40;

export function appendEvent(
  event: FirstRunEvent,
  storage: StorageLike | null = availableStorage(),
): boolean {
  if (!storage) return false;
  try {
    const log = readLog(storage);
    // Повтор того же события не дублируем: «скачано: модель» дважды подряд —
    // это не два факта, а один, записанный два раза.
    const last = log[log.length - 1];
    if (last && sameEvent(last, event)) return true;
    log.push(event);
    storage.setItem(LOG_KEY, JSON.stringify(log.slice(-LOG_LIMIT)));
    return true;
  } catch {
    return false;
  }
}

export function readLog(storage: StorageLike | null = availableStorage()): FirstRunEvent[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOG_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    // Чужая или испорченная запись не должна ронять экран: непонятное
    // отбрасываем, понятное оставляем.
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEvent).slice(-LOG_LIMIT);
  } catch {
    return [];
  }
}

/** Убрать журнал. Нужно тестам и «начать заново», а не обычной работе. */
export function clearLog(storage: StorageLike | null = availableStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(LOG_KEY);
  } catch {
    // Не убралось — не беда: следующая запись перезапишет.
  }
}

function isEvent(value: unknown): value is FirstRunEvent {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.item !== "string" || row.item === "") return false;
  switch (row.what) {
    case "downloaded":
      return true;
    case "verified":
      return row.how === "hash" || row.how === "recorded";
    case "deferred":
      return typeof row.why === "string" && row.why !== "";
    case "checked":
      return row.result === "present" || row.result === "absent";
    default:
      return false;
  }
}

function sameEvent(a: FirstRunEvent, b: FirstRunEvent): boolean {
  if (a.what !== b.what || a.item !== b.item) return false;
  if (a.what === "verified" && b.what === "verified") return a.how === b.how;
  if (a.what === "deferred" && b.what === "deferred") return a.why === b.why;
  if (a.what === "checked" && b.what === "checked") return a.result === b.result;
  return true;
}

/** Группы для показа: скачано, проверено, отложено. */
export interface LogSummary {
  downloaded: string[];
  verified: string[];
  deferred: string[];
  checked: string[];
}

/**
 * Свести журнал к тому, что человеку показывают.
 *
 * Одинаковые пункты схлопываются: «модель разговора» и «модель распознавания» —
 * разные пункты, а три раза «модель разговора» — один.
 */
export function summarize(log: FirstRunEvent[]): LogSummary {
  const summary: LogSummary = { downloaded: [], verified: [], deferred: [], checked: [] };
  const push = (list: string[], item: string) => {
    if (!list.includes(item)) list.push(item);
  };
  for (const event of log) {
    if (event.what === "downloaded") push(summary.downloaded, event.item);
    else if (event.what === "verified") push(summary.verified, event.item);
    else if (event.what === "deferred") push(summary.deferred, event.item);
    else push(summary.checked, event.item);
  }
  return summary;
}

/** Есть ли что показывать. Пустой журнал — не повод рисовать пустую карточку. */
export function isEmpty(log: FirstRunEvent[]): boolean {
  return log.length === 0;
}
