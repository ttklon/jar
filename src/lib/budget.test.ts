import { describe, expect, it } from "vitest";
import { ask, Budget, check, DEFAULT, enoughFor, nothing, offer, outcome, step, word } from "./budget";

/**
 * Шаг 109: бюджет на дело — время, шаги, память — и остановка по бюджету.
 *
 * Дело могло идти вечно: семь шагов по девять секунд не замечаются ни одним
 * таймаутом инструмента.
 */
const budget: Budget = { seconds: 60, steps: 10, megabytes: 64 };

describe("три предела, ни одного без предела", () => {
  it("по умолчанию все три названы числом", () => {
    // Предел, который не назван, наступает неожиданно.
    expect(DEFAULT.seconds).toBeGreaterThan(0);
    expect(DEFAULT.steps).toBeGreaterThan(0);
    expect(DEFAULT.megabytes).toBeGreaterThan(0);
  });

  it("время вышло — остановка", () => {
    const got = check(budget, { seconds: 60, steps: 1, megabytes: 0 });
    expect(got.may).toBe(false);
    expect(got.out).toBe("seconds");
  });

  it("шаги кончились — остановка", () => {
    expect(check(budget, { ...nothing(), steps: 10 }).out).toBe("steps");
  });

  it("память кончилась — остановка", () => {
    expect(check(budget, { ...nothing(), megabytes: 64 }).out).toBe("megabytes");
  });

  it("0 значит «предела нет», а не «ни одного шага»", () => {
    // Без этой оговорки 0 читался бы как запрет делать что-либо.
    const endless: Budget = { seconds: 0, steps: 0, megabytes: 0 };
    expect(check(endless, { seconds: 999, steps: 999, megabytes: 999 }).may).toBe(true);
  });
});

describe("остановка по бюджету — не провал", () => {
  it("причина названа словом «бюджет», а не «ошибка»", () => {
    const got = check(budget, { seconds: 61, steps: 1, megabytes: 0 });
    expect(got.said).toContain("бюджет кончился");
    expect(got.said).toContain("не провал");
  });

  it("вид назван по-русски", () => {
    expect(word("seconds")).toBe("время");
    expect(word("megabytes")).toBe("память");
  });

  it("в отчёте бюджет отдельно от «всё хорошо»", () => {
    expect(outcome(check(budget, { seconds: 61, steps: 1, megabytes: 0 }))).toBe("budget");
    expect(outcome(check(budget, nothing()))).toBe("ok");
  });

  it("предложено, чем продолжить: поднять предел и не начинать сначала", () => {
    const said = offer(budget, { seconds: 61, steps: 3, megabytes: 0 });
    // Вдвое больше прежнего — чтобы «продолжить» было больше, чем «ещё чуть-чуть».
    expect(said).toContain("до 120");
    expect(said).toContain("с того же шага");
  });
});

describe("предупреждение до остановки, а не вместо", () => {
  it("на 80% сказано, что почти кончился", () => {
    const got = check(budget, { seconds: 48, steps: 1, megabytes: 0 });
    expect(got.may).toBe(true);
    expect(got.said).toContain("почти кончился");
    expect(ask(budget, { seconds: 48, steps: 1, megabytes: 0 })).toBe(true);
  });

  it("в начале дела молчат, а не пугают", () => {
    expect(check(budget, nothing()).said).toBe("");
    expect(ask(budget, nothing())).toBe(false);
  });
});

describe("хватает ли на шаг", () => {
  it("не начинать шаг, который не влезает: полдела хуже неначатого", () => {
    expect(enoughFor(budget, { seconds: 55, steps: 1, megabytes: 0 }, { seconds: 10, steps: 1, megabytes: 0 })).toBe(false);
    expect(enoughFor(budget, { seconds: 0, steps: 0, megabytes: 0 }, { seconds: 10, steps: 1, megabytes: 0 })).toBe(true);
  });

  it("шаг тратит все три счётчика сразу", () => {
    expect(step(nothing(), 9, 4)).toEqual({ seconds: 9, steps: 1, megabytes: 4 });
  });
});
