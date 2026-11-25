/**
 * Шаг 297: сравнение с двумя прямыми конкурентами по пяти пунктам сценария.
 *
 * Почему **по сценарию**, а не по списку функций: списком функций выигрывает тот,
 * у кого их больше, а это ровно то соревнование, в котором мы проигрываем и в
 * котором пользователю хуже. Сценарий — это «человек делает дело», и по нему
 * видно, справился он или нет.
 *
 * Пять пунктов фиксированы, потому что каждое сравнение любит добавлять «ещё
 * один важный пункт», пока счёт не станет удобным. Пункты:
 *
 *  1. **найти** — человек вспомнил примерно, что ищет;
 *  2. **сказать** — попросил словами, как говорит;
 *  3. **сделать** — попросил действие, не открывая приложение;
 *  4. **без сети** — то же самое в самолёте;
 *  5. **понять отказ** — не получилось, и человек понимает почему.
 *
 * Честность проверяется машинно: **пункт без проигрыша — подозрителен**, и это
 * не шутка. Сравнение, в котором мы везде лучше, не проверяли.
 */

/** Кто с кем сравниваем. */
export type Who = "us" | "them";

/** Как справились. */
export type Grade = "yes" | "partial" | "no";

/** Один пункт сценария. */
export interface Point {
  readonly id: "find" | "say" | "do" | "offline" | "refusal";
  /** Что делает человек. */
  readonly what: string;
  readonly us: Grade;
  readonly them: Grade;
  /** Почему так — без этого оценка не проверяется. */
  readonly why: string;
}

/** Два конкурента — по одному набору пунктов на каждого. */
export interface Compare {
  readonly name: string;
  readonly points: readonly Point[];
}

/** Ровно пять пунктов сценария — не больше и не меньше. */
export const POINTS: readonly Point["id"][] = ["find", "say", "do", "offline", "refusal"];

/** Число для счёта: «частично» — половина, а не «наверное, да». */
export function score(grade: Grade): number {
  return grade === "yes" ? 1 : grade === "partial" ? 0.5 : 0;
}

/** Счёт по пяти пунктам. */
export function total(points: readonly Point[]): { us: number; them: number } {
  return {
    us: points.reduce((sum, point) => sum + score(point.us), 0),
    them: points.reduce((sum, point) => sum + score(point.them), 0),
  };
}

/**
 * Проверка честности сравнения.
 *
 * Требования: все пять пунктов на месте (нельзя выкинуть неудобный), у каждого
 * есть «почему», и хотя бы один пункт мы **не** выигрываем — иначе сравнение не
 * проверяли.
 */
export function fair(compare: Compare): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const ids = compare.points.map((point) => point.id);

  for (const id of POINTS) {
    if (!ids.includes(id)) problems.push(`${compare.name}: пункт «${whatOf(id)}» пропущен — сравнение подогнано`);
  }
  if (ids.length !== POINTS.length) problems.push(`${compare.name}: пунктов ${ids.length}, а должно быть 5`);

  for (const point of compare.points) {
    if (point.why.trim().length < 15) problems.push(`${compare.name}: «${whatOf(point.id)}» без объяснения`);
    if (point.us === "yes" && point.them === "yes") problems.push(`${compare.name}: «${whatOf(point.id)}» одинаково — так не бывает, проверьте`);
  }

  const us = total(compare.points).us;
  const them = total(compare.points).them;
  if (us > them && compare.points.every((point) => score(point.us) > score(point.them))) {
    problems.push(`${compare.name}: мы выигрываем все пять пунктов — сравнение не проверяли`);
  }

  return { ok: problems.length === 0, problems };
}

/** Человеческое имя пункта. */
export function whatOf(id: Point["id"]): string {
  const names: Record<Point["id"], string> = {
    find: "найти",
    say: "сказать",
    do: "сделать",
    offline: "без сети",
    refusal: "понять отказ",
  };
  return names[id];
}

/**
 * Итог: где мы лучше, где они, и что с этим делать.
 *
 * Проигрыш не прячется в общий счёт: он называется по пункту, потому что именно
 * он — задача.
 */
export function verdict(compare: Compare): string {
  const better = compare.points.filter((point) => score(point.us) > score(point.them));
  const worse = compare.points.filter((point) => score(point.us) < score(point.them));
  const same = compare.points.length - better.length - worse.length;

  const plus = better.map((point) => whatOf(point.id)).join(", ") || "нигде";
  const minus = worse.map((point) => whatOf(point.id)).join(", ") || "нигде";

  return `${compare.name}: мы лучше — ${plus}; они лучше — ${minus}; одинаково — ${same}`;
}
