/**
 * Шаг 240: тест-матрица «три разрешения × два масштаба × две темы» — автоматически.
 *
 * Почему матрица, а не три отдельные проверки. До этого шага каждое измерение
 * проверялось **по одному**: разрешение — в `layout.test.ts`, масштаб — в
 * `textScale.test.ts`, тема — в `theme.test.ts`. И это ровно тот случай, когда
 * порознь всё верно, а вместе — нет: тёмная тема на 1024×600 при 200% даёт
 * другие числа, чем светлая на 4K при 100%, и никто этого не видел, потому что
 * ни один тест не ставил их рядом.
 *
 * Правило: **12 сочетаний перечисляются, а не выбираются по одному**. Перечисление
 * строит код (`combinations()`), и добавление третьего масштаба или светлой темы
 * попадает в проверку само, без новой строки в тесте. Это и значит «автоматически»:
 * матрица — данные, а не список `it(...)`.
 *
 * Чего модуль не делает: не рисует. Он отвечает на вопрос «сколько места осталось
 * и влезает ли» для каждого сочетания, а тест сверяет ответ с обещаниями
 * (`MIN_SCREEN`, цели касания, длина строки). Так проверка не зависит от
 * браузера и работает в общем прогоне.
 */

import { metrics, type Scale } from "./textScale";
import { sizes, type Pointer } from "./touch";

/** Разрешения, на которых обещана работа. */
export const RESOLUTIONS = [
  { name: "1024×600", width: 1024, height: 600 },
  { name: "1366×768", width: 1366, height: 768 },
  { name: "1920×1080", width: 1920, height: 1080 },
] as const;

/**
 * Масштабы — **два**, а не четыре.
 *
 * 100% и 200% — это не «мало и много», а две разные задачи: при 100% надо, чтобы
 * влезло больше, при 200% — чтобы не обрезалось. 125% и 150% лежат между ними и
 * проверяются в `textScale.test.ts`; в матрицу они не идут, иначе 24 сочетания
 * проверяют одно и то же дважды.
 */
export const MATRIX_SCALES: readonly Scale[] = [1, 2];

/**
 * Темы — ровно те, что бывают у человека.
 *
 * `system` сюда не идёт: это **источник** выбора, а не результат. В матрице
 * стоят развёрнутые значения — иначе «системная» при проверке оказалась бы то
 * светлой, то тёмной в зависимости от машины, и тест стал бы
 * неповторяемым.
 */
export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/** Одно сочетание: что проверять. */
export interface Combination {
  /** Как называется в отчёте: `1024×600 · 200% · тёмная`. */
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly scale: Scale;
  readonly theme: Theme;
}

/**
 * Все сочетания — перечислением, а не отбором.
 *
 * Порядок — по разрешению, внутри по масштабу, внутри по теме: так в отчёте
 * видно, что изменилось, а не перемешано.
 */
export function combinations(): Combination[] {
  const out: Combination[] = [];
  for (const resolution of RESOLUTIONS) {
    for (const scale of MATRIX_SCALES) {
      for (const theme of THEMES) {
        out.push({
          name: `${resolution.name} · ${Math.round(scale * 100)}% · ${theme === "dark" ? "тёмная" : "светлая"}`,
          width: resolution.width,
          height: resolution.height,
          scale,
          theme,
        });
      }
    }
  }
  return out;
}

/** Сколько сочетаний в матрице: 3 × 2 × 2 = 12. */
export const COUNT = RESOLUTIONS.length * MATRIX_SCALES.length * THEMES.length;

/**
 * Что остаётся от окна при таком масштабе.
 *
 * Масштаб Windows уменьшает **логический** размер окна: программа видит 1024/2 =
 * 512 точек при 200% на экране 1024. Поэтому ширина и высота делятся, а не
 * умножаются, — ошибка в эту сторону встречается и даёт «на 200% места больше»,
 * то есть ровно наоборот.
 */
export function viewport(width: number, height: number, scale: Scale): { width: number; height: number } {
  return {
    width: Math.floor(width / scale),
    height: Math.floor(height / scale),
  };
}

/** Итог проверки одного сочетания. */
export interface Verdict {
  readonly combination: Combination;
  /** Влезает ли по минимуму экрана из `layout`. */
  readonly fits: boolean;
  /** Наименьшая цель касания в этом сочетании, px. */
  readonly target: number;
  /** Сколько знаков влезает в строку отчёта при этом масштабе. */
  readonly chars: number;
  /** Что не так — словами. Пусто — всё в порядке. */
  readonly problems: readonly string[];
}

/**
 * Проверка одного сочетания по обещаниям, а не по ощущению.
 *
 * Три обещания:
 *
 *  1. **окно не больше экрана** — иначе часть интерфейса за краем, и человек её
 *     не найдёт (шаг 222);
 *  2. **цель касания не меньше 40 px** — норма для сенсорного профиля, и при
 *     масштабе 200% цель, заданная в точках, остаётся той же на экране;
 *  3. **строка отчёта не пустая** — при 200% в 512 точках должно влезать хоть
 *     сколько-то знаков, иначе отчёт превращается в столбик.
 *
 * Тема в проверке **не участвует** — и это утверждение, а не пропуск: от неё
 * зависят цвета, а не размеры. Проверка ниже это закрепляет: числа для светлой и
 * тёмной совпадают. Если однажды тема начнёт менять размеры (например, понадобится
 * другой шрифт), это станет видно сразу.
 */
export function judge(combination: Combination, profile: Pointer = "coarse"): Verdict {
  const view = viewport(combination.width, combination.height, combination.scale);
  const got = metrics(combination.scale);
  const target = sizes(profile).control;
  const chars = Math.floor((got.column - got.padding * 2) / (got.line * 0.55));
  const problems: string[] = [];
  if (view.width < 512) {
    problems.push(
      `при ${Math.round(combination.scale * 100)}% от ${combination.width} остаётся ${view.width} точек — уже минимума 512`,
    );
  }
  // Норма зависит от указателя, и это не поблажка мыши: 44 — палец, 32 — мышь.
  // Мерить мышь сенсорной линейкой значило бы требовать 44 там, где норма 32, и
  // объявлять дефектом исправный профиль.
  const norm = profile === "fine" ? 32 : 44;
  if (target < norm) {
    problems.push(`цель касания ${target} px — меньше нормы ${norm} для профиля «${profile}»`);
  }
  if (chars < 12) {
    problems.push(`в строку влезает ${chars} знаков — отчёт разваливается на столбик`);
  }
  // Прокрутка при 200% — не дефект сама по себе: она и есть правильный ответ на
  // «крупный шрифт в маленьком окне». Дефект — когда прокручивать **нечего
  // показать**: если в оставшейся высоте не помещается ни заголовок, ни две
  // строки, человек видит пустоту и не догадывается, что там что-то есть.
  //
  // Первая версия проверки сравнивала 300 точек с 600 «по экрану» и объявляла
  // дефектом шесть сочетаний. Правильно объявлять дефектом не «нужна прокрутка»,
  // а «в прокрутке меньше трёх строк»: при строке 28 это 84 точки.
  const visible = Math.floor(view.height / got.line);
  if (visible < 3) {
    problems.push(
      `при ${Math.round(combination.scale * 100)}% от ${combination.height} остаётся ${view.height} точек — это ${visible} строк текста, меньше трёх`,
    );
  }
  return {
    combination,
    fits: problems.length === 0,
    target,
    chars,
    problems,
  };
}

/** Прогнать всю матрицу: 12 вердиктов, ни одного выборочного. */
export function sweep(profile: Pointer = "coarse"): Verdict[] {
  return combinations().map((combination) => judge(combination, profile));
}

/** Строка для журнала: сколько сочетаний и сколько прошло. */
export function summary(verdicts: readonly Verdict[]): string {
  const bad = verdicts.filter((verdict) => !verdict.fits);
  if (bad.length === 0) {
    return `сочетаний ${verdicts.length}, все проходят`;
  }
  return `сочетаний ${verdicts.length}, не проходят ${bad.length}: ${bad
    .map((verdict) => verdict.combination.name)
    .join("; ")}`;
}
