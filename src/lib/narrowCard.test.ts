import { describe, expect, it } from "vitest";
import { MIN_WIDTH, checks, fit, narrow, zoomed, type Part } from "./narrowCard";

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
