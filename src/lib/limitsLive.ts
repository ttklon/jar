/**
 * Шаг 473: документ «чего приложение не делает» обновляется вместе с кодом.
 *
 * Шаг 465 сделал сам список границ. Но документ, который написали один раз,
 * устаревает в момент, когда в коде появляется новая рука: граница «не умею
 * отправлять письма» тихо становится ложью.
 *
 * Здесь граница **привязана к коду**: у каждого пункта — то, чем он держится
 * (рука, экран, проверка в `src/lib`). Если якорь исчез из кода — пункт помечен
 * устаревшим, и это **ошибка проверки**, а не заметка.
 *
 * И наоборот: у каждой опасной руки должна быть строка в границах — иначе
 * человек узнаёт об ограничении после того, как попробовал.
 */

/** Пункт границы, привязанный к коду. */
export interface Limit {
  /** Что не делает. */
  readonly what: string;
  /** Якорь в коде: имя руки, имя экрана или путь модуля. */
  readonly anchor: string;
  /** Вид якоря — чтобы искать в правильном месте. */
  readonly kind: "hand" | "screen" | "module";
}

/**
 * Найти границы, которые больше не держатся.
 *
 * `have` — что реально есть в коде по каждому виду.
 */
export function stale(items: readonly Limit[], have: Record<Limit["kind"], readonly string[]>): string[] {
  return items
    .filter((item) => !have[item.kind].includes(item.anchor))
    .map((item) => `«${item.what}»: якорь ${item.kind}:${item.anchor} исчез из кода — граница могла появиться`);
}

/**
 * Найти опасные руки без строки в границах.
 *
 * Каждая опасная рука, о которой не сказано в разделе «чего не делаю», — это
 * неприятный сюрприз.
 */
export function uncovered(dangerous: readonly string[], items: readonly Limit[]): string[] {
  const covered = new Set(items.filter((item) => item.kind === "hand").map((item) => item.anchor));
  return dangerous.filter((hand) => !covered.has(hand));
}

/**
 * Сводка для CI.
 *
 * Три числа: сколько границ, сколько держится, сколько опасных рук не описано.
 */
export function summary(items: readonly Limit[], have: Record<Limit["kind"], readonly string[]>, dangerous: readonly string[]): { ok: boolean; said: string } {
  const broken = stale(items, have);
  const holes = uncovered(dangerous, items);

  const ok = broken.length === 0 && holes.length === 0;
  if (ok) return { ok, said: `границ ${items.length}, все держатся: ${dangerous.length} опасных рук описаны` };

  const parts: string[] = [];
  if (broken.length > 0) parts.push(`устарели: ${broken.join("; ")}`);
  if (holes.length > 0) parts.push(`опасные руки без границы: ${holes.join(", ")}`);
  return { ok, said: parts.join(". ") };
}

/**
 * Что делает разработчик, когда граница устарела.
 *
 * Два исхода, и оба — правка кода или правка честности, но не удаление строки.
 */
export function whenStale(): string[] {
  return [
    "если ограничение сняли — строку убирают и говорят в changelog (шаг 466): иначе люди не узнают, что теперь можно",
    "если якорь просто переехал — обновляют якорь: граница осталась, изменилось место",
  ];
}

/**
 * Чего проверка не делает.
 *
 * Три запрета: главное — не удалять неудобную строку.
 */
export function notDo(): string[] {
  return [
    "не удаляет границу, чтобы проверка стала зелёной",
    "не считает «посмотрели глазами» проверкой: якорь машинный",
    "не держит границу без якоря: непроверяемая строка устареет первой",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу связей.
 */
export function checks(): string[] {
  return [
    "у каждой границы есть якорь в коде, и он существует",
    "каждая опасная рука описана в границах",
    "снятое ограничение уходит в changelog, а не тихо",
  ];
}
