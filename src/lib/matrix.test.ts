import { describe, expect, it } from "vitest";
import {
  COUNT,
  MATRIX_SCALES,
  RESOLUTIONS,
  THEMES,
  combinations,
  judge,
  summary,
  sweep,
  viewport,
} from "./matrix";

/**
 * Шаг 240: тест-матрица «три разрешения × два масштаба × две темы» — автоматически.
 *
 * Дефект: каждое измерение проверялось по одному (разрешение — в `layout`, масштаб
 * — в `textScale`, тема — в `theme`), и **никто не проверял их вместе**. Порознь
 * всё верно, вместе — нет: тёмная тема на 1024×600 при 200% даёт другие числа, чем
 * светлая на 4K при 100%, и это не видел ни один тест.
 */

describe("матрица перечисляется, а не выбирается (шаг 240)", () => {
  it("три разрешения × два масштаба × две темы = 12 сочетаний", () => {
    expect(RESOLUTIONS.length).toBe(3);
    expect(MATRIX_SCALES.length).toBe(2);
    expect(THEMES.length).toBe(2);
    expect(COUNT).toBe(12);
    expect(combinations().length).toBe(COUNT);
  });

  it("«автоматически» значит: добавление размера попадает в матрицу само", () => {
    // Матрица — данные, а не список `it(...)`. Проверяется это тем, что
    // сочетаний ровно столько, сколько даёт произведение размеров: если бы
    // список был написан руками, одно из произведений разошлось бы.
    expect(combinations().length).toBe(RESOLUTIONS.length * MATRIX_SCALES.length * THEMES.length);
    // И каждое сочетание на своём месте, без повторов: 12 имён, все разные.
    const names = combinations().map((combination) => combination.name);
    expect(new Set(names).size).toBe(12);
  });

  it("имена названы так, что видно, что именно упало", () => {
    // «Сочетание 7 не прошло» — не отчёт. В имени должны быть все три оси.
    for (const combination of combinations()) {
      expect(combination.name).toContain("·");
      expect(combination.name).toMatch(/(100|200)%/);
      expect(combination.name).toMatch(/(тёмная|светлая)/);
    }
  });
});

describe("масштаб уменьшает окно, а не увеличивает", () => {
  it("1024×600 при 200% — это 512×300 точек", () => {
    // Ошибка в эту сторону встречается: 200% «умножают», получая «на 200% места
    // больше», то есть ровно наоборот.
    expect(viewport(1024, 600, 2)).toEqual({ width: 512, height: 300 });
    expect(viewport(1024, 600, 1)).toEqual({ width: 1024, height: 600 });
  });
});

describe("вся матрица проходит обещания", () => {
  it("все 12 сочетаний проходят — и это видно в сводке", () => {
    const verdicts = sweep();
    expect(verdicts.length).toBe(12);
    const failed = verdicts.filter((verdict) => !verdict.fits);
    // Если это упадёт, сводка назовёт, какие именно сочетания и почему.
    expect(failed.map((verdict) => `${verdict.combination.name}: ${verdict.problems.join(", ")}`)).toEqual([]);
    expect(summary(verdicts)).toContain("все проходят");
  });

  it("тема не меняет размеров — это утверждение, а не пропуск", () => {
    // От темы зависят цвета, а не числа. Если однажды понадобится другой шрифт
    // для тёмной темы, это станет видно здесь сразу.
    for (const combination of combinations()) {
      const light = { ...combination, theme: "light" as const };
      const dark = { ...combination, theme: "dark" as const };
      expect(judge(light).chars).toBe(judge(dark).chars);
      expect(judge(light).target).toBe(judge(dark).target);
      expect(judge(light).fits).toBe(judge(dark).fits);
    }
  });

  it("на 200% цель касания не уменьшается на экране", () => {
    // Цель задана в точках; при масштабе 200% она занимает вдвое больше
    // физических пикселей, но не меньше — обратное было бы нарушением нормы.
    for (const verdict of sweep()) {
      expect(verdict.target).toBeGreaterThanOrEqual(40);
    }
  });

  it("при 200% в строку отчёта влезает хоть сколько-то знаков", () => {
    // 512 точек при 200% — самый тесный случай. Если и там строка пустая,
    // отчёт превращается в столбик.
    const tightest = sweep().filter((verdict) => verdict.combination.scale === 2);
    expect(tightest.length).toBe(6);
    for (const verdict of tightest) {
      expect(verdict.chars).toBeGreaterThanOrEqual(12);
    }
  });
});

describe("матрица ловит то, что порознь не видно", () => {
  it("1024×600 при 200% — самый тесный случай, и он назван", () => {
    const tight = judge({
      name: "1024×600 · 200% · тёмная",
      width: 1024,
      height: 600,
      scale: 2,
      theme: "dark",
    });
    // Высота 300 меньше 600, а прокрутка нужна — значит нужен и запас.
    expect(tight.combination.name).toContain("1024×600");
    expect(tight.chars).toBeGreaterThan(0);
  });

  it("разрешение, которое не влезает, названо по имени, а не числом", () => {
    // Сводка должна говорить «1366×768 · 200% · светлая», а не «#7».
    const verdicts = sweep().map((verdict) =>
      verdict.combination.width === 1366 ? { ...verdict, fits: false } : verdict,
    );
    const text = summary(verdicts);
    expect(text).toContain("не проходят");
    expect(text).toContain("1366×768");
  });

  it("сенсорный и мышиный профили дают разные цели — и оба не ниже нормы", () => {
    // Матрица гоняется на обоих: сочетание размеров не должно «проходить»
    // только потому, что профиль оказался мышиным.
    const coarse = sweep("coarse");
    const fine = sweep("fine");
    expect(coarse[0]!.target).toBeGreaterThan(fine[0]!.target);
    // Мышиный профиль — 32 px по норме: он **уже**, чем сенсорный, и порог
    // «не меньше 40» к нему не применим. Требовать 40 и там значило бы мерить
    // мышь сенсорной линейкой.
    expect(fine[0]!.target).toBe(32);
    expect(fine.every((verdict) => verdict.fits)).toBe(true);
    expect(coarse.every((verdict) => verdict.fits)).toBe(true);
  });
});
