import { describe, expect, it } from "vitest";
import { budget, BUDGET, checks, ifTooBig, notDo, steps } from "./handIn30";

/**
 * Шаг 476: руководство разработчика — как добавить руку за 30 минут.
 */

describe("тридцать минут считаются, а не обещаются", () => {
  it("сумма не больше бюджета", () => {
    const got = budget();
    expect(got.total).toBeLessThanOrEqual(BUDGET);
    expect(got.ok).toBe(true);
    expect(got.said).toContain(`минут ${got.total} из 30`);
  });

  it("перебор бюджета виден, а не «ок»", () => {
    // Лишний шаг на 5 минут: 35 > 30 — руководство обещало бы больше, чем может.
    const got = budget([...steps(), { n: 6, do: "ещё шаг", minutes: 5, ifLate: "не должно понадобиться" }]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не укладывается");
  });

  it("пять шагов, у каждого бюджет", () => {
    const got = steps();
    expect(got).toHaveLength(5);
    expect(got.every((step) => step.minutes > 0)).toBe(true);
  });

  it("у каждого шага есть «если не уложился»", () => {
    for (const step of steps()) expect(step.ifLate.length).toBeGreaterThan(20);
  });
});

describe("порядок важен", () => {
  it("опасность руки — на третьем шаге, до реализации", () => {
    const got = steps();
    expect(got[2]!.do).toContain("DANGEROUS");
    expect(got[2]!.minutes).toBe(2);
  });

  it("тест с мутацией — не сокращать", () => {
    expect(steps()[3]!.ifLate).toContain("не сокращать тест");
  });

  it("прогон tsc не пропускать: неиспользуемый импорт ловит CI", () => {
    expect(steps()[4]!.ifLate).toContain("неиспользуемый импорт");
  });
});

describe("если рука не влезла", () => {
  it("три исхода, все к меньшему объёму", () => {
    const got = ifTooBig();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("разделить на две руки");
  });

  it("«доделаю потом» — запрещено", () => {
    expect(notDo()[0]).toContain("доделаю потом");
    expect(checks()).toHaveLength(3);
  });
});
