/**
 * Отдельно замер «холодный старт» и «тёплый», оба в журнале (шаг 136).
 *
 * Дефект. Один замер на всё скрывал **две разные причины** медленного:
 *
 *  * **холодный и тёплый смешаны**: «первый ответ 3,4 с, второй 0,4» читалось как
 *    нестабильность, хотя это два разных явления — подъём ядра (125) и работа;
 *  * **у холодного своя причина** (нет ядра, нет кэша, диск греется), у тёплого своя
 *    (модель думает, шагов много) — и лечить их надо по-разному;
 *  * **средняя по обоим врёт**: 1,9 с «в среднем» не говорит ни как быстро обычно, ни
 *    сколько стоит первый раз;
 *  * **в журнале нет пометки**, какой замер к какому старту: сравнить «стало ли лучше»
 *    можно только внутри одного рода.
 *
 * Правило: **у каждого замера есть род — холодный или тёплый, — и они не смешиваются**.
 *
 *  1. **Род определяется фактом**, а не догадкой: ядро поднималось на этом ответе —
 *     значит холодный.
 *  2. **Оба рода видны в журнале** отдельными числами; средняя по смеси не
 *     показывается.
 *  3. **Сравнение — внутри рода**: тёплый с тёплым, холодный с холодным.
 *  4. **Прогрев назван**: «первый раз дороже на 3 с» — факт, а не оправдание.
 *  5. **Род не теряется при сохранении**: в журнале и в хранилище он у замера, а не
 *     угадывается при чтении.
 *
 * Почему не «показывать только тёплый, он честнее». Тёплый честен про работу, но
 * **первый** ответ человек видит первым — и именно он определяет впечатление; прятать
 * его значило бы врать про ощущение.
 */

/** Род старта. */
export type Kind = "cold" | "warm";

/** Замер с родом. */
export interface Timed {
  /** Что было: фраза, словами. */
  what: string;
  /** Сколько шло, мс. */
  ms: number;
  kind: Kind;
}

/** Род по факту: поднималось ли ядро на этом ответе. */
export function kindOf(kernelStarted: boolean): Kind {
  return kernelStarted ? "cold" : "warm";
}

/** Словами — чтобы в журнале было видно, а не угадывалось. */
export function word(kind: Kind): string {
  return kind === "cold" ? "холодный старт" : "тёплый";
}

/** Строка журнала: дело, число и род. */
export function line(timed: Timed): string {
  return `«${timed.what}» · ${Math.round(timed.ms)} мс · ${word(timed.kind)}`;
}

/** Итоги по родам — раздельно, без средней по смеси. */
export interface Split {
  cold: { count: number; sum: number; said: string };
  warm: { count: number; sum: number; said: string };
  /** Средняя по смеси нарочно **не** даётся: она скрывает обе причины. */
  mixed: null;
}

export function split(timings: readonly Timed[]): Split {
  const cold = timings.filter((timed) => timed.kind === "cold");
  const warm = timings.filter((timed) => timed.kind === "warm");
  const sumOf = (rows: readonly Timed[]): number => rows.reduce((acc, row) => acc + row.ms, 0);
  return {
    cold: {
      count: cold.length,
      sum: sumOf(cold),
      said: cold.length === 0 ? "холодных стартов не было" : `холодный старт: ${cold.length}, всего ${Math.round(sumOf(cold))} мс`,
    },
    warm: {
      count: warm.length,
      sum: sumOf(warm),
      said: warm.length === 0 ? "тёплых ответов не было" : `тёплый: ${warm.length}, всего ${Math.round(sumOf(warm))} мс`,
    },
    mixed: null,
  };
}

/**
 * Сравнение — только внутри рода.
 *
 * «Тёплый стал 200 мс вместо 400» — факт; «стало быстрее» на смеси — мнение.
 */
export function compared(kind: Kind, now: readonly Timed[], before: readonly Timed[]): string {
  const pick = (rows: readonly Timed[]): number[] => rows.filter((row) => row.kind === kind).map((row) => row.ms);
  const a = pick(now);
  const b = pick(before);
  if (a.length === 0 || b.length === 0) return `${word(kind)}: сравнивать не с чем`;
  const avg = (rows: number[]): number => Math.round(rows.reduce((acc, row) => acc + row, 0) / rows.length);
  const nowAvg = avg(a);
  const beforeAvg = avg(b);
  const diff = beforeAvg - nowAvg;
  if (diff === 0) return `${word(kind)}: столько же, ${nowAvg} мс`;
  return diff > 0
    ? `${word(kind)}: быстрее на ${diff} мс (${nowAvg} против ${beforeAvg})`
    : `${word(kind)}: медленнее на ${-diff} мс (${nowAvg} против ${beforeAvg})`;
}

/**
 * Сколько стоит прогрев.
 *
 * «Первый раз дороже на 3 с» — не оправдание, а факт, с которым можно работать
 * (предзагрузка — шаг 131).
 */
export function worthOfWarming(splitIn: Split): string {
  if (splitIn.cold.count === 0 || splitIn.warm.count === 0) {
    return "прогрев не с чем сравнить: нужен хотя бы один холодный и один тёплый";
  }
  const coldAvg = Math.round(splitIn.cold.sum / splitIn.cold.count);
  const warmAvg = Math.round(splitIn.warm.sum / splitIn.warm.count);
  const extra = coldAvg - warmAvg;
  if (extra <= 0) return "прогрев ничего не стоит: холодный не дороже тёплого";
  return `первый раз дороже на ${extra} мс: ${coldAvg} против ${warmAvg}`;
}

/** Что сохранить: род живёт у замера, а не угадывается при чтении. */
export function stored(timings: readonly Timed[]): Timed[] {
  return timings.map((timed) => ({ ...timed }));
}
