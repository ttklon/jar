/**
 * Шаг 293: брать приём, а не код, когда код тянет лишнее.
 *
 * Не догма «никогда не берите чужой код» — наоборот, иногда своя реализация
 * дороже и хуже. Правило узкое: **если приём можно взять отдельно, а код тянет
 * за собой десяток зависимостей — берём приём.**
 *
 * Почему это считается, а не решается на вкус:
 *
 *  * у каждой зависимости есть цена: размер, обновления, уязвимости, лицензия;
 *  * цена видна только **до** подключения: после — это уже ваш код, с которым
 *    ничего не сделать;
 *  * «одна маленькая библиотека» обычно приходит с четырьмя.
 */

/** Что рассматриваем. */
export interface Item {
  readonly id: string;
  /** Приём, который хотим. */
  readonly what: string;
  /** Сколько зависимостей потянет код. */
  readonly codeDeps: number;
  /** Вес кода в килобайтах. */
  readonly codeKb: number;
  /** Приём можно воспроизвести без кода: идея описана словами. */
  readonly ideaCovers: boolean;
}

/** Сколько зависимостей считаем «лишним» для одного приёма. */
export const DEP_BUDGET = 3;

/** Решение по одному пункту. */
export interface Decision {
  /** Берём код или только приём. */
  readonly code: boolean;
  /** Почему — с числом, а не «так лучше». */
  readonly why: string;
}

/**
 * Решить по пункту.
 *
 * Три случая: код дешёвый — берём код; код дорогой, приём понятен — берём приём;
 * код дорогой, приём не описан — придётся код, и это надо назвать, а не спрятать.
 */
export function take(item: Item): Decision {
  const price = `${item.codeDeps} ${plural(item.codeDeps, "зависимость", "зависимости", "зависимостей")}, ${item.codeKb} КБ`;

  if (item.ideaCovers && item.codeDeps > DEP_BUDGET) {
    return { code: false, why: `код потянет ${price} — приём описан словами, берём его` };
  }
  if (item.ideaCovers) {
    return { code: true, why: `код стоит ${price} — дешевле взять его, чем писать заново` };
  }
  if (item.codeDeps > DEP_BUDGET) {
    return { code: true, why: `приём словами не описан, а код тянет ${price} — это придётся принять` };
  }
  return { code: true, why: `приём словами не описан, код стоит ${price}` };
}

/** Итог по списку: что взяли кодом, что приёмом и сколько не потянули. */
export function summary(items: readonly Item[]): { said: string; ideas: number; code: number } {
  const decided = items.map((item) => ({ item, verdict: take(item) }));
  const ideas = decided.filter((row) => !row.verdict.code).length;
  const code = decided.length - ideas;
  const savedKb = decided
    .filter((row) => !row.verdict.code)
    .reduce((sum, row) => sum + row.item.codeKb, 0);
  const savedDeps = decided
    .filter((row) => !row.verdict.code)
    .reduce((sum, row) => sum + row.item.codeDeps, 0);

  return {
    said: `приёмов ${ideas}, кода ${code}; не потянули ${savedDeps} ${plural(savedDeps, "зависимость", "зависимости", "зависимостей")} и ${savedKb} КБ`,
    ideas,
    code,
  };
}

/**
 * Цена решения в терминах, которые видит пользователь.
 *
 * «У нас на одну зависимость меньше» пользователю ничего не говорит; «обновлять
 * на 9 мегабайт меньше» — говорит.
 */
export function forUser(totalDeps: number, totalMb: number): string {
  if (totalDeps <= 0) return "ничего лишнего в сборке";
  return `в сборке ${totalDeps} ${plural(totalDeps, "чужая зависимость", "чужие зависимости", "чужих зависимостей")}, это ${totalMb} МБ обновлений`;
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
