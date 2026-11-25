/**
 * Шаг 404: журнал — кто что попросил. Без слежки, но с честной записью.
 *
 * Журнал дел уже есть (`memoryJournal`, `autoHistory`). Не хватает одного поля —
 * **кто**. Именно оно отделяет «честную запись» от «слежки»:
 *
 *  * слежка — это когда записывается всё, включая то, чего человек не просил
 *    (что он открывал, как долго думал, что писал и стирал);
 *  * честная запись — только **законченная просьба**: кто попросил, что попросил,
 *    чем кончилось.
 *
 * Три правила:
 *
 *  1. **одна строка на просьбу**, а не на каждое нажатие: журнал читают, а не
 *     анализируют;
 *  2. **фраза человека дословно** — пересказ «пользователь запросил очистку» хуже
 *     оригинала и не даёт разобраться; но если во фразе секрет — вычищается
 *     (шаг 352);
 *  3. **без «а ещё он смотрел»**. Строка про отказ — это тоже просьба; строка про
 *     просмотр экрана — нет.
 */

/** Запись журнала. */
export interface Entry {
  /** Когда — миллисекунды. */
  readonly at: number;
  /** Кто попросил — имя человека, а не id: журнал читают люди. */
  readonly who: string;
  /** Что попросил — его словами. */
  readonly said: string;
  /** Чем кончилось. */
  readonly outcome: "done" | "failed" | "cancelled" | "refused";
  /** Сообщением — если не done. */
  readonly why?: string;
}

/**
 * Сделать запись.
 *
 * Пустую просьбу не пишем: это не просьба, а случайное нажатие.
 */
export function entry(who: string, said: string, outcome: Entry["outcome"], why?: string): Entry | null {
  const clean = said.trim();
  if (clean === "") return null;
  return { at: 0, who: who.trim() === "" ? "неизвестно кто" : who.trim(), said: clean, outcome, ...(why ? { why } : {}) };
}

/**
 * Строка журнала по-русски.
 *
 * Формат: «Анна, 09:12 — почисти загрузки → сделано». Время — по местным часам,
 * потому что журнал читают в тот же день.
 */
export function line(e: Entry): string {
  const when = new Date(e.at);
  const hh = String(when.getHours()).padStart(2, "0");
  const mm = String(when.getMinutes()).padStart(2, "0");
  const result = outcomeWord(e.outcome);
  const tail = e.why ? `${result}: ${e.why}` : result;
  return `${e.who}, ${hh}:${mm} — ${e.said} → ${tail}`;
}

/** Итог по-русски. */
export function outcomeWord(outcome: Entry["outcome"]): string {
  const words: Record<Entry["outcome"], string> = {
    done: "сделано",
    failed: "не получилось",
    cancelled: "отменено",
    refused: "отказано",
  };
  return words[outcome];
}

/**
 * Что журнал показывает про человека.
 *
 * Счёт по его просьбам — но **не** рейтинг: «12 дел, 10 сделано» без «из 10
 * попыток» превращается в оценку человека, а не в отчёт о работе.
 */
export function about(entries: readonly Entry[], who: string): { total: number; done: number; failed: number; said: string } {
  const mine = entries.filter((e) => e.who === who);
  const done = mine.filter((e) => e.outcome === "done").length;
  const failed = mine.filter((e) => e.outcome === "failed").length;
  if (mine.length === 0) return { total: 0, done: 0, failed: 0, said: `${who}: записей нет` };
  return { total: mine.length, done, failed, said: `${who}: ${mine.length} ${plural(mine.length, "просьба", "просьбы", "просьб")}, выполнено ${done}, не получилось ${failed}` };
}

/**
 * Сортировка и обрезка.
 *
 * Новые сверху — журнал читают ради последнего. Обрезка по числу строк, а не по
 * времени: «за месяц» выкидывает всё у того, кто пользовался редко.
 */
export function recent(entries: readonly Entry[], limit = 50): Entry[] {
  return [...entries].sort((a, b) => b.at - a.at).slice(0, limit);
}

/**
 * Что в журнал не попадает.
 *
 * Список — граница между записью и слежкой, и она важнее любой функции журнала.
 */
export function notLogged(): string[] {
  return [
    "что человек смотрел, но не просил: экраны, настройки, паузы в наборе",
    "что он стёр, не отправив: набранная и удалённая фраза",
    "содержимое файлов: только имена и числа",
    "секреты: пароли и ключи вычищаются до записи",
  ];
}

/** Склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
