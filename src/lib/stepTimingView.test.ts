import { describe, expect, it } from "vitest";
import { line, mismatch, slowest, sum, time, type Step } from "./stepTimingView";

/**
 * Шаг 373: отчёт дела показывает, сколько времени занял каждый шаг.
 */

const step = (name: string, ms: number | null): Step => ({ name, ms });

describe("каждый шаг с числом", () => {
  it("сумма известных шагов", () => {
    const got = sum([step("поиск", 1200), step("модель", 28_000), step("руки", 10_800)], 40_000);
    expect(got.known).toBe(40_000);
    expect(got.reconciles).toBe(true);
  });

  it("не мерили — «не мерили», а не ноль", () => {
    expect(line(step("руки", null))).toBe("руки: не мерили");
  });

  it("время по-человечески", () => {
    expect(time(500)).toBe("500 мс");
    expect(time(1200)).toBe("1.2 с");
    expect(time(40_000)).toBe("40 с");
    expect(time(120_000)).toBe("2 мин");
  });
});

describe("расхождение называется числом, а не скрывается", () => {
  it("сумма меньше общего — часть времени потерялась", () => {
    const got = sum([step("поиск", 1000), step("модель", 20_000)], 40_000);
    expect(got.reconciles).toBe(false);
    expect(mismatch(got)).toContain("19 с не отнесено ни к одному шагу");
  });

  it("шаг без времени — сумма сойтись не может", () => {
    const got = sum([step("поиск", 1000), step("руки", null)], 30_000);
    expect(mismatch(got)).toContain("без времени");
  });

  it("всё сходится — замечаний нет", () => {
    expect(mismatch(sum([step("a", 5000)], 5000))).toBeNull();
  });

  it("общее не мерили — сравнивать не с чем", () => {
    expect(mismatch(sum([step("a", 5000)], null))).toBeNull();
  });
});

describe("узкое место названо словами", () => {
  it("самый долгий шаг", () => {
    const got = slowest([step("поиск", 1200), step("модель", 28_000), step("руки", 10_800)]);
    expect(got).toContain("«модель»");
    expect(got).toContain("28 с из 40 с");
  });

  it("время размазано — не выдумываем узкое место", () => {
    const got = slowest([step("a", 1000), step("b", 1000), step("c", 1000), step("d", 1000)]);
    expect(got).toContain("одно узкое место назвать нельзя");
  });

  it("ни одного замера — null, а не «мгновенно»", () => {
    expect(slowest([step("a", null)])).toBeNull();
  });

  it("незамеренные шаги в расчёте не участвуют", () => {
    expect(slowest([step("a", 100), step("b", null), step("c", 200)])).toContain("«c»");
  });
});
