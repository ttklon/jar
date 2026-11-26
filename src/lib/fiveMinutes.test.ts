import { describe, expect, it } from "vitest";
import { checks, ifSlow, notDo, parts, summary, TOTAL, type Part } from "./fiveMinutes";

/**
 * Шаг 481: один прогон всех проверок ≤ 5 минут.
 */

const part = (over: Partial<Part> = {}): Part => ({ name: "типы", budget: 40, took: 30, ...over });

describe("пять минут распределены по частям", () => {
  it("сумма бюджетов не больше трёхсот", () => {
    const sum = parts().reduce((total, p) => total + p.budget, 0);
    expect(sum).toBeLessThanOrEqual(TOTAL);
  });

  it("четыре части, у каждой бюджет", () => {
    expect(parts()).toHaveLength(4);
    expect(parts().every((p) => p.budget > 0)).toBe(true);
  });

  it("всё в бюджете — одним предложением", () => {
    const got = summary();
    expect(got.ok).toBe(true);
    expect(got.said).toContain("все части в своих бюджетах");
  });
});

describe("медленная часть видна, а не спрятана", () => {
  it("часть за бюджетом названа с числами", () => {
    const got = summary([part({ took: 55 })]);
    expect(got.ok).toBe(false);
    expect(got.over[0]).toBe("типы: 55 с при бюджете 40");
    expect(got.said).toContain("типы: 55 с при бюджете 40");
  });

  it("общее время сверх бюджета — отдельная фраза", () => {
    const got = summary([part({ name: "тесты", budget: 400, took: 320 })]);
    expect(got.said).toContain("дольше 300");
    expect(got.said).toContain("не запустят");
  });

  it("части в бюджете, но сумма больше — тоже не ок", () => {
    // Каждая в своём бюджете (290<300, 100<300), а вместе 390 — больше пяти минут.
    const got = summary([part({ name: "тесты", budget: 300, took: 290 }), part({ name: "храповики", budget: 300, took: 100 })]);
    expect(got.over).toEqual([]);
    expect(got.ok).toBe(false);
    expect(got.total).toBe(390);
  });
});

describe("что делать, если медленно", () => {
  it("оптимизировать часть, а не прогон", () => {
    const got = ifSlow();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("а не весь прогон");
  });

  it("не отключать проверку ради скорости", () => {
    expect(notDo()[1]).toContain("не видно, что медленно");
    expect(checks()).toHaveLength(3);
  });
});
