import { describe, expect, it } from "vitest";
import { check, checks, MAX_QUESTIONS, notDo, order, skipped, type Greeting } from "./firstDeed";

/**
 * Шаг 96: первое дело на знакомстве раньше настройки.
 */

const greeting = (over: Partial<Greeting> = {}): Greeting => ({ demoFirst: true, questions: 2, worksWithoutSetup: true, ...over });

describe("дело раньше настройки", () => {
  it("правильное знакомство проходит", () => {
    expect(check(greeting())).toEqual([]);
  });

  it("«что умею» первым, настройка последней", () => {
    const got = order();
    expect(got[0]).toContain("без модели");
    expect(got[3]).toContain("по желанию");
    expect(got).toHaveLength(4);
  });

  it("настройка первой — человек не видит смысла", () => {
    expect(check(greeting({ demoFirst: false })).join()).toContain("десять минут не видит");
  });

  it("три вопроса — допрос", () => {
    expect(check(greeting({ questions: 3 })).join()).toContain("это допрос, а не знакомство");
    expect(MAX_QUESTIONS).toBe(2);
  });

  it("дело без настройки — работает", () => {
    expect(check(greeting({ worksWithoutSetup: false })).join()).toContain("настройка была не «по желанию»");
  });
});

describe("пропущенная настройка не ломает", () => {
  it("сказано, что дело работает", () => {
    const got = skipped();
    expect(got).toContain("дело работает и так");
    expect(got).toContain("позже в Настройках");
  });

  it("не начинается с выбора модели", () => {
    expect(notDo()[0]).toContain("когда человек увидел смысл");
    expect(checks()).toHaveLength(3);
  });
});
