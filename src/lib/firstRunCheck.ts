/**
 * Второй запуск проверяет, что путь первого запуска остался пройденным.
 *
 * Шаг 27. Зачем отдельно от `selfCheck`. Та проверка говорит о **поведении
 * приложения** (подтверждение, «стоп», отказ от разрушительного) и намеренно не
 * трогает ни сеть, ни модель, ни голос — поэтому её можно гонять когда угодно.
 * Здесь наоборот: проверяется ровно то, что первый запуск **наладил**, — потому
 * что «вроде в прошлый раз работало» это и есть та фраза, после которой человек
 * перестаёт верить приложению.
 *
 * Три решения:
 *
 *  * **проверяется след, а не память экрана.** Знакомство прошло — значит, в
 *    хранилище есть отметка; объяснение микрофона прошло — своя отметка. Если
 *    отметки нет, второй запуск покажет знакомство снова (это видно), но молча
 *    решать «наверное, всё хорошо» нельзя;
 *  * **«не проверено» — не «провалено»** и не «пройдено». Третье состояние
 *    обязательно: чужой профиль, браузер без хранилища и новая установка дают
 *    именно его, и выдавать это за успех — врать;
 *  * **проверка называет, что делать.** Провал без действия — ещё один отказ
 *    текстом (шаг 25).
 */

import { ASKED_KEY, NAME_KEY } from "./person";
import { MIC_EXPLAINED_KEY, WELCOME_KEY, availableStorage, type StorageLike } from "./firstRun";

/** Что проверяем. Список закрыт: это про первый запуск, а не про всё приложение. */
export type FirstRunStep = "welcome" | "mic" | "name";

export type StepState = "done" | "not-done" | "unknown";

export interface StepVerdict {
  step: FirstRunStep;
  state: StepState;
  /** Что это значит и что делать. Пусто для `done`: хвалить нечего. */
  advice: string;
}

/**
 * Проверить, что путь первого запуска остался пройденным.
 *
 * `name` — не «пройден ли вопрос», а «спрашивали ли»: отказ тоже законный итог
 * (шаг 38), и записывать отказ в провал значило бы наказывать за выбор.
 */
export function checkFirstRun(storage: StorageLike | null = availableStorage()): StepVerdict[] {
  const get = (key: string): string | null => {
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  const verdict = (step: FirstRunStep, key: string, advice: string): StepVerdict => {
    const value = get(key);
    if (value === null) {
      // Хранилища нет или ключ не читается — это не «не сделано» и не «сделано».
      return { step, state: storage === null ? "unknown" : "not-done", advice };
    }
    return { step, state: "done", advice: "" };
  };

  return [
    verdict(
      "welcome",
      WELCOME_KEY,
      "Знакомство не отмечено: при следующем запуске оно покажется снова. Если так и надо — ничего делать не нужно.",
    ),
    verdict(
      "mic",
      MIC_EXPLAINED_KEY,
      "Про микрофон ещё не объясняли: первое нажатие покажет объяснение вместо записи. Это не поломка, но и не «всё настроено».",
    ),
    // Имя: смотрим на «спрашивали», а не на «назвался» (шаг 38).
    verdict(
      "name",
      ASKED_KEY,
      "Имя не спрашивали: знакомство не проходило до конца, поэтому вопрос вернётся.",
    ),
  ];
}

/** Сколько шагов первого запуска осталось непройденными. Для строки состояния. */
export function pendingSteps(verdicts: StepVerdict[]): FirstRunStep[] {
  return verdicts.filter((item) => item.state !== "done").map((item) => item.step);
}

/**
 * Одна строка про весь первый запуск.
 *
 * Нужна, чтобы «вроде всё хорошо» заменить на число: пройдено столько-то из
 * стольких, и вот чего не хватает. Пустая строка — значит всё пройдено.
 */
export function summarizeFirstRun(verdicts: StepVerdict[]): { done: number; total: number; missing: StepVerdict[] } {
  const missing = verdicts.filter((item) => item.state !== "done");
  return { done: verdicts.length - missing.length, total: verdicts.length, missing };
}

/** Есть ли имя. Отдельно нужно экрану, чтобы обращаться по-человечески. */
export function named(storage: StorageLike | null = availableStorage()): boolean {
  if (!storage) return false;
  try {
    const value = storage.getItem(NAME_KEY);
    return value !== null && value !== "";
  } catch {
    return false;
  }
}
