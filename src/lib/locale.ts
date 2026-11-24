/**
 * Шаг 229: локализация — русский полностью, остальные — честно «нет перевода».
 *
 * Почему «честно» здесь главное слово. Есть два плохих способа обойтись без
 * перевода, и оба встречаются:
 *
 *  * **молча показать русский** человеку, у которого система английская. Он не
 *    понимает интерфейс и не знает, что это неверная настройка, а не поломка;
 *  * **перевести наполовину** — заголовки по-английски, а кнопки по-русски.
 *    Такой интерфейс читается хуже, чем одноязычный: половину слов человек
 *    угадывает.
 *
 * Правило модуля: язык определяется по системе, и если перевода нет — это
 * **сказано до начала работы**, одной строкой, с предложением остаться на
 * русском. Русский переведён **полностью**, и полнота проверяется: экран без
 * строки — это не «мелочь», а тот же полуперевод.
 *
 * Чего модуль не делает: не переводит сам и не подставляет английские заглушки.
 * Заглушка «Login» вместо «Вход» создаёт вид перевода — и это хуже отказа.
 */

/** Языки, которые приложение понимает. */
export const LANGUAGES = ["ru"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Что решили про язык. */
export interface Decision {
  /** Язык интерфейса. */
  language: Language;
  /** Переведён ли он целиком — для `ru` всегда да, это и проверяется. */
  complete: boolean;
  /**
   * Сказать ли человеку про отсутствие перевода. `null` — говорить нечего.
   */
  notice: string | null;
}

/**
 * Язык системы: `"ru-RU"` → `"ru"`. Регистр не важен: `ru-ru` и `RU` — тот же
 * язык, и различать их значило бы считать русскую систему иностранной.
 */
export function baseLanguage(tag: string | null | undefined): string {
  if (!tag) return "";
  return tag.split(/[-_]/)[0]!.toLowerCase();
}

/**
 * Выбрать язык. `system` — то, что говорит система (`navigator.language`),
 * `preferred` — то, что человек выбрал раньше (если выбирал).
 *
 * Выбор человека сильнее системы: если он однажды выбрал русский на английской
 * машине, спрашивать снова при каждом запуске — это не забота, а придирки.
 */
export function choose(system: string | null | undefined, preferred: Language | null = null): Decision {
  if (preferred && (LANGUAGES as readonly string[]).includes(preferred)) {
    return { language: preferred, complete: true, notice: null };
  }

  const base = baseLanguage(system);
  if (base === "ru") {
    return { language: "ru", complete: true, notice: null };
  }

  // Система не русская, перевода нет. Это говорится **до** начала работы, иначе
  // человек решит, что интерфейс сломан, а не что перевод один.
  const named = system && system.trim().length > 0 ? system : "неизвестный";
  return {
    language: "ru",
    complete: true,
    notice:
      `Перевода на язык системы (${named}) пока нет: интерфейс будет по-русски. ` +
      "Это не ошибка и не поломка — по-русски переведено всё, по-английски пока ничего.",
  };
}

/**
 * Название языка для показа человеку. На **своём** языке, а не «Russian»:
 * человек, читающий по-русски, ищет «русский».
 */
export function nameOf(language: Language): string {
  return language === "ru" ? "русский" : language;
}

/** Есть ли перевод на этот язык. Ответ «нет» — не ошибка, а факт. */
export function translated(tag: string | null | undefined): boolean {
  return (LANGUAGES as readonly string[]).includes(baseLanguage(tag) as Language);
}

/**
 * Проверка полноты: каждая строка словаря непустая.
 *
 * Полуперевод начинается с пустой строки — её никто не замечает, пока она не
 * окажется в интерфейсе пустым местом. Проверка возвращает **имена** пустых
 * ключей, а не «есть проблемы»: имя — это то, что можно починить.
 */
export function missing(entries: Readonly<Record<string, unknown>>, prefix = ""): string[] {
  const found: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      if (value.trim().length === 0) found.push(name);
    } else if (typeof value === "function") {
      // Функции-строки: проверить шаблон можно только вызовом, и это делает
      // отдельный тест; здесь достаточно того, что она есть.
    } else if (value && typeof value === "object") {
      found.push(...missing(value as Record<string, unknown>, name));
    }
  }
  return found;
}
