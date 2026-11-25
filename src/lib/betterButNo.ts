/**
 * Шаг 299: список «что у них лучше и почему мы не берём» — с причиной.
 *
 * Это самый неудобный документ в проекте: он про то, где мы **проигрываем**, и
 * при этом остаётся. Без него таблица заимствований превращается в рекламный
 * буклет, а первый же человек, попробовавший образец, говорит «у них-то лучше» —
 * и оказывается прав, а мы не готовы.
 *
 * У причины строгий формат, иначе она превращается в отговорку:
 *
 *  * **что лучше** — конкретная вещь, а не «полировка»;
 *  * **для кого лучше** — честно: часто лучше для другого человека, и это
 *    нормальный ответ, а не поражение;
 *  * **что было бы у нас** — то, что мы даём вместо;
 *  * **цена** — время, зависимости, риск: «не берём» должно опираться на число;
 *  * **срок пересмотра** — иначе «потом» означает «никогда».
 */

/** Строка списка. */
export interface NotTaken {
  /** Что у них лучше. */
  readonly what: string;
  /** Кто именно. */
  readonly who: string;
  /** Для кого это лучше — честно, а не «для всех». */
  readonly betterFor: string;
  /** Что у нас вместо. */
  readonly instead: string;
  /** Цена, если всё-таки взять. */
  readonly cost: string;
  /** Когда пересмотреть — миллисекунды. */
  readonly revisitAt: number;
}

/** Что значит «лучше», если это нельзя проверить. */
const VAGUE = /^(полировка|красивее|лучше в целом|больше функций|солиднее)$/i;

/**
 * Проверка строки.
 *
 * Главное: «лучше вообще» — не аргумент. Аргумент — «лучше для того, кто делает
 * X», и тогда либо у нас есть X, либо мы говорим, что X нам не нужен.
 */
export function check(row: NotTaken, today: number): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  if (VAGUE.test(row.what.trim())) problems.push(`«${row.what}» — не конкретная вещь`);
  if (row.betterFor.trim().length < 10) problems.push(`«${row.what}»: не сказано, для кого лучше`);
  if (/^(все|всем|пользователям)$/i.test(row.betterFor.trim().replace(/[.,;:!?]+$/, ""))) {
    problems.push(`«${row.what}»: «${row.betterFor}» — значит, для никого конкретно`);
  }
  if (row.instead.trim() === "") problems.push(`«${row.what}»: нет «что у нас вместо» — это не сравнение, а жалоба`);
  if (!/\d/.test(row.cost)) problems.push(`«${row.what}»: цена без числа — «дорого» ничего не говорит`);
  if (row.revisitAt <= today) problems.push(`«${row.what}»: срок пересмотра прошёл — решение устарело само`);

  return { ok: problems.length === 0, problems };
}

/** Проверить весь список. */
export function audit(rows: readonly NotTaken[], today: number): { ok: boolean; said: string; due: string[] } {
  const problems = rows.flatMap((row) => check(row, today).problems);
  const due = rows.filter((row) => row.revisitAt <= today).map((row) => row.what);

  return {
    ok: problems.length === 0,
    said:
      problems.length === 0
        ? `строк ${rows.length}, у каждой названо, для кого лучше и чего нам это стоит`
        : `проблем ${problems.length}: ${problems.join("; ")}`,
    due,
  };
}

/**
 * Что показать человеку, который говорит «а у них лучше».
 *
 * Не спор и не защита, а факт: да, лучше для такого-то; у нас вместо; вернёмся к
 * вопросу тогда-то.
 */
export function reply(row: NotTaken): string {
  const when = new Date(row.revisitAt).toISOString().slice(0, 10);
  return `Да, у ${row.who} это лучше — для ${row.betterFor}. У нас вместо этого: ${row.instead}. Пересмотрим ${when}, если вам этого не хватает`;
}

/**
 * Доля списка, где лучше «для всех».
 *
 * Если больше половины строк утверждают, что лучше для всех, значит, авторы не
 * думали о людях, а защищались — и это единственный счётчик, который тут нужен.
 */
export function vagueShare(rows: readonly NotTaken[]): number {
  if (rows.length === 0) return 0;
  const vague = rows.filter((row) => /^(все|всем|пользователям)$/i.test(row.betterFor.trim())).length;
  return vague / rows.length;
}
