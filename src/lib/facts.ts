/**
 * Память фактов: «папка для отчётов — D:\Отчёты», «мой браузер — Chrome».
 *
 * Зачем: пока помощник спрашивает одно и то же каждый раз, разговор начинается с нуля, а
 * человек, который говорит голосом, вынужден диктовать путь заново. Сказал один раз —
 * приложение помнит и подставляет.
 *
 * Правила, без которых память становится вредной:
 *  * ключ факта — это **вопрос**, а не значение: `вопрос:<имя параметра>`. Так ответ сам
 *    не превращается в ключ, иначе «D:\Отчёты» стал бы вопросом;
 *  * пустое не запоминается: пустота — это «спроси меня», а не «я так сказал»;
 *  * подставленное из памяти видно как подставленное: человек должен понимать, откуда
 *    значение, и уметь его переписать;
 *  * неудачный запуск не подтверждает ответ — запоминаем только то, что человек сказал,
 *    а не то, что сработало (иначе память врала бы «так правильно»).
 */

import type { Fact, PlanQuestion } from "../ipc";

/** Ключ факта по вопросу: имя параметра надёжнее подписи, подпись человек может переписать. */
export function factKey(question: Pick<PlanQuestion, "name" | "label">): string {
  const name = question.name.trim().toLowerCase().replace(/ё/g, "е");
  if (name.length > 0) return `вопрос:${name}`;

  const label = question.label.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
  return `вопрос:${label}`;
}

/** Что уже известно про вопросы этого плана: ответы и их происхождение. */
export interface Seeded {
  /** Значения для полей: ключ — `позиция:имя`, как в интерфейсе. */
  answers: Record<string, string>;
  /** Поля, которые заполнены из памяти, а не человеком сейчас. */
  remembered: string[];
}

/**
 * Подставить известное в пустые вопросы.
 *
 * Заполняется только то, что пусто: сказанное сейчас сильнее сказанного раньше.
 */
export function seedAnswers(
  questions: PlanQuestion[],
  facts: Fact[],
  current: Record<string, string>,
): Seeded {
  const known = new Map(facts.map((fact) => [fact.key, fact.value]));
  const answers: Record<string, string> = {};
  const remembered: string[] = [];

  for (const question of questions) {
    const field = `${question.position}:${question.name}`;
    const existing = (current[field] ?? "").trim();
    if (existing.length > 0) {
      answers[field] = current[field] ?? "";
      continue;
    }

    const value = known.get(factKey(question))?.trim() ?? "";
    if (value.length === 0) continue;

    answers[field] = value;
    remembered.push(field);
  }

  return { answers, remembered };
}

/** Что стоит запомнить из ответов: вопрос и сказанное. Пустые не попадают. */
export function factsToRemember(
  questions: PlanQuestion[],
  answers: Record<string, string>,
): { key: string; value: string }[] {
  return questions
    .map((question) => ({
      key: factKey(question),
      value: (answers[`${question.position}:${question.name}`] ?? "").trim(),
    }))
    .filter((fact) => fact.value.length > 0);
}
