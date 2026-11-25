/**
 * Шаг 304: обновление поверх — данные и память на месте, откат при сбое.
 *
 * Обновление — главный источник потерь данных не потому, что код плохой, а
 * потому что **порядок действий** неверен: сначала удаляют старые файлы, потом
 * ставят новые, и если посередине что-то падает, не остаётся ни того, ни другого.
 *
 * Здесь порядок обратный и явный:
 *
 *  1. **проверить, что новое встанет** — место, права, версия схемы данных;
 *  2. **сохранить старое рядом** (`app.old`), а не перезаписать;
 *  3. **поставить новое** поверх;
 *  4. **проверить, что запустилось**: версия, файл данных читается, память на
 *     месте;
 *  5. **только тогда удалить `app.old`.** Не запустилось — вернуть старое из
 *     того же места, одной операцией.
 *
 * Ключевая тонкость: **данные принадлежат человеку и лежат отдельно от программы**
 * (шаг 219). Поэтому «откат программы» не откатывает данные: схема данных должна
 * читаться и старой, и новой версией (шаг 320 рядом).
 */

/** Что будет делать обновление. */
export interface Step {
  readonly order: number;
  readonly what: string;
}

/** Порядок обновления — ровно этот, и он проверяется тестом. */
export const STEPS: readonly Step[] = [
  { order: 1, what: "проверить место, права и версию схемы данных" },
  { order: 2, what: "сохранить текущую версию рядом как app.old" },
  { order: 3, what: "поставить новую версию поверх" },
  { order: 4, what: "запустить и проверить: версия, данные читаются, память на месте" },
  { order: 5, what: "удалить app.old только после успешной проверки" },
];

/** Исход проверки после установки. */
export interface Probe {
  /** Запустилось ли. */
  readonly started: boolean;
  /** Совпала ли версия с обещанной. */
  readonly version: string | null;
  /** Читается ли файл данных. */
  readonly dataReads: boolean;
  /** Сколько фактов памяти видно. */
  readonly memories: number;
}

/** Что делать после пробы. */
export type Outcome = "keep" | "rollback";

/** Что проверить и что потом. */
export function afterInstall(probe: Probe, expected: string, hadMemories: number): { outcome: Outcome; said: string } {
  if (!probe.started) return { outcome: "rollback", said: "новая версия не запустилась — возвращаем прежнюю из app.old" };
  if (probe.version !== expected) {
    return { outcome: "rollback", said: `запустилась версия ${probe.version ?? "без номера"}, а не ${expected} — что-то смешалось` };
  }
  if (!probe.dataReads) return { outcome: "rollback", said: "данные не читаются новой версией — откат, чтобы не потерять остальное" };
  if (probe.memories < hadMemories) {
    return {
      outcome: "rollback",
      said: `память потеряла ${hadMemories - probe.memories} фактов при обновлении — откат и разбор, а не «допишем потом»`,
    };
  }
  return { outcome: "keep", said: `версия ${expected} работает, все ${hadMemories} фактов памяти на месте` };
}

/**
 * Порядок шагов: проверка **после** установки, а не до.
 *
 * Возвращает нарушения, а не «ok»: важно, какой именно шаг переставлен.
 */
export function orderCheck(steps: readonly Step[] = STEPS): string[] {
  const problems: string[] = [];

  const save = steps.findIndex((step) => /сохранить текущую/.test(step.what));
  const install = steps.findIndex((step) => /поставить новую/.test(step.what));
  const probe = steps.findIndex((step) => /запустить и проверить/.test(step.what));
  const remove = steps.findIndex((step) => /удалить app\.old/.test(step.what));

  if (save > install) problems.push("новая версия ставится до сохранения старой — при сбое нечего возвращать");
  if (probe > remove) problems.push("app.old удаляется до проверки — откатываться будет некуда");
  if (probe === -1) problems.push("нет шага проверки: установка без проверки — это лотерея");

  const orders = steps.map((step) => step.order);
  if (new Set(orders).size !== orders.length) problems.push("два шага с одним номером: порядок не определён");

  return problems;
}

/**
 * Данные при откате.
 *
 * Откат программы **не** откатывает данные: они принадлежат человеку. Поэтому
 * старая версия обязана прочитать то, что записала новая, или честно сказать, что
 * не может.
 */
export function dataOnRollback(schemaVersion: number, oldReadsVersion: number): { ok: boolean; said: string } {
  if (oldReadsVersion >= schemaVersion) return { ok: true, said: `прежняя версия читает схему ${schemaVersion}` };
  return {
    ok: false,
    said: `прежняя версия знает схему только до ${oldReadsVersion}: после отката новые записи будут не видны — предупредить до отката`,
  };
}

/** Что сказать человеку перед обновлением, одной строкой. */
export function promise(): string {
  return "Программа обновится, память и файлы останутся на месте; если новая версия не запустится, вернётся прежняя";
}
