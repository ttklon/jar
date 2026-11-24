/**
 * Замерять каждый отрезок: фраза → текст → план → первый токен → первый звук → дело
 * (шаг 121).
 *
 * Дефект. Задержка известна **одним числом**, и число это бесполезно:
 *
 *  * **«отвечает 4 секунды»** — а какие именно? Пока человек говорит, пока
 *    распознаётся, пока планируется, пока ждём первый токен модели, пока
 *    синтезируется первый звук, пока выполняется дело — шесть разных мест;
 *  * **чинят не то**: ускоряют модель, а 3 из 4 секунд уходят на распознавание;
 *  * **«стало лучше» недоказуемо**: без отрезков улучшение одной части прячется за
 *    ухудшением другой;
 *  * **разные машины не сравниваются**: «на моём быстро» — не измерение.
 *
 * Правило: **каждый отрезок замеряется отдельно, и отрезки складываются в целое**.
 *
 *  1. **Шесть отрезков, названных по делу**: фраза (человек говорит) → текст
 *     (распознано) → план (решение принято) → первый токен (модель ответила) →
 *     первый звук (синтез пошёл) → дело (сделано).
 *  2. **Сумма отрезков равна целому**, или расхождение **названо**: время, которое
 *     никуда не попало, — это скрытая задержка, и она не должна исчезать.
 *  3. **Отрезок, которого не было, — не ноль**: `null`. Ноль значит «мгновенно», а
 *     «модель не вызывалась» — другое.
 *  4. **Замер — не оценка**: миллисекунды, а не «быстро»/«медленно».
 *  5. **Самый длинный отрезок назван**: человеку нужно знать, что чинить, а не
 *     таблицу.
 *
 * Почему не «одно общее число». Общее число отвечает «сколько», но не «где»; а
 * чинить можно только то, что нашли.
 */

/** Отрезки в порядке, в котором они происходят. */
export const ORDER = ["phrase", "text", "plan", "token", "sound", "deed"] as const;

export type Kind = (typeof ORDER)[number];

/** Замер одного ответа. */
export interface Trace {
  /** Отрезки в миллисекундах. `null` — отрезка не было. */
  parts: Partial<Record<Kind, number | null>>;
  /** Сколько прошло от начала до конца дела — независимый замер. */
  total: number;
}

/** Слово для отрезка — по-русски и по делу. */
export function word(kind: Kind): string {
  switch (kind) {
    case "phrase":
      return "фраза";
    case "text":
      return "текст";
    case "plan":
      return "план";
    case "token":
      return "первый токен";
    case "sound":
      return "первый звук";
    case "deed":
      return "дело";
  }
}

/**
 * Что заняло больше всего времени.
 *
 * Не таблица, а ответ на вопрос «что чинить»: самый длинный отрезок и его доля.
 */
export function slowest(trace: Trace): { kind: Kind; ms: number; share: number } | null {
  let best: { kind: Kind; ms: number } | null = null;
  for (const kind of ORDER) {
    const ms = trace.parts[kind];
    if (ms === null || ms === undefined) continue;
    if (best === null || ms > best.ms) best = { kind, ms };
  }
  if (best === null) return null;
  const sum = measured(trace);
  return { kind: best.kind, ms: best.ms, share: sum === 0 ? 0 : best.ms / sum };
}

/** Сумма замеренных отрезков. */
export function measured(trace: Trace): number {
  return ORDER.reduce((sum, kind) => sum + (trace.parts[kind] ?? 0), 0);
}

/**
 * Сходится ли сумма с целым.
 *
 * Расхождение **названо**, а не спрятано: время, которое никуда не попало, — это
 * скрытая задержка, и именно она чаще всего и есть настоящая причина жалоб.
 */
export function gaps(trace: Trace): { missing: number; said: string } {
  const sum = measured(trace);
  const missing = Math.max(0, trace.total - sum);
  // Допуск 5%: измерения разных часов не сходятся до миллисекунды, и требовать
  // этого значило бы спорить с реальностью.
  const allowed = Math.max(20, trace.total * 0.05);
  if (missing <= allowed) return { missing, said: "" };
  return {
    missing,
    said: `не учтено ${Math.round(missing)} мс — время, которое никуда не попало, и это тоже задержка`,
  };
}

/** Строки для журнала — по одной на отрезок, в порядке дела. */
export function lines(trace: Trace): string[] {
  const out: string[] = [];
  for (const kind of ORDER) {
    const ms = trace.parts[kind];
    // Пропущенный отрезок не печатается нулём: ноль значил бы «мгновенно».
    if (ms === null || ms === undefined) continue;
    out.push(`${word(kind)}: ${Math.round(ms)} мс`);
  }
  const slow = slowest(trace);
  if (slow !== null) {
    out.push(`дольше всего: ${word(slow.kind)} — ${Math.round(slow.ms)} мс (${Math.round(slow.share * 100)}% учтённого времени)`);
  }
  out.push(`всего: ${Math.round(trace.total)} мс`);
  const gap = gaps(trace);
  if (gap.said !== "") out.push(gap.said);
  return out;
}

/**
 * Сравнить два замера.
 *
 * Нужно, чтобы «стало лучше» было **проверяемым**: без сравнения по отрезкам
 * улучшение одной части прячется за ухудшением другой.
 */
export function compare(before: Trace, after: Trace): { kind: Kind; delta: number }[] {
  const out: { kind: Kind; delta: number }[] = [];
  for (const kind of ORDER) {
    const was = before.parts[kind];
    const now = after.parts[kind];
    // Отсутствие отрезка — это ноль затрат, а не «нет данных»: если модель не
    // вызывалась, её вклад в задержку — ровно ноль, и появление отрезка это
    // изменение. `null` при этом остаётся «вызывали, но не замерили» и не
    // сравнивается вовсе.
    if (was === null || now === null) continue;
    const before_ = was ?? 0;
    const after_ = now ?? 0;
    // Не изменившийся отрезок — не «изменение на 0 мс»: он засоряет ответ.
    if (before_ === after_) continue;
    out.push({ kind, delta: after_ - before_ });
  }
  return out.sort((left, right) => right.delta - left.delta);
}

/** Что сказать человеку об изменении — словами и числом. */
export function delta(before: Trace, after: Trace): string {
  const change = after.total - before.total;
  if (Math.abs(change) < 20) return "задержка не изменилась (в пределах 20 мс)";
  const parts = compare(before, after)
    .filter((item) => Math.abs(item.delta) >= 20)
    .map((item) => `${word(item.kind)} ${item.delta > 0 ? "+" : ""}${Math.round(item.delta)} мс`);
  const head = change < 0 ? `стало быстрее на ${Math.round(-change)} мс` : `стало медленнее на ${Math.round(change)} мс`;
  return parts.length === 0 ? head : `${head} (${parts.join(", ")})`;
}
