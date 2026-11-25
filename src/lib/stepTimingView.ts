/**
 * Шаг 373: отчёт дела показывает, сколько времени занял каждый шаг — видно узкое место.
 *
 * «Дело заняло 40 секунд» — это не отчёт. Человек ждёт 40 секунд и хочет знать,
 * **на что** они ушли: на поиск, на модель, на руки. Без этого разбор
 * превращается в «работает медленно».
 *
 * Три правила:
 *
 *  1. **каждый шаг с числом** — и сумма совпадает с общим временем: иначе отчёт
 *     сам себе противоречит, и ему перестают верить;
 *  2. **узкое место названо словами** — «больше всего времени — у модели (28 с из
 *     40)», а не «см. гистограмму»;
 *  3. **неизвестное — «не мерили»**, а не ноль: шаг, время которого не писали, не
 *     должен выглядеть мгновенным.
 */

/** Шаг в отчёте с временем. */
export interface Step {
  readonly name: string;
  /** Длительность, мс; `null` — не мерили. */
  readonly ms: number | null;
}

/** Что показывает отчёт. */
export interface Report {
  /** Сумма известных шагов. */
  readonly known: number;
  /** Сколько шагов без времени. */
  readonly unknown: number;
  /** Общее время дела; `null` — не мерили. */
  readonly total: number | null;
  /** Сходится ли сумма с общим. */
  readonly reconciles: boolean;
}

/**
 * Свести время шагов.
 *
 * Не сходится — это **не повод молчать**: расхождение называется числом, чтобы
 * было видно, что часть времени потерялась.
 */
export function sum(steps: readonly Step[], total: number | null): Report {
  const known = steps.reduce((acc, step) => acc + (step.ms ?? 0), 0);
  const unknown = steps.filter((step) => step.ms === null).length;
  const reconciles = total !== null && unknown === 0 && Math.abs(known - total) <= 50;
  return { known, unknown, total, reconciles };
}

/** Строка шага: имя и время. */
export function line(step: Step): string {
  return step.ms === null ? `${step.name}: не мерили` : `${step.name}: ${time(step.ms)}`;
}

/** Время по-человечески: мс, с, мин. */
export function time(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} мс`;
  if (ms < 60_000) {
    const sec = ms / 1000;
    return `${sec % 1 === 0 ? sec : sec.toFixed(1)} с`;
  }
  const min = ms / 60_000;
  return `${min % 1 === 0 ? min : min.toFixed(1)} мин`;
}

/**
 * Узкое место.
 *
 * Называется словами; если все шаги примерно равны — так и говорим, а не
 * выдумываем «узкое место» из ничего.
 */
export function slowest(steps: readonly Step[]): string | null {
  const measured = steps.filter((step): step is Step & { ms: number } => step.ms !== null);
  if (measured.length === 0) return null;

  const worst = measured.reduce((acc, step) => (step.ms > acc.ms ? step : acc));
  const total = measured.reduce((acc, step) => acc + step.ms, 0);

  // Если шагов больше трёх и самый долгий меньше трети — узкого места нет.
  if (measured.length > 3 && worst.ms < total / 3) {
    return "время размазано по шагам: одно узкое место назвать нельзя";
  }
  return `больше всего времени — у «${worst.name}» (${time(worst.ms)} из ${time(total)})`;
}

/**
 * Что сказать, если сумма не сходится с общим временем.
 *
 * Не молчать и не «округлим»: расхождение — это время, которое никто не считал,
 * и именно оно чаще всего и есть причина жалобы «почему так долго».
 */
export function mismatch(report: Report): string | null {
  if (report.total === null) return null;
  if (report.unknown > 0) return `${report.unknown} ${report.unknown === 1 ? "шаг" : "шагов"} без времени: сумма не может сойтись с общим`;
  if (report.reconciles) return null;
  const lost = report.total - report.known;
  return `шаги вместе ${time(report.known)}, а дело ${time(report.total)}: ${time(Math.abs(lost))} не отнесено ни к одному шагу`;
}
