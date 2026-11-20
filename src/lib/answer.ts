import type { PlanQuestion } from "../ipc";
import { isSpokenConsent } from "./consent";
import { isSpokenStop } from "./spoken";

/**
 * Пока план ждёт уточнение, следующая обычная фраза — ответ, не новая задача.
 *
 * «Стоп» бросает план. Отдельное «да» не закрывает вопрос и не становится
 * значением: разрешение и ответ — разные слова. Пустую фразу не подставляем.
 */
export function phraseIsAnswer(phrase: string): boolean {
  const word = phrase.trim();
  if (word.length === 0) return false;
  if (isSpokenStop(word)) return false;
  if (isSpokenConsent(word)) return false;
  return true;
}

export function questionField(question: Pick<PlanQuestion, "position" | "name">): string {
  return `${question.position}:${question.name}`;
}

/** Первый вопрос, на который человек ещё не ответил. Порядок плана не меняем. */
export function firstOpenQuestion<T extends Pick<PlanQuestion, "position" | "name">>(
  questions: T[],
  answers: Record<string, string>,
): T | null {
  return questions.find((question) => (answers[questionField(question)] ?? "").trim().length === 0) ?? null;
}
