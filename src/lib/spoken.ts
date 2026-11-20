import { normalizeConsent } from "./consent";

/**
 * Слово «стоп» — целое высказывание, не кусок новой задачи.
 *
 * «Останови музыку» сюда не входит: это просьба, а не отмена.
 * «Стоп.» — входит. «Да» — не стоп и не отмена.
 */
const STOP_WORDS = ["стоп", "остановись", "останови", "хватит", "отмена", "отмени", "прекрати"] as const;

export function isSpokenStop(phrase: string): boolean {
  return (STOP_WORDS as readonly string[]).includes(normalizeConsent(phrase));
}
