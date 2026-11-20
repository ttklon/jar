import { normalizeConsent } from "./consent";

/**
 * Короткое продолжение уже сказанной фразы.
 *
 * «Ещё» само по себе — не новая задача и не разрешение. Без прошлой фразы
 * продолжать нечего: слово остаётся как есть, прошлую задачу не выдумываем.
 * «Повтори» снова отдаёт ту же фразу политике. «Ещё» и «дальше» несут прошлое
 * рядом, чтобы план не стал слепым повтором.
 */
const REPEAT = new Set(["повтори", "повтори это", "то же", "то же самое", "снова", "еще раз"]);
const CONTINUE = new Set(["еще", "продолжай", "дальше"]);

export function isFollowUp(phrase: string): boolean {
  const word = normalizeConsent(phrase);
  return REPEAT.has(word) || CONTINUE.has(word);
}

export function followUpQuery(previous: string | null, phrase: string): string {
  const word = normalizeConsent(phrase);
  const prior = previous?.trim() ?? "";
  if (prior.length === 0 || !isFollowUp(phrase)) return phrase.trim();
  if (REPEAT.has(word)) return prior;
  return `${prior}. ${phrase.trim()}`;
}
