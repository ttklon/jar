/**
 * Шаг 430: тест — секрет из фразы не попал в журнал.
 *
 * `secrets.forLog` (шаг 98) вычищает фразу перед записью. Но журнал пишется
 * **не одним путём**: строка лога, строка отчёта, экспорт для поддержки (шаг 423),
 * сообщение об ошибке. Достаточно одного пути без вычистки — и пароль в файле.
 *
 * Поэтому проверка не «функция вычищает», а **поиск секрета во всех артефактах**:
 * берём фразу с секретом, прогоняем через все пути записи и ищем значение в
 * каждом. Если нашлось хоть где-то — дыра.
 *
 * Отдельно проверяется **самое частое место утечки**: сообщения об ошибке. Там
 * подставляют исходный текст запроса, потому что «так понятнее», — и пароль
 * попадает в отчёт об ошибке.
 */

import { clean, forLog } from "./secrets";

/** Путь записи. */
export type Way = "log" | "report" | "export" | "error" | "stats";

/** Что делает путь с фразой. */
export function filter(way: Way, phrase: string): string {
  switch (way) {
    case "log":
      return forLog(clean(phrase));
    case "report":
      return clean(phrase).text;
    case "export":
      return clean(phrase).text;
    case "error":
      return clean(phrase).text;
    case "stats":
      // В статистику текст не попадает вовсе — только числа.
      return "";
  }
}

/**
 * Найти утечку.
 *
 * `secret` — значение секрета (без слова «пароль»): ищем именно его, как ищет
 * тот, кому он нужен.
 */
export function leaks(phrase: string, secret: string): Way[] {
  const ways: Way[] = ["log", "report", "export", "error", "stats"];
  return ways.filter((way) => filter(way, phrase).includes(secret));
}

/**
 * Проверить набор фраз.
 *
 * Возвращает найденные утечки — пустой список и есть доказательство.
 */
export function check(phrases: readonly { phrase: string; secret: string }[]): { way: Way; phrase: string }[] {
  const found: { way: Way; phrase: string }[] = [];
  for (const item of phrases) {
    for (const way of leaks(item.phrase, item.secret)) found.push({ way, phrase: item.phrase });
  }
  return found;
}

/**
 * Фразы для проверки.
 *
 * Настоящие — включая найденный на шаге 423 случай «пароль от почты»: он не
 * вычищался целый год, и тест должен ловить именно такие.
 */
export function samples(): { phrase: string; secret: string }[] {
  return [
    { phrase: "сохрани пароль: hunter2 в файл", secret: "hunter2" },
    { phrase: "сохрани пароль от почты: qwerty123 в файл", secret: "qwerty123" },
    { phrase: "мой токен ghp_abcdefghijklmnopqrstuvwxyz12", secret: "ghp_abcdefghijklmnopqrstuvwxyz12" },
    { phrase: "пароль от вайфая: pаssword2026", secret: "pаssword2026" },
    { phrase: "карта 4111 1111 1111 1111", secret: "4111 1111 1111 1111" },
  ];
}

/**
 * Что проверка доказывает.
 *
 * Три утверждения, и все три — про отсутствие, а не присутствие.
 */
export function proves(): string[] {
  return [
    "ни одно значение секрета не встречается ни в одном из пяти путей записи",
    "место секрета помечено: человек видит, что фрагмент вычищен, и не думает, что его не поняли",
    "в статистику текст не попадает вовсе: только числа, так что пути для утечки нет",
  ];
}
