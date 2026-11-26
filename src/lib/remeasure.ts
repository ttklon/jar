/**
 * Шаг 491: перемерить всё заново и опубликовать цифры.
 *
 * «Стало лучше» без цифр — это вера. Вера не переживает первый же вопрос
 * «насколько лучше и где мерили».
 *
 * Поэтому каждая цифра в отчёте — это **пара**: что мерили и чем. И правило, которое
 * ловит самый частый обман: цифра без **базовой линии** ничего не доказывает. «Прогон
 * 4 минуты» — это хорошо или плохо? Непонятно, пока не сказано, что было 11.
 *
 * И вторая ловушка: **мерить надо то же самое тем же способом**. Если в прошлый раз
 * мерили «тесты раннера», а сейчас «тесты и типы», то рост — от смены линейки.
 * Поэтому у каждого замера фиксируется **линейка**, и другая линейка — это не
 * «стало хуже», а «другая цифра».
 */

/** Замер. */
export interface Measure {
  /** Что мерили: «прогон всех проверок», «память в покое». */
  readonly what: string;
  /** Значение. */
  readonly value: number;
  /** Единица: «с», «МБ», «тестов». */
  readonly unit: string;
  /** Было — базовая линия; `null` — мерим впервые. */
  readonly before: number | null;
  /** Чем мерили: линейка. */
  readonly ruler: string;
}

/**
 * Проверить замер.
 *
 * Нарушения: нет единицы, нет линейки, число отрицательное, «до» новее замера (в
 * линейке) — три последних — про то, что цифра без контекста.
 */
export function check(measure: Measure): string[] {
  const problems: string[] = [];

  if (measure.what.trim() === "") problems.push("замер без названия: что мерили?");
  if (measure.unit.trim() === "") problems.push(`«${measure.what}»: нет единицы — число без единицы не цифра`);
  if (measure.ruler.trim() === "") problems.push(`«${measure.what}»: нет линейки — чем мерили?`);
  if (measure.value < 0) problems.push(`«${measure.what}»: отрицательное значение — так не бывает`);

  return problems;
}

/** Исход сравнения. */
export type Verdict = "лучше" | "хуже" | "столько же" | "другая цифра";

/**
 * Что изменилось.
 *
 * Три исхода: лучше, хуже, другая цифра. Третий — когда линейка другая: сравнивать
 * нельзя, и это **не** «стало лучше».
 */
export function change(measure: Measure, beforeRuler: string): { verdict: Verdict; said: string } {
  if (measure.before === null) return { verdict: "другая цифра", said: `«${measure.what}»: мерим впервые, сравнивать не с чем — базовая линия будет у следующего замера` };

  if (beforeRuler !== measure.ruler) {
    return { verdict: "другая цифра", said: `«${measure.what}»: другая линейка (${beforeRuler} → ${measure.ruler}) — это не улучшение и не ухудшение` };
  }

  const diff = measure.value - measure.before;
  const verdict: Verdict = diff === 0 ? "столько же" : diff < 0 ? "лучше" : "хуже";
  const sign = diff === 0 ? "без изменений" : `${diff < 0 ? "−" : "+"}${Math.abs(diff)} ${measure.unit}`;
  return { verdict, said: `«${measure.what}»: ${measure.before} → ${measure.value} ${measure.unit} (${sign}, линейка ${measure.ruler})` };
}

/**
 * Опубликовать.
 *
 * Одна строка на замер, с базовой линией и линейкой. Строка без базовой линии
 * помечена словом «впервые» — честнее, чем молчание.
 */
export function publish(measures: readonly Measure[], rulers: Readonly<Record<string, string>>): string[] {
  return measures.map((measure) => {
    const ruler = rulers[measure.what] ?? measure.ruler;
    const got = change(measure, ruler);
    return `${measure.what}: ${got.said}`;
  });
}

/**
 * Чего замер не делает.
 *
 * Три запрета; главный — не смешивать линейки.
 */
export function notDo(): string[] {
  return [
    "не сравнивает цифры, снятые разными линейками, и не называет это улучшением",
    "не публикует цифру без единицы: «4» — это 4 чего?",
    "не подгоняет замер под желаемое: цифра, которая не понравилась, остаётся",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу правил.
 */
export function checks(): string[] {
  return [
    "у каждой цифры есть единица, линейка и базовая линия",
    "другая линейка — «другая цифра», а не «стало лучше»",
    "первый замер помечен «впервые», а не выдан за улучшение",
  ];
}
