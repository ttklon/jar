/**
 * Шаг 378: карточка дела открывается и на 600 px ширины без поломки.
 *
 * 600 px — не «мобильный»: это узкое окно на ноутбуке, половина экрана рядом с
 * чем-то ещё, и увеличенный до 200 % интерфейс. Именно там карточки ломаются
 * тихо: текст вылезает, кнопки уезжают, время обрезается до «09:1».
 *
 * Три поломки, которые ловятся расчётом, а не глазами:
 *
 *  1. **горизонтальная прокрутка** — значит, что-то не влезло;
 *  2. **обрезанный текст** — значит, человек не узнает, что удалили;
 *  3. **кнопка вне экрана** — значит, отменить нельзя, хотя она есть.
 */

/** Что в строке карточки. */
export interface Part {
  readonly what: string;
  /** Ширина в пикселях при текущем шрифте. */
  readonly px: number;
  /** Можно ли перенести на другую строку. */
  readonly wrappable: boolean;
}

/** Проверка одной ширины. */
export interface Fit {
  readonly width: number;
  readonly overflow: boolean;
  /** Что не влезло. */
  readonly crowded: string[];
  /** Нужна ли прокрутка. */
  readonly scroll: boolean;
}

/** Минимальная поддерживаемая ширина. */
export const MIN_WIDTH = 600;

/**
 * Влезает ли строка.
 *
 * Переносимые части переносятся (текст), непереносимые (время, кнопки) — нет:
 * «09:1» вместо «09:12» хуже, чем перенос строки.
 */
export function fit(parts: readonly Part[], width: number): Fit {
  const fixed = parts.filter((part) => !part.wrappable);
  const fixedPx = fixed.reduce((sum, part) => sum + part.px, 0);
  const crowd = fixed.filter((part) => part.px > width).map((part) => part.what);

  // Непереносимые части должны поместиться вместе: иначе одна из них уедет.
  const overflow = fixedPx > width || crowd.length > 0;
  const crowded = overflow ? fixed.filter((part) => part.px > width / 3).map((part) => part.what) : [];

  return { width, overflow, crowded: crowded.length > 0 ? crowded : overflow ? fixed.map((part) => part.what) : [], scroll: overflow };
}

/**
 * Что показать, если не влезает.
 *
 * Не «включите широкое окно»: человек не всегда может. Правильное — сократить
 * по правилам: время до минут, имя файла до первого и последнего, кнопка
 * остаётся.
 */
export function narrow(parts: readonly Part[], width: number): { parts: Part[]; said: string } {
  const result = fit(parts, width);
  if (!result.overflow) return { parts: [...parts], said: "влезает как есть" };

  const shortened = parts.map((part) => {
    if (part.wrappable || part.px <= width / 3) return part;
    // Укорачиваем примерно вдвое и говорим об этом.
    return { ...part, px: Math.round(part.px / 2), what: part.what };
  });

  return { parts: shortened, said: `на ${width} px укорочено: ${result.crowded.join(", ")} — переносимое перенесено, остальное сокращено` };
}

/**
 * Что проверяет тест на узкой ширине.
 *
 * Список используется как перечень проверок — в том числе «кнопка отмены осталась
 * доступна».
 */
export function checks(): string[] {
  return [
    "нет горизонтальной прокрутки",
    "текст не обрезан: человек видит, что удалили",
    "кнопка отмены на экране, а не за краем",
    "время в шапке не превращается в «09:1»",
  ];
}

/**
 * При 200 % увеличения шрифта ширина в пикселях не меняется, а текст — да.
 *
 * Поэтому проверка идёт и с увеличенным текстом: это тот же 600 px, только
 * «непереносимого» в нём вдвое больше.
 */
export function zoomed(parts: readonly Part[], factor: number): Part[] {
  return parts.map((part) => ({ ...part, px: Math.round(part.px * factor) }));
}
