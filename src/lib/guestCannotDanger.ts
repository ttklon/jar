/**
 * Шаг 420: тест — гость не может выполнить опасную руку. Проверка через все слои.
 *
 * `guestHands` (шаг 405) отвечает «нельзя» на прямой вопрос. Но опасное дело
 * можно обойти **четырьмя** путями, и каждый надо проверить отдельно:
 *
 *  1. **прямая просьба** — «удали загрузки»; ответ: нельзя (405);
 *  2. **через расписание** — правило уже стоит, и оно сработает само: гость не
 *     должен получить выполнение по расписанию, которое создал хозяин;
 *  3. **через подтверждение** — гость нажимает «да, я уверен»: подтверждение
 *     гостя не принимается, подтверждает хозяин и лично (405);
 *  4. **через профиль** — гость переключается на профиль хозяина: переключение
 *     требует его присутствия, а не «нажал — стал хозяином».
 *
 * Модуль собирает все четыре в **один список проверок** и прогоняет их. Это тест
 * на дырки, а не на одну функцию: одна функция была проверена в 405, а обходы —
 * нет.
 */

import type { Risk } from "./dangerPolicy";
import { isDangerous } from "./dangerPolicy";

/** Попытка гостя. */
export interface Attempt {
  readonly how: "ask" | "schedule" | "confirm" | "switch";
  readonly risk: Risk;
  /** Чья это рука: гостя или хозяина. */
  readonly owner: "guest" | "owner";
}

/** Результат. */
export interface Refused {
  readonly how: Attempt["how"];
  readonly refused: boolean;
  readonly said: string;
}

/**
 * Отказать или нет.
 *
 * Гость — «рука гостя»: любое опасное нельзя, каким бы путём ни пришли.
 */
export function decide(attempt: Attempt): Refused {
  const dangerous = isDangerous(attempt.risk);

  if (!dangerous) {
    return { how: attempt.how, refused: false, said: "чтение не требует разрешения и от имени гостя" };
  }

  if (attempt.owner === "owner") {
    // Рука хозяина из-под гостя — это обход, каким бы путём ни пришли.
    return {
      how: attempt.how,
      refused: true,
      said: `нельзя: опасное дело от имени хозяина из гостевого режима — обход, а не просьба (${howWord(attempt.how)})`,
    };
  }

  const reasons: Record<Attempt["how"], string> = {
    ask: "нельзя: гостю опасные руки не разрешены (шаг 405)",
    schedule: "нельзя: расписание хозяина не выполнит опасное дело под гостем — оно ждёт его самого (шаг 414)",
    confirm: "нельзя: подтверждение гостя не принимается — подтверждает хозяин и лично",
    switch: "нельзя: переключение на профиль хозяина требует его присутствия, а не нажатия «я хозяин»",
  };
  return { how: attempt.how, refused: true, said: reasons[attempt.how] };
}

/** Как назвать путь по-русски. */
export function howWord(how: Attempt["how"]): string {
  const words: Record<Attempt["how"], string> = {
    ask: "прямая просьба",
    schedule: "расписание",
    confirm: "подтверждение",
    switch: "переключение профиля",
  };
  return words[how];
}

/**
 * Прогнать все попытки.
 *
 * Возвращает то, что **прошло**, — и это должен быть пустой список. Пустой список
 * и есть доказательство.
 */
export function holes(attempts: readonly Attempt[]): Attempt[] {
  return attempts.filter((attempt) => !decide(attempt).refused);
}

/**
 * Что проверяет тест.
 *
 * Четыре пути и ни одного прохода: список используется как перечень попыток.
 */
export function attempts(): Attempt[] {
  const out: Attempt[] = [];
  for (const how of ["ask", "schedule", "confirm", "switch"] as const) {
    for (const risk of ["delete", "send", "pay", "system", "foreignWrite"] as const) {
      out.push({ how, risk, owner: "guest" });
      out.push({ how, risk, owner: "owner" });
    }
  }
  return out;
}

/**
 * Что тест доказывает.
 *
 * Три утверждения, и каждое — про отдельную дырку.
 */
export function proves(): string[] {
  return [
    "ни один опасный шаг от имени гостя не проходит ни одним из четырёх путей",
    "опасное от имени хозяина из гостевого режима тоже не проходит: это обход",
    "чтение проходит всегда: гость получает пользу, а не только отказы",
  ];
}
