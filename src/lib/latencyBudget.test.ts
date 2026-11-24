import { describe, expect, it } from "vitest";
import { check, DEFAULT, limit, say, scaled, tally, type Budget } from "./latencyBudget";

/**
 * Шаг 123: бюджет задержки — простой ответ ≤ 1,5 с до первого звука.
 *
 * «Быстро» — ощущение, а не число; «слабый компьютер» объяснял всё.
 */
const budget: Budget = DEFAULT;

describe("цель — число, и это первый звук", () => {
  it("1,5 секунды до первого звука, а не до конца дела", () => {
    // Человек судит о скорости по тому, как скоро услышал ответ.
    expect(DEFAULT.simple).toBe(1500);
  });

  it("в бюджете — так и сказано с обоими числами", () => {
    const got = check(budget, { kind: "simple", ms: 900 });
    expect(got.within).toBe(true);
    expect(got.said).toBe("в бюджете: 900 мс из 1500");
  });

  it("за бюджетом — нарушение, названное дефектом", () => {
    const got = check(budget, { kind: "simple", ms: 2400 });
    expect(got.violation).toBe(true);
    expect(got.said).toContain("это дефект, а не характер машины");
  });
});

describe("простое и сложное не меряют одним бюджетом", () => {
  it("сложный разбор имеет свой предел", () => {
    expect(limit(budget, "complex")).toBe(4000);
    expect(limit(budget, "simple")).toBe(1500);
  });

  it("сложный в 3 секунды укладывается, а простой — нет", () => {
    // Сравнивать их значит наказывать за честность.
    expect(check(budget, { kind: "complex", ms: 3000 }).within).toBe(true);
    expect(check(budget, { kind: "simple", ms: 3000 }).within).toBe(false);
  });
});

describe("звука не было — бюджет не проверен, а не «уложились»", () => {
  it("напечатанный ответ не получает зелёную галочку", () => {
    const got = check(budget, { kind: "simple", ms: null });
    expect(got.within).toBeNull();
    expect(got.violation).toBe(false);
    expect(got.said).toContain("звука не было");
  });
});

describe("средняя машина названа, слабая — масштаб, а не отказ", () => {
  it("по умолчанию — средняя машина, и это сказано", () => {
    expect(scaled(budget)).toContain("средней машины");
  });

  it("медленная машина умножает бюджет, но не отменяет", () => {
    const slow: Budget = { ...budget, scale: 2 };
    expect(limit(slow, "simple")).toBe(3000);
    expect(scaled(slow)).toContain("1500 → 3000");
    // Цель мягче, но она есть: 3500 — всё равно нарушение.
    expect(check(slow, { kind: "simple", ms: 3500 }).violation).toBe(true);
  });
});

describe("доля нарушений — число, которое можно чинить", () => {
  it("считается по проверенным, а не по всем", () => {
    const got = tally(budget, [
      { kind: "simple", ms: 900 },
      { kind: "simple", ms: 2400 },
      { kind: "simple", ms: null },
    ]);
    expect(got).toEqual({ checked: 2, violations: 1, share: 0.5 });
  });

  it("бюджет держится — так и сказано", () => {
    expect(say(tally(budget, [{ kind: "simple", ms: 100 }]))).toBe("бюджет держится: 0 нарушений из 1");
  });

  it("замеров нет — бюджет не проверялся, а не «держится»", () => {
    expect(say(tally(budget, [{ kind: "simple", ms: null }]))).toContain("не проверялся");
  });

  it("нарушения — числом и долей", () => {
    expect(say(tally(budget, [{ kind: "simple", ms: 3000 }, { kind: "simple", ms: 100 }]))).toContain("1 из 2 (50%)");
  });
});
