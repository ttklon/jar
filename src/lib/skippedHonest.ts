/**
 * Шаг 326: пропуск дела, если условие не наступило — без «успеха» в журнале.
 *
 * Самая тихая ложь в автоматизации: дело не запускалось, потому что условие не
 * наступило, а в журнале стоит «успешно». Через месяц по журналу видно «работало
 * 30 дней подряд», а на деле не работало ни разу.
 *
 * Поэтому у автоматического дела **три исхода**, а не два:
 *
 *  * `done` — сделано, с результатом;
 *  * `skipped` — не запускалось, **с причиной**: «места было достаточно»,
 *    «файлов не появилось»;
 *  * `failed` — не получилось.
 *
 * И отдельное правило: **пропуск не портит статистику успеха**. Иначе «95 %
 * успешных» будет означать «95 % дел не запускалось, потому что условия не
 * было» — и это уже подмена.
 */

/** Исход запуска. */
export type Outcome = "done" | "skipped" | "failed";

/** Запись журнала. */
export interface Record_ {
  /** Что за дело. */
  readonly what: string;
  readonly outcome: Outcome;
  /** Причина — обязательна для пропуска и провала. */
  readonly why: string;
  /** Когда случилось — по минуте. */
  readonly at: number;
}

/**
 * Записать исход.
 *
 * Пропуск без причины не записывается: «пропущено» без «почему» неотличимо от
 * ошибки, которую никто не смотрел.
 */
export function record(what: string, outcome: Outcome, why: string, at: number): { ok: boolean; record?: Record_; said: string } {
  const reason = why.trim();

  if (outcome !== "done" && reason === "") {
    return { ok: false, said: `у исхода «${outcome}» нет причины: через месяц это будет неотличимо от тишины` };
  }

  const said =
    outcome === "done"
      ? `${what}: сделано`
      : outcome === "skipped"
        ? `${what}: не запускалось — ${reason}`
        : `${what}: не получилось — ${reason}`;

  return { ok: true, record: { what, outcome, why: reason, at }, said };
}

/**
 * Статистика за период.
 *
 * «Успех» считается **от запусков**, а не от всех дней: пропуски вынесены
 * отдельно и названы своими словами.
 */
export function stats(records: readonly Record_[]): { tried: number; done: number; skipped: number; failed: number; said: string } {
  const done = records.filter((item) => item.outcome === "done").length;
  const skipped = records.filter((item) => item.outcome === "skipped").length;
  const failed = records.filter((item) => item.outcome === "failed").length;
  const tried = done + failed;

  const percent = tried === 0 ? 0 : Math.round((done / tried) * 100);
  const said =
    tried === 0
      ? `ни одного запуска за период: ${skipped} ${skipped === 1 ? "пропуск" : "пропусков"} — условие ни разу не наступило`
      : `запусков ${tried}: удачных ${done} (${percent} %), неудачных ${failed}; пропущено ${skipped} — не входит в счёт`;

  return { tried, done, skipped, failed, said };
}

/**
 * Что видно в журнале по одной строке.
 *
 * Пропуск помечен словом, а не галочкой: галочку пролистывают.
 */
export function line(record: Record_): string {
  const clock = `${String(Math.floor((record.at % 1440) / 60)).padStart(2, "0")}:${String(record.at % 60).padStart(2, "0")}`;
  if (record.outcome === "done") return `${clock} ${record.what}: сделано`;
  if (record.outcome === "skipped") return `${clock} ${record.what}: пропущено — ${record.why}`;
  return `${clock} ${record.what}: ошибка — ${record.why}`;
}

/**
 * Почему «успехов % от дней» — неверный счёт.
 *
 * Условие может не наступать неделями, и это нормально: «отчёт, если место
 * меньше 10 %» не должен срабатывать каждый день.
 */
export function whyFromRuns(): string {
  return "условие может не наступать неделями, и это нормально: «успех от всех дней» показывал бы 0 % у правила, которое просто не нужно было";
}

/**
 * Что сказать человеку, если правило пропускается слишком часто.
 *
 * Не «правило не работает»: оно работает, просто условие не наступает — и,
 * возможно, условие сформулировано не так, как человек думал.
 */
export function tooManySkips(skipped: number, tried: number): string | null {
  if (tried > 0) return null;
  if (skipped < 5) return null;
  return `правило не запускалось ${skipped} раз подряд: условие ни разу не наступило — проверьте, так ли оно задумано`;
}
