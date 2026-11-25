/**
 * Шаг 339: история автоматизаций отдельно от ручных дел — для разбора.
 *
 * Смешанная история выглядит полной и бесполезна для вопроса, который задают на
 * самом деле: **«что моя программа делает сама, пока меня нет»**. В общем списке
 * это не видно: автоматические дела там вперемешку с руками.
 *
 * Три вещи, которые нужны для разбора:
 *
 *  1. **отдельный список** — только автоматические;
 *  2. **по правилу**, а не по времени: «уборка срабатывала 30 раз, из них 4 с
 *     ошибкой» полезнее, чем тридцать строк подряд;
 *  3. **что изменилось в мире** — не «успешно», а «удалено 12 файлов»: без этого
 *     разбор превращается в «работало/не работало».
 */

/** Запись автоматического дела. */
export interface Entry {
  /** Правило. */
  readonly rule: string;
  /** Когда — минута. */
  readonly at: number;
  readonly outcome: "done" | "skipped" | "failed";
  /** Что изменилось — для разбора. */
  readonly effect: string;
  /** Сколько заняло, мс. */
  readonly ms: number;
}

/** Сводка по правилу. */
export interface Summary {
  readonly rule: string;
  readonly runs: number;
  readonly done: number;
  readonly skipped: number;
  readonly failed: number;
  readonly ms: number;
  /** Общий эффект — чтобы не читать тридцать строк. */
  readonly lastEffect: string;
}

/**
 * Сводка по правилам.
 *
 * Порядок — по числу запусков: сначала то, что работает больше всего, а не то,
 * что было последним.
 */
export function summarize(entries: readonly Entry[]): Summary[] {
  const byRule = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = byRule.get(entry.rule) ?? [];
    list.push(entry);
    byRule.set(entry.rule, list);
  }

  return [...byRule.entries()]
    .map(([rule, list]) => ({
      rule,
      runs: list.length,
      done: list.filter((item) => item.outcome === "done").length,
      skipped: list.filter((item) => item.outcome === "skipped").length,
      failed: list.filter((item) => item.outcome === "failed").length,
      ms: list.reduce((sum, item) => sum + item.ms, 0),
      lastEffect: list[list.length - 1]?.effect ?? "",
    }))
    .sort((a, b) => b.runs - a.runs);
}

/** Строка сводки для человека. */
export function line(summary: Summary): string {
  // «успешно» без числа запусков ничего не говорит: 1 из 1 и 30 из 30 — разное.
  const parts = [`${summary.runs} ${plural(summary.runs, "запуск", "запуска", "запусков")}`];
  if (summary.done > 0) parts.push(`удачных ${summary.done}`);
  if (summary.skipped > 0) parts.push(`пропущено ${summary.skipped}`);
  if (summary.failed > 0) parts.push(`ошибок ${summary.failed}`);
  const time = summary.ms >= 1000 ? `${(summary.ms / 1000).toFixed(1)} с` : `${summary.ms} мс`;
  return `${summary.rule}: ${parts.join(", ")} (${time}); последний раз — ${summary.lastEffect}`;
}

/**
 * Что в автоматической истории есть, а в ручной нет.
 *
 * Список — ответ на вопрос «зачем отдельно», который задают первым.
 */
export function whySeparate(): string[] {
  return [
    "видно, что программа делает сама: в общем списке это вперемешку с руками",
    "пропуски видны отдельно, а не как успех (шаг 326)",
    "эффект по правилу, а не по времени: «удалено 120 файлов за месяц»",
  ];
}

/**
 * Что история автоматизаций не показывает.
 *
 * Ручные дела — намеренно: иначе список снова смешается и перестанет отвечать на
 * свой вопрос. Переход к ручным — отдельной кнопкой.
 */
export function notHere(): string {
  return "ручные дела сюда не попадают: для них есть общая история; смешивать — значит снова не видеть, что делает программа сама";
}

/**
 * Чего не хватает для разбора.
 *
 * Проверка ловит пустой эффект: без «что изменилось» история — счётчик, а не
 * разбор.
 */
export function gaps(entries: readonly Entry[]): string[] {
  const empty = entries.filter((entry) => entry.effect.trim() === "");
  if (empty.length === 0) return [];
  return [`у ${empty.length} записей нет эффекта: «успешно» без «что изменилось» для разбора бесполезно`];
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
