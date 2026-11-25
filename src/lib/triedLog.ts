/**
 * Шаг 294: ревью «что взяли и не взлетело» — записывать, чтобы не повторять.
 *
 * Самое дорогое в такой таблице — не список удач, а список **провалов**: приём,
 * который взяли и через месяц выбросили. Без записи через полгода кто-то снова
 * скажет «а давайте как в Notion» — и работа пойдёт по второму кругу.
 *
 * Поэтому запись делается **при выбрасывании**, а не «когда будет время». У неё
 * три обязательных части:
 *
 *  * **что взяли** — иначе не узнать, о чём речь;
 *  * **почему не взлетело** — «не понравилось» не годится, нужно что именно;
 *  * **что делать вместо** — иначе через полгода будет то же самое.
 *
 * И срок: попытка, о которой нельзя вспомнить, когда она была, не отличима от
 * свежей идеи.
 */

/** Приём, который взяли и выбросили. */
export interface Attempt {
  readonly what: string;
  /** Когда начали — миллисекунды, как везде. */
  readonly started: number;
  /** Когда выбросили. */
  readonly dropped: number;
  /** Что именно не сработало — не «не понравилось». */
  readonly why: string;
  /** Что делаем вместо него. */
  readonly instead: string;
}

/** Минимальная длина причины: «не зашло» — это не причина. */
export const MIN_WHY = 20;

/** Запись в журнале. */
export interface Entry {
  readonly what: string;
  /** Сколько продержалось — в днях, чтобы читалось. */
  readonly days: number;
  readonly why: string;
  readonly instead: string;
}

/** Пустые причины, которые ничего не объясняют. */
const EMPTY = /^(не\s*(зашло|понравилось|взлетело)|плохо|неудобно)\.?$/i;

/** Записать попытку. */
export function drop(attempt: Attempt): { ok: boolean; entry?: Entry; said: string } {
  const why = attempt.why.trim();
  const instead = attempt.instead.trim();

  if (why.length < MIN_WHY || EMPTY.test(why)) {
    return { ok: false, said: "причина пустая: «не зашло» через полгода не отличить от новой идеи" };
  }
  if (instead === "") {
    return { ok: false, said: "не сказано, что вместо — иначе попробуют снова" };
  }
  if (attempt.dropped < attempt.started) {
    return { ok: false, said: "выбросили раньше, чем начали: даты перепутаны" };
  }

  const days = Math.round((attempt.dropped - attempt.started) / 86_400_000);

  return {
    ok: true,
    entry: { what: attempt.what.trim(), days, why, instead },
    said: `«${attempt.what.trim()}» — ${days} ${plural(days, "день", "дня", "дней")}, причина записана`,
  };
}

/**
 * Журнал целиком.
 *
 * Он ищется **до** начала работы: это главная польза записи. Поэтому поиск — по
 * словам, а не по дате.
 */
export function find(entries: readonly Entry[], query: string): Entry[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return entries.filter((entry) => {
    const haystack = `${entry.what} ${entry.why} ${entry.instead}`.toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Ответ тому, кто предлагает взятое заново.
 *
 * Не запрет, а напоминание с фактом: когда пробовали, сколько продержалось и
 * почему не вышло. Может быть, сейчас причина исчезла — но тогда это надо
 * сказать явно.
 */
export function remind(entries: readonly Entry[], what: string): string | null {
  const same = find(entries, what).filter((entry) => {
    const a = entry.what.toLowerCase();
    const b = what.trim().toLowerCase();
    return a.includes(b) || b.includes(a);
  });
  if (same.length === 0) return null;

  const last = same[same.length - 1]!;
  return `уже пробовали «${last.what}»: продержалось ${last.days} ${plural(last.days, "день", "дня", "дней")}, причина — ${last.why}; вместо — ${last.instead}`;
}

/**
 * Итог ревью: сколько пробовали, сколько выбросили и в чём общая причина.
 *
 * Общая причина — не для красоты: если половина провалов из-за «нет настроек,
 * которые нужны людям», это уже не про приёмы.
 */
export function review(entries: readonly Entry[]): { said: string; common: string | null } {
  if (entries.length === 0) return { said: "провалов нет — или их не записывали", common: null };

  const dropped = entries.filter((entry) => entry.days <= 30);
  const common =
    dropped.length * 2 >= entries.length ? "большинство провалов — в первые 30 дней: приём не прижился" : null;

  return {
    said: `попыток ${entries.length}, из них брошены в первые 30 дней — ${dropped.length}`,
    common,
  };
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
