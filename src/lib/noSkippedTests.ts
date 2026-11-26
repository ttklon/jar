/**
 * Шаг 486: запрет на «зелёный CI» ценой выключенного теста.
 *
 * Самый быстрый способ сделать прогон зелёным — выключить упавший тест. Через
 * неделю выключенных тестов больше, чем включённых, и прогон зелёный всегда: он
 * больше ничего не проверяет.
 *
 * Поэтому «пропуск» — это **разрешение**, а не действие:
 *
 *  * у пропуска есть **причина** (не «flaky», а «ждёт починки шага 344»);
 *  * у пропуска есть **срок** — дата, после которой он сам валит сборку;
 *  * у пропуска есть **ссылка** на задачу или шаг плана, а не «потом».
 *
 * Пропуск без срока — бессрочное выключение, даже если причина написана красиво.
 */

/** Пропущенный тест. */
export interface Skip {
  /** Имя теста — как в отчёте. */
  readonly test: string;
  /** Способ пропуска. */
  readonly how: "skip" | "todo" | "only";
  /** Причина. */
  readonly why: string;
  /** До какой даты `YYYY-MM-DD`; `null` — бессрочно (запрещено). */
  readonly until: string | null;
}

/** Срок пропуска по умолчанию — две недели. */
export const MAX_DAYS = 14;

/** Способы, запрещённые целиком. */
const FORBIDDEN: Skip["how"][] = ["only"];

/** Разбор даты. */
export function days(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms / 86_400_000;
}

/**
 * Что не так с пропуском.
 *
 * Нарушения — с именем теста: иначе в отчёте «3 пропуска», и непонятно, какие.
 */
export function check(skip: Skip, today: string): string[] {
  const problems: string[] = [];

  if (FORBIDDEN.includes(skip.how)) problems.push(`«${skip.test}»: \`only\` выключает остальные тесты — это не пропуск, а поломка прогона`);
  if (skip.why.trim().length < 10) problems.push(`«${skip.test}»: причина «${skip.why}» ничего не объясняет`);

  if (skip.until === null) {
    problems.push(`«${skip.test}»: пропуск бессрочный — выключение без срока`);
    return problems;
  }

  const until = days(skip.until);
  const now = days(today);
  if (until === null) {
    problems.push(`«${skip.test}»: срок «${skip.until}» не дата`);
    return problems;
  }
  if (now === null) {
    problems.push(`«${today}» — не дата: срок пропуска не с чем сравнить`);
    return problems;
  }

  if (until < now) problems.push(`«${skip.test}»: срок вышел (${skip.until}) — тест обязан вернуться`);
  if (until - now > MAX_DAYS) problems.push(`«${skip.test}»: срок ${Math.floor(until - now)} дней — дольше ${MAX_DAYS} это уже выключение`);

  return problems;
}

/**
 * Все пропуски.
 *
 * Сводка для CI: сколько, что самое дальнее. Один пропуск — нормально; десять —
 * это прогон, который ничего не проверяет.
 */
export function summary(skips: readonly Skip[], today: string): { ok: boolean; said: string } {
  const problems = skips.flatMap((skip) => check(skip, today));
  if (problems.length > 0) return { ok: false, said: problems.join("; ") };

  if (skips.length === 0) return { ok: true, said: "пропусков нет: все тесты работают" };
  const latest = skips.map((skip) => skip.until ?? "").sort().at(-1) ?? "";
  return { ok: true, said: `пропусков ${skips.length}, все со сроком (самый дальний ${latest})` };
}

/**
 * Чего пропуск не делает.
 *
 * Три запрета; первый — не ради зелёного.
 */
export function notDo(): string[] {
  return [
    "не делается ради зелёного прогона: пропуск — разрешение с причиной и сроком",
    "не живёт дольше четырнадцати дней: дальше это выключение",
    "не оформляется как `only` или `describe.skip` без записи в списке",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу частей пропуска.
 */
export function checks(): string[] {
  return [
    "у каждого пропуска есть причина и срок",
    "просроченный пропуск валит сборку",
    "`only` запрещён целиком",
  ];
}
