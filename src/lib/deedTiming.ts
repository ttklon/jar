/**
 * Замер каждого дела — и хранение рядом с отчётом (шаг 135).
 *
 * Дефект. Замер был **у ответа**, но не у каждого дела:
 *
 *  * **в отчёте шага нет времени**: «шаг 2 не выполнен» — и неизвестно, он упал сразу
 *    или висел 20 секунд; чинить нечего, потому что не видно, где время;
 *  * **замер теряется с закрытием окна**: «в прошлый раз было быстро» не проверить —
 *    отчёт есть, чисел при нём нет;
 *  * **сумма не сходится с целым**: отчёт говорит 6 секунд, а сумма шагов — 2;
 *    остальное потерялось, и это выглядит как ошибка замера, а не как «ждали очередь»;
 *  * **медленный шаг не отличается от быстрого**: в отчёте все строки равны, и жалоба
 *    «долго» не привязана к месту.
 *
 * Правило: **у каждого дела в отчёте есть замер, и он хранится вместе с отчётом**.
 *
 *  1. **Замер — поле строки отчёта**, а не отдельная таблица (как в 122): его видно
 *     там, где видно дело.
 *  2. **Сумма сходится с целым или расхождение названо**: «шаги 2,4 с из 6 с; 3,6 с —
 *     ожидание» лучше, чем молчаливое расхождение.
 *  3. **Замер переживает закрытие окна**: отчёт хранится с числами, иначе «стало
 *     быстрее» не проверить.
 *  4. **Незамеренное — «не замерено»**, а не 0: ноль выглядит как мгновенно.
 *  5. **Самое медленное дело названо** — и это ответ на «что чинить».
 *
 * Почему не «одно число на отчёт». Одно число не говорит, **что** медленно: чинить
 * приходится по строке, а не по сумме.
 */

/** Строка отчёта с замером. */
export interface Row {
  /** Номер шага. */
  position: number;
  /** Что делали. */
  what: string;
  /** Сколько шло, мс. `null` — не замеряли. */
  ms: number | null;
}

/** Отчёт: строки и целое. */
export interface Report {
  /** Сколько шло всё дело, мс. */
  totalMs: number;
  rows: Row[];
}

/**
 * Замер строки — рядом с делом.
 *
 * Не «0 мс» для незамеренного и не «~2 с»: число или «не замерено».
 */
export function line(row: Row): string {
  if (row.ms === null) return `${row.position}. ${row.what} · не замерено`;
  return `${row.position}. ${row.what} · ${Math.round(row.ms)} мс`;
}

/** Сумма шагов. */
export function sum(rows: readonly Row[]): { ms: number; unknown: number } {
  let ms = 0;
  let unknown = 0;
  for (const row of rows) {
    if (row.ms === null) unknown += 1;
    else ms += row.ms;
  }
  return { ms, unknown };
}

/**
 * Сходится ли сумма с целым.
 *
 * Допуск — 5% или 50 мс (как в 121): расхождение меньше этого — это округление, а не
 * потерянное время.
 */
export function reconciles(report: Report): {
  ok: boolean;
  gap: number;
  unknown: number;
  said: string;
} {
  const { ms, unknown } = sum(report.rows);
  const gap = report.totalMs - ms;
  const tolerance = Math.max(50, report.totalMs * 0.05);
  if (unknown > 0) {
    // Незамеренные шаги — не ноль: сумма заведомо меньше целого, и это названо.
    return {
      ok: false,
      gap,
      unknown,
      said: `шагов без замера: ${unknown} — сумма ${ms} мс из ${report.totalMs} не сходится`,
    };
  }
  if (Math.abs(gap) <= tolerance) {
    return { ok: true, gap, unknown, said: `шаги ${ms} мс — сходится с целым ${report.totalMs} мс` };
  }
  // Расхождение названо, а не спрятано: «где остальное» — это вопрос, на который
  // отчёт обязан отвечать.
  return {
    ok: false,
    gap,
    unknown,
    said:
      gap > 0
        ? `шаги ${ms} мс из ${report.totalMs}: ${Math.round(gap)} мс ушло не на шаги (ожидание, очередь)`
        : `шаги ${ms} мс больше целого ${report.totalMs} на ${Math.round(-gap)} мс — замер неверен`,
  };
}

/** Самое медленное дело — ответ на «что чинить». */
export function slowest(report: Report): { row: Row | null; said: string } {
  const measured = report.rows.filter((row) => row.ms !== null);
  if (measured.length === 0) return { row: null, said: "замеров нет — назвать нечего" };
  const worst = measured.reduce((acc, row) => ((row.ms ?? 0) > (acc.ms ?? 0) ? row : acc), measured[0]!);
  const share = report.totalMs === 0 ? 0 : Math.round(((worst.ms ?? 0) / report.totalMs) * 100);
  return {
    row: worst,
    said: `медленнее всего: «${worst.what}» — ${Math.round(worst.ms ?? 0)} мс (${share}% всего)`,
  };
}

/**
 * Что сохранить — рядом с отчётом, а не отдельно.
 *
 * Отчёт без чисел нельзя сравнить: «в прошлый раз было быстро» — это не аргумент.
 */
export function stored(report: Report): { totalMs: number; rows: Row[] } {
  return { totalMs: report.totalMs, rows: report.rows.map((row) => ({ ...row })) };
}

/** Отчёт из хранилища — с числами, или честно без них. */
export function restored(saved: { totalMs?: number; rows?: Row[] } | null): Report {
  return { totalMs: saved?.totalMs ?? 0, rows: saved?.rows ?? [] };
}

/**
 * Сравнение с прошлым разом — числом.
 *
 * «Стало быстрее» без числа — мнение; с числом — факт, который можно проверить.
 */
export function compared(now: Report, before: Report | null): string {
  if (before === null || before.totalMs === 0) return "прошлого замера нет — сравнивать не с чем";
  const diff = now.totalMs - before.totalMs;
  if (diff === 0) return `столько же: ${now.totalMs} мс`;
  return diff < 0
    ? `быстрее на ${Math.round(-diff)} мс: ${now.totalMs} против ${before.totalMs}`
    : `медленнее на ${Math.round(diff)} мс: ${now.totalMs} против ${before.totalMs}`;
}

/** Медленные строки — списком, по убыванию: «что медленно» одним взглядом. */
export function slow(rows: readonly Row[], overMs: number): Row[] {
  return rows
    .filter((row) => row.ms !== null && (row.ms ?? 0) > overMs)
    .sort((left, right) => (right.ms ?? 0) - (left.ms ?? 0));
}
