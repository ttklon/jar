/**
 * Шаг 433: журнал можно читать из приложения, без выхода в файлы.
 *
 * Открыть файл журнала блокнотом — это не «прочитать журнал». Там построчный
 * JSON, коды, полные пути и всё за все месяцы сразу. Человеку нужно другое:
 * **список дел**, сгруппированный по дням, с понятными словами и возможностью
 * отфильтровать то, что он ищет.
 *
 * Три решения:
 *
 *  * **по дням, а не сплошной лентой** — «вчера», «позавчера», потом дата: так
 *    человек помнит, когда это было;
 *  * **свёрнуто по делам**: одно дело — одна строка, а не пять строк про его шаги;
 *  * **старое подгружается по кнопке**, а не само: иначе на слабой машине экран
 *    журнала открывается три секунды.
 */

import type { Level } from "./logLevels";

/** Что в списке. */
export interface Item {
  readonly at: number;
  readonly title: string;
  readonly level: Level;
  /** Подробности — только если человек раскрыл. */
  readonly detail?: string;
}

/** Группа — день. */
export interface Day {
  readonly key: string;
  readonly title: string;
  readonly items: Item[];
}

/**
 * Сгруппировать по дням.
 *
 * Заголовок дня — по-русски: «сегодня», «вчера», потом «18 ноября». Не «2026-11-18»:
 * человек не читает даты в обратном порядке.
 */
export function days(items: readonly Item[], now: number): Day[] {
  const map = new Map<string, Item[]>();

  for (const item of [...items].sort((a, b) => b.at - a.at)) {
    const key = dayKey(item.at);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }

  return [...map.entries()].map(([key, list]) => ({ key, title: dayTitle(list[0]!.at, now), items: list }));
}

/** Ключ дня — по местному, а не UTC: «вчера» у человека своё. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Заголовок дня. */
export function dayTitle(ms: number, now: number): string {
  if (dayKey(ms) === dayKey(now)) return "сегодня";
  if (dayKey(ms) === dayKey(now - 86_400_000)) return "вчера";
  const d = new Date(ms);
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const thisYear = new Date(now).getFullYear() === d.getFullYear();
  return thisYear ? `${d.getDate()} ${months[d.getMonth()]}` : `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Сколько показывать сразу и как подгружать.
 *
 * По кнопке — по пятьдесят: человек листает, а не ждёт разбора всего журнала.
 */
export function page(all: readonly Item[], shown: number, step = 50): { items: Item[]; more: number; said: string } {
  const items = all.slice(0, shown);
  const more = Math.max(0, all.length - shown);
  return {
    items,
    more,
    said: more === 0 ? `показано всё: ${all.length}` : `показано ${items.length} из ${all.length}; «показать ещё» — ${Math.min(step, more)}`,
  };
}

/**
 * Строка записи.
 *
 * Время и что было. Уровень — пометкой (шаг 421), а не словом «уровень»: журнал
 * читают глазами, а не разбирают.
 */
export function row(item: Item): string {
  const d = new Date(item.at);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} ${item.title}`;
}

/**
 * Что журнал в приложении не показывает.
 *
 * Не «всё, что есть в файле»: файл — для поддержки, экран — для человека.
 */
export function notShown(): string[] {
  return [
    "коды ошибок и полные пути: они в файле, а не на экране",
    "служебные строки («нажал кнопку»): их много, и они прячут дела",
    "чужие дела, если профилей несколько: журнал показывает свои (шаг 418)",
  ];
}

/**
 * Что не нужно, чтобы прочитать.
 *
 * Ни блокнота, ни папки данных: журнал открывается в приложении.
 */
export function withoutFiles(): string {
  return "журнал открывается в приложении: без блокнота, без поиска папки данных и без разбора JSON";
}
