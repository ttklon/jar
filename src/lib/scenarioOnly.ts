/**
 * Шаг 298: не гнаться за фичами, которых нет в сценарии пользователя.
 *
 * В шаге 296 каждая идея сверяется с болью. Здесь — тот же вопрос, но о **новых**
 * предложениях, ещё до работы: «удобно ли это человеку из сценария» или «просто
 * у конкурента есть».
 *
 * Функция, которой нет в сценарии, не нейтральна: она занимает место в меню,
 * требует перевод, обновляется вместе с чужим API и ломается. Поэтому вопрос не
 * «плохо ли это», а **«кто именно это попросил»**.
 *
 * Три ответа, и все допустимы:
 *
 *  1. **просили** — есть люди, назвавшие боль; функция в работе;
 *  2. **нет в сценарии** — откладываем, но записываем: через квартал проверят;
 *  3. **чужое** — есть у конкурента, а у нас сценарий другой: отказ с причиной.
 *
 * Третий ответ — самый нужный и самый неприятный: он означает «мы не будем это
 * делать», и его надо говорить вслух, а не в комментарии к задаче.
 */

/** Предложение новой функции. */
export interface Proposal {
  /** Как её назовут в задаче. */
  readonly what: string;
  /** Сколько человек назвали боль, которую она закрывает. */
  readonly asked: number;
  /** Есть ли пункт сценария, в который она попадает. */
  readonly inScenario: boolean;
  /** У кого из конкурентов она есть. */
  readonly seenAt?: string;
}

/** Что делаем. */
export type Verdict = "take" | "later" | "refuse";

/** Решение с причиной. */
export interface Decision {
  readonly verdict: Verdict;
  readonly said: string;
}

/**
 * Решить судьбу предложения.
 *
 * Порог «просили» — три человека: один всегда просит всё, двое — уже повод.
 * Порог задан числом, чтобы его нельзя было сдвинуть в разговоре.
 */
export const ENOUGH = 3;

export function decide(proposal: Proposal): Decision {
  const seen = proposal.seenAt ? ` (есть у ${proposal.seenAt})` : "";

  if (proposal.asked >= ENOUGH && proposal.inScenario) {
    return { verdict: "take", said: `берём: просили ${proposal.asked} человека, есть в сценарии` };
  }
  if (!proposal.inScenario) {
    return {
      verdict: proposal.seenAt ? "refuse" : "later",
      said: proposal.seenAt
        ? `не делаем:${seen}, но в нашем сценарии этого нет — это чужая функция, а не наша недоделка`
        : `откладываем: в сценарии нет; если попросят ${ENOUGH} раза — вернёмся`,
    };
  }
  return {
    verdict: "later",
    said: `просили ${proposal.asked} — меньше ${ENOUGH}; откладываем и записываем, чтобы видеть, растёт ли`,
  };
}

/**
 * Итог по пачке предложений.
 *
 * Отказы называются поимённо: «отказались от двух» человеку ничего не говорит.
 */
export function summarize(proposals: readonly Proposal[]): { said: string; refused: string[] } {
  const decided = proposals.map((proposal) => ({ proposal, decision: decide(proposal) }));
  const take = decided.filter((row) => row.decision.verdict === "take").length;
  const later = decided.filter((row) => row.decision.verdict === "later").length;
  const refused = decided.filter((row) => row.decision.verdict === "refuse").map((row) => row.proposal.what);

  return {
    said: `берём ${take}, откладываем ${later}, отказываемся ${refused.length}; отказ — не долг, а решение`,
    refused,
  };
}

/**
 * Что сказать тому, кто просит чужую функцию.
 *
 * Не «нам это не нужно», а что у нас есть вместо — иначе отказ звучит как
 * отговорка.
 */
export function answer(proposal: Proposal, instead: string): string {
  if (decide(proposal).verdict !== "refuse") {
    return `это в работе или в очереди: ${decide(proposal).said}`;
  }
  return `этого не будет: у ${proposal.seenAt ?? "конкурента"} другой сценарий; у нас вместо этого — ${instead}`;
}
