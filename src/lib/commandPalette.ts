/**
 * Шаг 194: командная палитра `Ctrl+K` (и `Ctrl+Л`).
 *
 * Палитра — это не «красиво». Это ответ на вопрос «где эта кнопка»: человек не
 * ищет экран глазами, он набирает две-три буквы и попадает туда. Поэтому:
 *
 *  * **любой экран по первым буквам**: «на» → «Настройки», «напоминания»;
 *  * **обе раскладки**: `Ctrl+K` и `Ctrl+Л` — одна и та же клавиша в русской и
 *    английской; человек не должен помнить, какая раскладка включена;
 *  * **Enter ведёт туда, что подсвечено** — и подсвечено первое, а не «ничего»:
 *    пустой Enter не должен зависать.
 *
 * И главное: палитра показывает **те же экраны**, что есть в приложении. Список
 * экранов один, и он же — список для диктора (шаг 198).
 */

/** Экран. */
export interface Screen_ {
  /** Как называется для человека. */
  readonly name: string;
  /** Дополнительные слова для поиска: «звук», «уведомления». */
  readonly tags: readonly string[];
}

/**
 * Совпадение по первым буквам слов.
 *
 * «нп» → «Настройки → Планировщик»: буквы идут в начале слов, а не где попало.
 * Поиск «где попало» находит слишком много и потому не помогает.
 */
export function matches(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;

  // Стрелка и служебные знаки — не слова: иначе инициалы получаются «н→п».
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  let parts = q.split(/\s+/);

  // Простой случай: набирают несколькими словами.
  if (parts.length > 1) return parts.every((part) => words.some((word) => word.startsWith(part)));

  // Одна строка: «нп» ищем по инициалам слов, «наст» — по началу первого слова.
  const initials = words.map((word) => word.charAt(0)).join("");
  return words.some((word) => word.startsWith(q)) || initials.startsWith(q);
}

/**
 * Найти экраны.
 *
 * Порядок — по близости: сначала те, чьё название начинается с запроса, потом
 * остальные. Первый результат — то, что подсвечено.
 */
export function find(query: string, screens: readonly Screen_[]): Screen_[] {
  return screens
    .filter((screen) => matches(query, `${screen.name} ${screen.tags.join(" ")}`))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(query.trim().toLowerCase())) - Number(!b.name.toLowerCase().startsWith(query.trim().toLowerCase())));
}

/**
 * Что делает Enter.
 *
 * Всегда ведёт в подсвеченное; если подсветки нет — никуда, и это сказано.
 */
export function onEnter(query: string, screens: readonly Screen_[], selected: number): { go: string | null; said: string } {
  const found = find(query, screens);
  const index = Math.min(Math.max(selected, 0), found.length - 1);
  const target = found[index];

  return target === undefined
    ? { go: null, said: `по «${query}» ничего нет — попробуйте другие буквы` }
    : { go: target.name, said: `открываю «${target.name}»` };
}

/**
 * Клавиша.
 *
 * Две раскладки — одно действие; в русской `Ctrl+Л` это та же `k`.
 */
export const KEYS = ["Ctrl+K", "Ctrl+Л"] as const;

/**
 * Что проверяет `check`.
 *
 * Нарушения: экран без названия, два экрана с одинаковым названием (тогда Enter
 * непредсказуем), пустой список экранов.
 */
export function check(screens: readonly Screen_[]): string[] {
  const problems: string[] = [];
  if (screens.length === 0) problems.push("экранов нет: палитра должна вести хоть куда-то");

  const seen = new Set<string>();
  for (const screen of screens) {
    const key = screen.name.trim().toLowerCase();
    if (key === "") problems.push("экран без названия: его не найти и не объявить");
    else if (seen.has(key)) problems.push(`«${screen.name}» повторяется: Enter поведёт непредсказуемо`);
    seen.add(key);
  }

  return problems;
}

/**
 * Чего палитра не делает.
 *
 * Три запрета.
 */
export function notDo(): string[] {
  return [
    "не ищет по описанию кнопки: только название экрана и его слова",
    "не открывает «первое похожее» молча: подсвеченное видно до Enter",
    "не требует помнить раскладку: `Ctrl+K` и `Ctrl+Л` — одно",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки.
 */
export function checks(): string[] {
  return [
    "любой экран находится по первым буквам",
    "Enter ведёт в подсвеченное, а пустой список честно говорит «нечего»",
    "две раскладки — одно действие",
  ];
}
