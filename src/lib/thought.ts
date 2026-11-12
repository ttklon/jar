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
    // План может не собраться: рука только описана. Тогда говорим это, а не «сейчас сделаю».
    if (thought.plan === null) {
      return voice.thinkCallOnlyDescription(proposal.Call.registry);
    }
    return voice.thinkCall(proposal.Call.registry, proposal.Call.why);
  }
  if ("Learn" in proposal) {
    // Просьба записана — так и говорим. Не записалась — не обещаем урок.
    if (thought.learning) {
      return voice.thinkLearnRecorded(proposal.Learn.goal, thought.learning.example);
    }
    return voice.thinkLearnUnsure(proposal.Learn.goal);
  }
  if ("Ask" in proposal) {
    return voice.thinkAsk(proposal.Ask.question);
  }
  return voice.thinkRefuse(proposal.Refuse.reason);
}
