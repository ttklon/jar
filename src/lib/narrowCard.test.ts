import { describe, expect, it } from "vitest";
import { MIN_WIDTH, checks, fit, narrow, oneLine, zoomed, type Part } from "./narrowCard";

/**
 * Шаг 378: карточка дела открывается и на 600 px ширины без поломки.
 */

const part = (what: string, px: number, wrappable = false): Part => ({ what, px, wrappable });

describe("600 px — узкое окно, а не «мобильный»", () => {
  it("минимальная ширина названа числом", () => {
    expect(MIN_WIDTH).toBe(600);
  });

  it("всё влезает — ни прокрутки, ни сокращений", () => {
    const parts = [part("время", 60), part("заголовок", 200, true), part("кнопка", 120)];
    const got = fit(parts, 600);
    expect(got.overflow).toBe(false);
    expect(got.scroll).toBe(false);
  });

  it("непереносимые вместе не влезают — прокрутка", () => {
    const parts = [part("время", 300), part("кнопка", 400)];
    const got = fit(parts, 600);
    expect(got.overflow).toBe(true);
    expect(got.scroll).toBe(true);
  });

  it("одна часть шире экрана — названа", () => {
    const got = fit([part("длинный путь", 900)], 600);
    expect(got.crowded).toContain("длинный путь");
  });

  it("текст переносимый — не причина прокрутки", () => {
    expect(fit([part("текст", 2000, true)], 600).overflow).toBe(false);
  });
});

describe("не влезает — сокращаем, а не «включите широкое окно»", () => {
  it("непереносимое сокращается вдвое, и это сказано", () => {
    const got = narrow([part("время", 300), part("кнопка", 400)], 600);
    expect(got.said).toContain("укорочено");
    expect(got.parts[0]!.px).toBe(150);
  });

  it("влезает — не трогаем", () => {
    const parts = [part("время", 60)];
    expect(narrow(parts, 600).said).toBe("влезает как есть");
  });
});

describe("при 200 % шрифта тот же 600 px", () => {
  it("непереносимое вырастает вдвое", () => {
    const got = zoomed([part("время", 100), part("кнопка", 100)], 2);
    expect(got[0]!.px).toBe(200);
  });

  it("увеличенное перестаёт влезать", () => {
    const parts = [part("время", 200), part("кнопка", 200)];
    expect(fit(zoomed(parts, 2), 600).overflow).toBe(true);
  });
});

describe("что проверяет тест", () => {
  it("четыре проверки, включая «09:1»", () => {
    const got = checks();
    expect(got.length).toBe(4);
    expect(got.join()).toContain("«09:1»");
    expect(got.join()).toContain("кнопка отмены на экране");
  });
});

describe("влезает ли ряд в одну строку", () => {
  it("текст и кнопка рядом помещаются — строка одна", () => {
    expect(oneLine([part("время", 120, true), part("кнопка", 140)], 600)).toBe(true);
  });

  it("длинный текст рядом с кнопкой не помещается — ряд в столбец", () => {
    // Ровно случай журнала: «всего 2 с; шаг без времени…» — 406 px при оценке
    // 7 px на символ, кнопка «разобрать заново» — 140 px. На 600 px это 546 и
    // ещё помещается; ломается ниже. `fit` при этом отвечал «всё хорошо» на
    // любой ширине, потому что считал только кнопку — отсюда и дефект.
    expect(oneLine([part("время", 406, true), part("кнопка", 140)], 540)).toBe(false);
    // На 600 — помещается, и врать «не влезает» тоже нельзя: лишний перенос
    // сам по себе поломка.
    expect(oneLine([part("время", 406, true), part("кнопка", 140)], 600)).toBe(true);
  });

  it("непереносимая часть шире окна не влезает ни при каком тексте", () => {
    expect(oneLine([part("кнопка", 700)], 600)).toBe(false);
  });

  it("переносимое само по себе прокрутки не даёт — это по-прежнему fit", () => {
    // Два разных вопроса не должны слипнуться: длинная подпись переносится, и
    // это нормально; но в одну строку с кнопкой она не влезет.
    expect(fit([part("текст", 2000, true)], 600).overflow).toBe(false);
    expect(oneLine([part("текст", 2000, true)], 600)).toBe(false);
  });
});
