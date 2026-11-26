/**
 * Шаг 438: никаких записей с содержимым секретов — тест на запись.
 *
 * Шаг 430 проверял функции вычистки. Здесь — **проверка самой записи**: берём
 * хранилище и пишем в него через все пути, какими приложение пишет, а потом
 * читаем **всё, что легло**, и ищем значение секрета.
 *
 * Разница принципиальная: функция может вычищать правильно, но её могут **не
 * позвать** в одном месте. Поэтому проверка идёт по записанному, а не по коду.
 *
 * Три пути записи, и каждый был дырой в чужом коде:
 *
 *  * **журнал дел** — пишется на каждое дело;
 *  * **память** (факты) — пишется по просьбе «запомни»;
 *  * **отчёт об ошибке** — пишется, когда что-то сломалось, и туда часто кладут
 *    исходный текст фразы «чтобы было понятно».
 */

import { clean } from "./secrets";

/** Хранилище записанного — в памяти, как для теста. */
export interface Store {
  readonly rows: string[];
}

/** Куда пишем. */
export type Sink = "journal" | "memory" | "error";

/** Записать фразу. */
export function write(store: Store, sink: Sink, phrase: string): Store {
  const got = clean(phrase);
  // Место помечено: человек должен видеть, что фрагмент вычищен.
  const text = got.text;
  return { rows: [...store.rows, `${sink}: ${text}`] };
}

/**
 * Найти секрет в записанном.
 *
 * Возвращает **строки**, где значение нашлось: «нашлось в журнале» полезнее, чем
 * «есть утечка».
 */
export function findSecret(store: Store, secret: string): string[] {
  return store.rows.filter((row) => row.includes(secret));
}

/**
 * Прогнать все пути.
 *
 * Возвращает store — и тест проверяет его целиком, а не ответ функции.
 */
export function writeAll(phrases: readonly string[]): Store {
  let store: Store = { rows: [] };
  for (const phrase of phrases) {
    for (const sink of ["journal", "memory", "error"] as Sink[]) store = write(store, sink, phrase);
  }
  return store;
}

/**
 * Фразы — с настоящими секретами.
 *
 * В том числе найденный на шаге 423 «пароль от почты»: он не вычищался, и тест
 * на запись должен ловить именно такие.
 */
export function samples(): { phrase: string; secret: string }[] {
  return [
    { phrase: "сохрани пароль: hunter2", secret: "hunter2" },
    { phrase: "пароль от почты: qwerty123", secret: "qwerty123" },
    { phrase: "запомни: мой токен ghp_abcdefghijklmnopqrstuvwxyz12", secret: "ghp_abcdefghijklmnopqrstuvwxyz12" },
    { phrase: "не смог открыть: ключ sk-abcdefghijklmnop1234", secret: "sk-abcdefghijklmnop1234" },
  ];
}

/**
 * Что проверка доказывает.
 *
 * Три утверждения — по одному на путь записи.
 */
export function proves(): string[] {
  return [
    "в журнале дел нет ни одного значения секрета — при любом пути записи",
    "в памяти тоже: «запомни токен» не запоминает токен",
    "в отчёте об ошибке тоже: исходный текст не подставляется без вычистки",
  ];
}
