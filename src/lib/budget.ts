/**
 * Бюджет на дело: время, шаги, память — и остановка по бюджету (шаг 109).
 *
 * Дефект. Дело из нескольких шагов может идти **вечно**, и в приложении нет
 * ничего, что его остановит:
 *
 *  * **время**: шаг «просканируй диск» занимает часы, а человек уже ушёл;
 *  * **шаги**: цикл из сценариев делает шаг за шагом, и «сколько их» знает только
 *    тот, кто писал конфиг;
 *  * **память**: вывод шага копится целиком (`stdout_tail`), и большой вывод
 *    съедает память, о которой никто не думал;
 *  * **остановка по бюджету неотличима от провала**: дело останавливается, и
 *    непонятно — сломалось или просто кончился бюджет.
 *
 * Правило: **у дела есть бюджет, и по нему — остановка с причиной**.
 *
 *  1. **Три вида бюджета**: время, число шагов, память. Ни одного «без предела»:
 *     предел, который не назван, — это предел, который наступит неожиданно.
 *  2. **Проверка перед каждым шагом**, а не внутри: шаг атомарен (шаг 104), и
 *     недоделанный шаг хуже неначатого.
 *  3. **Остановка по бюджету — не провал**: причина названа словом «бюджет», и
 *     человек знает, что нужно только поднять предел или подождать.
 *  4. **Бюджет виден числом**: «шаг 3 из 10, 12 секунд из 60», а не «работаю».
 *  5. **Мягкий и жёсткий**: мягкий — предупредить и спросить; жёсткий —
 *     остановиться. Один предел без второго даёт либо молчаливую остановку, либо
 *     бесконечное «ещё чуть-чуть».
 *
 * Почему не «остановить по таймауту инструмента». Таймаут инструмента — про один
 * шаг; бюджет дела — про **дело целиком**, и семь шагов по девять секунд при
 * таймауте в десять не замечаются ни одним инструментом.
 */

/** Бюджет: три предела, у каждого — число и единица в названии. */
export interface Budget {
  /** Сколько секунд на всё дело. */
  seconds: number;
  /** Сколько шагов всего. */
  steps: number;
  /** Сколько мегабайт вывода и памяти на всё дело. */
  megabytes: number;
}

/**
 * Бюджет по умолчанию.
 *
 * Числа **консервативные**: минута на дело, десять шагов, 64 МБ — это уже больше,
 * чем нужно типичному делу, и меньше, чем стоит ждать молча.
 */
export const DEFAULT: Budget = { seconds: 60, steps: 10, megabytes: 64 };

/** Ход дела: сколько уже потрачено. */
export interface Spent {
  seconds: number;
  steps: number;
  megabytes: number;
}

export function nothing(): Spent {
  return { seconds: 0, steps: 0, megabytes: 0 };
}

/** Вид бюджета, который кончился. */
export type Kind = "seconds" | "steps" | "megabytes";

/** Состояние бюджета перед очередным шагом. */
export interface State {
  /** Можно ли начинать шаг. */
  may: boolean;
  /** Что кончилось; `null` — ничего. */
  out: Kind | null;
  /** Доля потраченного — для предупреждения, а не для гадания. */
  used: number;
  /** Что сказать человеку. */
  said: string;
}

/**
 * Проверка перед шагом.
 *
 * `0` в бюджете — «предела нет», и это **названо**, а не подразумевается: без
 * такой оговорки `0` читался бы как «ни одного шага».
 */
export function check(budget: Budget, spent: Spent): State {
  const kinds: Kind[] = ["seconds", "steps", "megabytes"];
  for (const kind of kinds) {
    const limit = budget[kind];
    if (limit <= 0) continue;
    if (spent[kind] >= limit) {
      return {
        may: false,
        out: kind,
        used: 1,
        said: `${word(kind)} — бюджет кончился: ${spent[kind]} из ${limit}. Это не провал: дело остановлено по бюджету`,
      };
    }
  }
  // Предупреждение — когда потрачено 80%: успеть сказать до остановки.
  const shares = kinds
    .filter((kind) => budget[kind] > 0)
    .map((kind) => ({ kind, share: spent[kind] / budget[kind] }));
  const worst = shares.reduce<{ kind: Kind; share: number } | null>(
    (acc, item) => (acc === null || item.share > acc.share ? item : acc),
    null,
  );
  const used = worst?.share ?? 0;
  if (used >= 0.8 && worst !== null) {
    return {
      may: true,
      out: null,
      used,
      said: `${word(worst.kind)} почти кончился: ${Math.round(used * 100)}% бюджета`,
    };
  }
  return { may: true, out: null, used, said: "" };
}

/** Слово для вида бюджета — по-русски, а не кодом. */
export function word(kind: Kind): string {
  switch (kind) {
    case "seconds":
      return "время";
    case "steps":
      return "шаги";
    case "megabytes":
      return "память";
  }
}

/** Потратить один шаг. */
export function step(spent: Spent, seconds = 0, megabytes = 0): Spent {
  return {
    seconds: spent.seconds + seconds,
    steps: spent.steps + 1,
    megabytes: spent.megabytes + megabytes,
  };
}

/**
 * Хватит ли бюджета на то, чтобы начать.
 *
 * Не «сколько осталось»: если осталось меньше одного шага, лучше не начинать, чем
 * начать и остановиться на середине.
 */
export function enoughFor(budget: Budget, spent: Spent, need: Spent): boolean {
  if (budget.seconds > 0 && spent.seconds + need.seconds > budget.seconds) return false;
  if (budget.steps > 0 && spent.steps + need.steps > budget.steps) return false;
  if (budget.megabytes > 0 && spent.megabytes + need.megabytes > budget.megabytes) return false;
  return true;
}

/**
 * Мягкий предел — когда спросить человека.
 *
 * Один жёсткий предел без мягкого даёт молчаливую остановку; один мягкий —
 * бесконечное «ещё чуть-чуть» по согласию.
 */
export const SOFT = 0.8;

export function ask(budget: Budget, spent: Spent): boolean {
  return check(budget, spent).out === null && check(budget, spent).used >= SOFT;
}

/**
 * Итог дела по бюджету.
 *
 * Отдельная функция, потому что «остановлено по бюджету» и «провалено» — разные
 * факты, и сводить их в один значит врать в отчёте (шаг 106).
 */
export function outcome(state: State): "budget" | "ok" {
  return state.out === null ? "ok" : "budget";
}

/** Что предложить после остановки: поднять предел — и продолжить с того же шага. */
export function offer(budget: Budget, spent: Spent): string {
  const state = check(budget, spent);
  if (state.out === null) return "";
  const doubled = Math.max(budget[state.out] * 2, budget[state.out] + 1);
  return `${state.said}. Можно поднять ${word(state.out)} до ${doubled} и продолжить с того же шага`;
}
