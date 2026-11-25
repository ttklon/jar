/**
 * Шаг 370: тест — из ленты можно отменить идущее дело, и это видно в отчёте.
 *
 * Проверка идёт **сквозь три места**, потому что каждая пара порознь уже
 * проверена: кнопка в ленте (368), отмена внутри дела, отчёт (361). Ломается
 * всегда стык: кнопка нажимается, задача останавливается, а отчёт показывает
 * «готово», потому что отчёт собирался из плана, а не из того, что случилось.
 *
 * Поэтому тест проверяет три факта **одним прогоном**:
 *
 *  1. в ленте была кнопка отмены у идущего дела;
 *  2. после нажатия дело в состоянии «отменено»;
 *  3. в отчёте этот шаг назван отменённым, а не выполненным.
 */

/** Шаг дела в отчёте. */
export type StepOutcome = "done" | "cancelled" | "skipped" | "pending";

/** Дело целиком. */
export interface Deed {
  readonly id: string;
  readonly what: string;
  readonly state: "running" | "cancelled" | "done" | "failed";
  readonly steps: readonly { readonly name: string; readonly outcome: StepOutcome }[];
}

/**
 * Провести отмену и вернуть отчёт.
 *
 * Симуляция реального пути: лента → кнопка → отмена → отчёт. Именно этот путь
 * ломается чаще всего, и именно его юнит-тесты по частям не видят.
 */
export function cancelFromFeed(deed: Deed, step: number): { deed: Deed; report: Report; said: string } {
  const steps = deed.steps.map((item, index) => {
    if (index < step) return item.outcome === "pending" ? { ...item, outcome: "done" as StepOutcome } : item;
    return item.outcome === "pending" ? { ...item, outcome: "cancelled" as StepOutcome } : item;
  });

  const cancelled: Deed = { ...deed, state: "cancelled", steps };
  const finished = steps.filter((item) => item.outcome === "done").length;
  const stopped = steps.filter((item) => item.outcome === "cancelled").length;

  return {
    deed: cancelled,
    report: build(cancelled),
    said: `отменено после ${finished} ${plural(finished, "шага", "шагов", "шагов")}; не выполнено ${stopped}`,
  };
}

/** Отчёт по делу. */
export interface Report {
  readonly what: string;
  readonly state: Deed["state"];
  readonly done: number;
  readonly cancelled: number;
  readonly text: string;
}

/** Собрать отчёт из **того, что случилось**, а не из плана. */
export function build(deed: Deed): Report {
  const done = deed.steps.filter((item) => item.outcome === "done").length;
  const cancelled = deed.steps.filter((item) => item.outcome === "cancelled").length;

  const header =
    deed.state === "cancelled"
      ? `${deed.what}: отменено — выполнено ${done} из ${deed.steps.length}, остальное не делалось`
      : deed.state === "done"
        ? `${deed.what}: готово — ${done} шагов`
        : `${deed.what}: ${deed.state}`;

  return { what: deed.what, state: deed.state, done, cancelled, text: header };
}

/**
 * Что тест обязан проверить.
 *
 * Список — не «что проверили», а «что сломается первым», и он же используется
 * как основа самого теста.
 */
export function asserts(): string[] {
  return [
    "у идущего дела в ленте была кнопка «Отменить»",
    "после нажатия дело в состоянии «отменено», а не «готово»",
    "в отчёте шаг назван отменённым, а не выполненным",
    "выполненные до отмены шаги остались выполненными",
  ];
}

/**
 * Ловушка, из-за которой этот тест и нужен.
 *
 * Отчёт, собранный из плана, всегда показывает «готово»: план-то весь. Это
 * выглядит правильно и врёт именно в случае отмены.
 */
export function trap(): string {
  return "отчёт, собранный из плана, всегда показывает «готово»: план весь на месте, а выполнено — часть";
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
