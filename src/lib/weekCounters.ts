/**
 * Шаг 434: счётчики — сколько дел, сколько отказов, сколько отмен — за неделю.
 *
 * `myStats` (шаг 424) даёт сводку «как у меня дела». Здесь — **счётчики для
 * динамики**: те же числа, но с сравнением по неделям, чтобы было видно, куда
 * всё идёт. Разница по задаче: там «за неделю», здесь «неделя к неделе».
 *
 * Три правила, без которых счётчики врут:
 *
 *  * **отказ ≠ отмена**: «не получилось» и «я передумал» — разные вещи, и считать
 *    их одним числом значит делать человеку упрёк за его же решение;
 *  * **неделя — скользящая**, а не «календарная»: человек не живёт по отчётам, и
 *    «неделя началась в понедельник» делает числа скачками;
 *  * **пустая неделя — не ноль в сравнении**: «дел не было» и «дел было 0» — одно
 *    и то же число, но разный совет. Процент от нуля не считается.
 */

/** Что считаем. */
export interface Deed {
  readonly at: number;
  readonly outcome: "done" | "failed" | "cancelled";
}

/** Счётчики одной недели. */
export interface Counts {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly cancelled: number;
}

/** Сравнение двух недель. */
export interface Trend {
  readonly now: Counts;
  readonly before: Counts;
  /** Разница по каждому числу: `null` — сравнивать не с чем (было 0). */
  readonly delta: { readonly total: number | null; readonly failed: number | null };
  readonly said: string;
}

/**
 * Посчитать окно.
 *
 * `from` включается, `to` не включается: половина открытая, чтобы недели не
 * пересекались одной записью.
 */
export function window(deeds: readonly Deed[], from: number, to: number): Counts {
  const inside = deeds.filter((deed) => deed.at >= from && deed.at < to);
  return {
    total: inside.length,
    done: inside.filter((deed) => deed.outcome === "done").length,
    failed: inside.filter((deed) => deed.outcome === "failed").length,
    cancelled: inside.filter((deed) => deed.outcome === "cancelled").length,
  };
}

/**
 * Неделя к неделе.
 *
 * `now` — конец текущей недели (обычно «сейчас»).
 */
export function trend(deeds: readonly Deed[], now: number): Trend {
  const WEEK = 7 * 86_400_000;
  const current = window(deeds, now - WEEK, now);
  const previous = window(deeds, now - 2 * WEEK, now - WEEK);

  const deltaTotal = previous.total === 0 ? null : current.total - previous.total;
  const deltaFailed = previous.failed === 0 && current.failed === 0 ? 0 : previous.failed === 0 ? null : current.failed - previous.failed;

  return {
    now: current,
    before: previous,
    delta: { total: deltaTotal, failed: deltaFailed },
    said: say(current, previous, deltaTotal, deltaFailed),
  };
}

/** Что сказать. */
function say(current: Counts, previous: Counts, deltaTotal: number | null, deltaFailed: number | null): string {
  if (current.total === 0 && previous.total === 0) return "две недели без дел";

  const parts: string[] = [];
  parts.push(`на этой неделе ${current.total} ${plural(current.total, "дело", "дела", "дел")}: сделано ${current.done}`);

  if (current.failed > 0) parts.push(`отказов ${current.failed}`);
  if (current.cancelled > 0) parts.push(`отмен ${current.cancelled}`);

  if (deltaTotal === null) parts.push("на прошлой неделе дел не было — сравнивать не с чем");
  else if (deltaTotal === 0) parts.push("столько же, сколько на прошлой");
  else parts.push(deltaTotal > 0 ? `на ${deltaTotal} больше прошлой недели` : `на ${-deltaTotal} меньше прошлой недели`);

  if (deltaFailed !== null && deltaFailed < 0) parts.push("отказов стало меньше — это хорошо");
  if (deltaFailed !== null && deltaFailed > 0) parts.push("отказов стало больше — стоит посмотреть причины");

  return parts.join("; ");
}

/**
 * Что счётчики не показывают.
 *
 * Три вещи, каждая из которых была бы слежкой или упрёком.
 */
export function notShown(): string[] {
  return [
    "время в приложении: это не дело",
    "сколько раз человек не сразу понял, что сказать",
    "«худший день»: журнал — не табель, и худший день ничего не значит",
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
