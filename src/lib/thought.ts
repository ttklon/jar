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
  if ("Split" in proposal) {
    // Разложение — это список поручений, а не выполненная работа. Так и говорим.
    return voice.thinkSplit(proposal.Split.goal, proposal.Split.deeds.length);
  }
  if ("Chain" in proposal) {
    // Цепочка может не собраться: у одного из шагов нет руки. Тогда говорим это, а не
    // «сейчас всё сделаю»: половина цепочки хуже отказа.
    if (thought.plan === null) {
      return voice.thinkChainBroken(proposal.Chain.goal);
    }
    return voice.thinkChain(proposal.Chain.goal, proposal.Chain.steps.length);
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
  if ("Hand" in proposal) {
    // Черновик — не умение: так и говорим, иначе человек решит, что уже умеем.
    return voice.thinkHandDraft(proposal.Hand.goal);
  }
  return voice.thinkRefuse(proposal.Refuse.reason);
}
