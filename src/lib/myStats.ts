/**
 * Шаг 424: статистика своих дел на экране «Обзор».
 *
 * Счётчики уже есть по частям: `autoHistory` (шаг 339) — про автоматизации,
 * `journal` (шаг 175) — про отказы. Здесь — **одна сводка за неделю**, на которую
 * человек смотрит и понимает, что происходит.
 *
 * Четыре числа, и ни одного лишнего: сколько дел, сколько отказов, сколько
 * отмен, сколько сэкономил времени. Пятое («открытий экранов») не нужно: это уже
 * слежка, а не польза.
 *
 * Три правила:
 *
 *  * **период называется словами** — «за неделю», а не «с 13 по 20 ноября»:
 *    человек спрашивает «как у меня дела», а не «какой период»;
 *  * **сравнение честное** — «на 3 больше, чем на прошлой неделе», и если прошлая
 *    неделя была пустой, это говорится, а не считается «+∞ %»;
 *  * **нет данных — не нули**: «пока нечего считать» лучше, чем аккуратный ноль,
 *    который выглядит как «всё плохо».
 */

/** Дело для счёта. */
export interface Deed {
  readonly at: number;
  readonly outcome: "done" | "failed" | "cancelled";
  /** Сколько времени заняло человеку, если бы делал руками — миллисекунды; `null` — не знаем. */
  readonly savedMs: number | null;
}

/** Сводка. */
export interface Stats {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly cancelled: number;
  /** Сэкономлено за период, мс; `null` — не из чего считать. */
  readonly savedMs: number | null;
  readonly said: string;
}

/**
 * За неделю.
 *
 * `now` — миллисекунды; неделя — семь суток назад, не «с понедельника»: человек
 * не живёт по календарю отчётов.
 */
export function week(deeds: readonly Deed[], now: number): Stats {
  // Правая граница — «сейчас включительно»: дело, которое кончилось в эту
  // секунду, уже случилось и должно попасть в «эту неделю», а не в «ту».
  return between(deeds, now - 7 * 86_400_000, now + 1);
}

/**
 * Окно счёта — половина открытая: `from` включается, `to` нет.
 *
 * Это единственное, что было полезного в `weekCounters` и чего здесь не хватало:
 * две недели подряд не должны пересекаться одной записью, иначе дело на границе
 * посчитается дважды и «стало больше» окажется выдумкой. `week()` выше — частный
 * случай окна, и теперь он им и пользуется.
 */
export function between(deeds: readonly Deed[], from: number, to: number): Stats {
  return count(deeds.filter((deed) => deed.at >= from && deed.at < to));
}

/**
 * Посчитать.
 *
 * Отмены считаются **отдельно** от отказов: «я передумал» и «не получилось» —
 * разные вещи, и смешивать их значит делать отчёту упрёк.
 */
export function count(deeds: readonly Deed[]): Stats {
  const done = deeds.filter((deed) => deed.outcome === "done").length;
  const failed = deeds.filter((deed) => deed.outcome === "failed").length;
  const cancelled = deeds.filter((deed) => deed.outcome === "cancelled").length;

  const known = deeds.map((deed) => deed.savedMs).filter((ms): ms is number => ms !== null);
  const savedMs = known.length === 0 ? null : known.reduce((sum, ms) => sum + ms, 0);

  if (deeds.length === 0) {
    return { total: 0, done: 0, failed: 0, cancelled: 0, savedMs: null, said: "пока нечего считать: дел за неделю не было" };
  }

  const parts = [`${deeds.length} ${plural(deeds.length, "дело", "дела", "дел")} за неделю`, `сделано ${done}`];
  if (failed > 0) parts.push(`не получилось ${failed}`);
  if (cancelled > 0) parts.push(`отменено ${cancelled}`);
  if (savedMs !== null) parts.push(`сэкономлено ${time(savedMs)}`);

  return { total: deeds.length, done, failed, cancelled, savedMs, said: parts.join(", ") };
}

/**
 * Сравнение с прошлой неделей.
 *
 * Пустая прошлая неделя — «раньше дел не было», а не «+100 %»: процент от нуля не
 * число, а трюк.
 */
export function compare(now: Stats, before: Stats): string {
  if (before.total === 0) return now.total === 0 ? "и на прошлой неделе дел не было" : "на прошлой неделе дел не было — сравнивать не с чем";
  if (now.total === 0) return "на этой неделе дел не было";
  const diff = now.total - before.total;
  if (diff === 0) return "столько же, сколько на прошлой неделе";
  return diff > 0 ? `на ${diff} больше, чем на прошлой неделе` : `на ${-diff} меньше, чем на прошлой неделе`;
}

/**
 * Что в статистику не попадает.
 *
 * Список — граница: числа про дела человека, а не про него самого.
 */
export function notCounted(): string[] {
  return [
    "просмотры экранов и время в приложении: это не дело",
    // Из weekCounters: «худший день» — тоже слежка, а не польза.
    "«худший день»: журнал — не табель, и худший день ничего не значит",
    "открытия меню и нажатия кнопок",
    "сколько раз человек ошибся при наборе фразы",
  ];
}

/** Время по-человечески. */
export function time(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)} с`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} мин`;
  const hours = ms / 3_600_000;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)} ч`;
}

/** Склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
