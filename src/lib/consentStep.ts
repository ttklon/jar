/**
 * Согласие по шагу, отзывается при изменении параметра (шаг 102).
 *
 * Дефект. Согласие даётся **сразу на весь план**, а план потом меняется:
 *
 *  * **правка после согласия — обход**: человек разрешил шаг с путём `D:\Отчёты`,
 *    потом поправил путь на `D:\Всё` — согласие осталось, и удалилось «всё»;
 *  * **согласие на один шаг разрешает соседний**: шаги похожи, и «да» на первый
 *    молча покрывает второй, который человек не читал;
 *  * **отзыв невозможен**: если человек передумал по одному шагу, он снимает
 *    весь план — и теряет то, с чем был согласен.
 *
 * Правило: **согласие привязано к шагу и к его параметрам**.
 *
 *  1. Согласие помнит **отпечаток шага**: позицию и параметры. Изменился
 *     параметр — согласие **снято**, а не «обновлено».
 *  2. **Шаг живёт своей жизнью**: снятие согласия по одному шагу не снимает
 *     остальные.
 *  3. Снятие — **с объяснением**: «параметр изменился, поэтому спрошу заново»,
 *     а не молчаливое «снова нужно подтверждение».
 *  4. Согласие **не переносится** на другой шаг, даже если шаги одинаковые:
 *     «да» на «удалить A» не значит «да» на «удалить B».
 *  5. Опасный шаг требует согласия **всегда** — даже если человек согласился
 *     раньше на такой же (шаг 82: вопрос задаётся там, где он нужен).
 *
 * Почему не «переспрашивать весь план при любой правке». Тогда любая опечатка
 * сбрасывает всё, и человек соглашается заново не читая — то есть согласие
 * перестаёт значить «я проверил».
 */

/** Согласие на шаг: позиция и отпечаток параметров. */
export interface Granted {
  /** Номер шага, с нуля — как в плане. */
  position: number;
  /** Отпечаток параметров на момент согласия. */
  print: string;
  /** Когда дано — чтобы старое согласие не жило вечно. */
  at: number;
}

/**
 * Отпечаток параметров.
 *
 * Порядок ключей **не влияет**: `{a:1,b:2}` и `{b:2,a:1}` — один шаг. Иначе
 * согласие снималось бы само при каждом пересчёте плана.
 */
export function print(params: Record<string, string> | undefined): string {
  if (params === undefined) return "";
  return Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/**
 * Что осталось согласованным.
 *
 * Возвращает **только те согласия, что всё ещё верны**: шаг есть в плане, и его
 * параметры не изменились. Остальные снимаются — не молча, а с причиной.
 */
export interface Check {
  /** Согласия, которые остаются в силе. */
  kept: Granted[];
  /** Шаги, где согласие снято, и почему. */
  lost: { position: number; why: string }[];
}

export function check(
  granted: readonly Granted[],
  steps: readonly { params?: Record<string, string> }[],
): Check {
  const kept: Granted[] = [];
  const lost: { position: number; why: string }[] = [];

  for (const grant of granted) {
    const step = steps[grant.position];
    if (step === undefined) {
      lost.push({ position: grant.position, why: "шага больше нет в плане" });
      continue;
    }
    const now = print(step.params);
    if (now !== grant.print) {
      // Правка после согласия — обход: согласие снимается, а не обновляется.
      lost.push({ position: grant.position, why: "параметр изменился — спрошу заново" });
      continue;
    }
    kept.push(grant);
  }

  return { kept, lost };
}

/**
 * Согласие на один шаг.
 *
 * Новое согласие на ту же позицию **заменяет** старое: два отпечатка одного шага
 * — это путаница, какое из них действует.
 */
export function grant(
  granted: readonly Granted[],
  position: number,
  params: Record<string, string> | undefined,
  at: number,
): Granted[] {
  return [
    ...granted.filter((item) => item.position !== position),
    { position, print: print(params), at },
  ];
}

/**
 * Отзыв согласия по одному шагу.
 *
 * Остальные остаются: человек передумал про один шаг, а не про весь план.
 */
export function revoke(granted: readonly Granted[], position: number): Granted[] {
  return granted.filter((item) => item.position !== position);
}

/**
 * Разрешён ли шаг.
 *
 * Совпадение — по позиции **и** отпечатку: «да» на такой же шаг в другом месте
 * не считается (шаг 102, правило 4).
 */
export function allowed(
  granted: readonly Granted[],
  position: number,
  params: Record<string, string> | undefined,
): boolean {
  const want = print(params);
  return granted.some((item) => item.position === position && item.print === want);
}

/**
 * Что сказать человеку.
 *
 * Снятие названо причиной: молчаливое «снова нужно подтверждение» выглядит
 * поломкой, а не последствием правки.
 */
export function say(check: Check): string {
  if (check.lost.length === 0) {
    return check.kept.length === 0 ? "согласий пока нет" : `согласовано шагов: ${check.kept.length}`;
  }
  const lost = check.lost
    .map((item) => `шаг ${item.position + 1}: ${item.why}`)
    .join("; ");
  return `согласие снято — ${lost}`;
}

/**
 * Возраст согласия.
 *
 * Старое согласие живёт вечно только в плохой программе: план мог измениться
 * снаружи (файлы переименованы), и согласие трёхдневной давности — это согласие
 * на другой план.
 */
export const STALE_MS = 15 * 60 * 1000;

export function stale(grant_: Granted, now: number): boolean {
  return now - grant_.at > STALE_MS;
}
