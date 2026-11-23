/**
 * Один честный экран «Состояние» (шаг 1).
 *
 * Дефект, который это лечит: правда о «можно/нельзя» размазана по десяти
 * экранам. На «Моделях» видно, скачан ли движок; на «Руках» — что разрешено; на
 * «Настройках» — автозапуск; в истории — что упало. Чтобы узнать **одним
 * взглядом**, что вообще работает, человек должен помнить, где что лежит, и
 * свести это в голове. Он этого не делает — он верит первому экрану.
 *
 * Главное правило здесь не «показать статус», а **не соврать**. Поэтому у
 * каждого пункта три вещи, а не одна:
 *
 *  * **что** — короткое имя понятием человека, не кодом;
 *  * **состояние** — из словаря, где слова с разным весом не смешиваются:
 *    «не установлено» (ещё нет), «не проверено» (есть, но не подтверждено),
 *    «проверено на этой машине» (сделано и получилось **здесь**), «провал»
 *    (пробовали и не вышло). Слово «готово» запрещено: оно уже один раз
 *    вводило в заблуждение, потому что не говорило, где проверено;
 *  * **чем подтверждено** — тест, прогон, файл, или честное «ничем». Пункт без
 *    подтверждения показывается как «не проверено», а не прячется: спрятанный
 *    пункт выглядит как отсутствующий, а «не проверено» — как работа, которую
 *    ещё надо сделать.
 *
 * Сводка считается **из пунктов**, а не пишется руками: иначе через месяц она
 * разойдётся с ними, и экран начнёт говорить две вещи сразу.
 */

/**
 * Состояние пункта. Четыре слова, а не два: «работает / не работает» склеивает
 * «ещё не ставили» и «поставили, но не проверяли», а это разные новости.
 */
export type Condition = "not-installed" | "not-checked" | "proven-here" | "failed";

/** Что подтверждает состояние. `null` — ничем: так и говорим. */
export type Evidence = string | null;

export interface StateItem {
  /** Идентификатор для ключей и тестов, не для человека. */
  id: string;
  /** Что это, понятием человека: «Движок», «Модель», «Распознавание речи». */
  title: string;
  /** Одна строка «что это значит» — чтобы имя не оставалось загадкой. */
  hint: string;
  condition: Condition;
  evidence: Evidence;
  /** Куда идти, чтобы это изменить. Экран из ленты, не выдуманный адрес. */
  screen: string;
}

/** Слова, которыми состояние называется человеку. Одно место, не десять. */
export const CONDITION_LABEL: Record<Condition, string> = {
  "not-installed": "не установлено",
  "not-checked": "не проверено",
  "proven-here": "проверено на этой машине",
  failed: "провал",
};

/**
 * Что состояние значит словами — без «готово».
 *
 * «Проверено на этой машине» — длинно и нарочно: оно отвечает на вопрос «где»,
 * которого слово «готово» не задаёт. А `proven-here` без подтверждения — это
 * не проверено, и `normalize` это исправляет (см. ниже).
 */
export const CONDITION_HINT: Record<Condition, string> = {
  "not-installed": "этого ещё нет на этой машине",
  "not-checked": "есть, но здесь не проверяли",
  "proven-here": "сделано и получилось здесь, на этой машине",
  failed: "пробовали здесь и не получилось",
};

/**
 * Пункт, который называется «проверено», но подтвердить это нечем.
 *
 * Зачем. `proven-here` без ссылки на доказательство — это вера, а не проверка, и
 * ровно она уже один раз вводила в заблуждение. Такое состояние понижается до
 * «не проверено»: не наказываем автора, а не даём экрану соврать.
 */
export function normalize(item: StateItem): StateItem {
  if (item.condition === "proven-here" && (item.evidence === null || item.evidence.trim() === "")) {
    return { ...item, condition: "not-checked" };
  }
  return item;
}

/** Сколько чего. Считается из пунктов — вторая правда не заводится. */
export interface Summary {
  total: number;
  proven: number;
  notChecked: number;
  notInstalled: number;
  failed: number;
}

export function summarize(items: readonly StateItem[]): Summary {
  const list = items.map(normalize);
  return {
    total: list.length,
    proven: list.filter((item) => item.condition === "proven-here").length,
    notChecked: list.filter((item) => item.condition === "not-checked").length,
    notInstalled: list.filter((item) => item.condition === "not-installed").length,
    failed: list.filter((item) => item.condition === "failed").length,
  };
}

/**
 * Одна строка для верха экрана — честная.
 *
 * Не «всё работает» и не «есть проблемы»: первое врёт при непроверенном, второе
 * пугает, когда всё в порядке. Строка называет **числа**, и из неё видно, чего
 * мы не знаем: «3 проверено · 2 не проверено · 1 провал».
 */
export function headline(summary: Summary): string {
  const parts: string[] = [];
  if (summary.proven > 0) parts.push(`${summary.proven} проверено`);
  if (summary.notChecked > 0) parts.push(`${summary.notChecked} не проверено`);
  if (summary.notInstalled > 0) parts.push(`${summary.notInstalled} не установлено`);
  if (summary.failed > 0) parts.push(`${summary.failed} ${plural(summary.failed, "провал", "провала", "провалов")}`);
  if (parts.length === 0) return "проверять нечего";
  return parts.join(" · ");
}

/** Русское склонение по числу: 1 провал, 2 провала, 5 провалов. */
function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Что человеку делать первым.
 *
 * Порядок — не «как в списке», а по цене бездействия: провал (что-то пробовали и
 * сломалось) важнее непроверенного, непроверенное важнее неустановленного —
 * потому что установка без проверки даёт ложную уверенность. Возвращается
 * `null`, когда делать нечего: это нормальное состояние, и оно должно
 * выглядеть нормой, а не пустотой.
 */
export function nextStep(items: readonly StateItem[]): StateItem | null {
  const list = items.map(normalize);
  return (
    list.find((item) => item.condition === "failed") ??
    list.find((item) => item.condition === "not-checked") ??
    list.find((item) => item.condition === "not-installed") ??
    null
  );
}

/**
 * Пункты без подтверждения — отдельно, списком.
 *
 * Не чтобы наказать, а чтобы **не прятать**: экран состояния, который показывает
 * только зелёное, — это не состояние, а витрина.
 */
export function unproven(items: readonly StateItem[]): StateItem[] {
  return items.map(normalize).filter((item) => item.condition !== "proven-here" && item.condition !== "not-installed");
}
