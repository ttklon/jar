/**
 * Слова о том, что предложила модель.
 *
 * Модель отвечает одним из четырёх видов, и каждый означает **разное действие человека**:
 * взять готовую руку, научиться, ответить на вопрос или услышать отказ. Свалить это в одно
 * «модель ответила» значит заставить человека гадать, что теперь делать.
 *
 * Ничего не выполняется здесь: это фраза, а не приказ.
 */

import type { Thought } from "../ipc";
import { voice } from "../i18n/ru";

/** Что сказать вслух и показать на экране про ответ модели. */
export function describeThought(thought: Thought): string {
  if (!thought.proposal) {
    return voice.thinkBroken(thought.problem ?? "");
  }

  const proposal = thought.proposal;
  if ("Call" in proposal) {
    return voice.thinkCall(proposal.Call.registry, proposal.Call.why);
  }
  if ("Learn" in proposal) {
    return voice.thinkLearn(proposal.Learn.goal);
  }
  if ("Ask" in proposal) {
    return voice.thinkAsk(proposal.Ask.question);
  }
  return voice.thinkRefuse(proposal.Refuse.reason);
}
