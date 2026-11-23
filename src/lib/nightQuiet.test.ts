import { describe, expect, it } from "vitest";
import { QUIET_SHARE, quietHour, quietLine, share, untilLoud } from "./nightQuiet";

/**
 * Шаг 48: тише ночью.
 *
 * Днём громкость ответа — личное дело, ночью — общее: человек говорит с
 * приложением в час ночи, и оно отвечает на всю квартиру. Это не про удобство,
 * а про то, что рядом спят.
 */
describe("тихие часы", () => {
  it("с 22 до 7 — и полночь внутри", () => {
    // «С 22 до 24» оставило бы полночь громкой — ровно тогда, когда она тише
    // всего нужна.
    expect(quietHour(22)).toBe(true);
    expect(quietHour(23)).toBe(true);
    expect(quietHour(0)).toBe(true);
    expect(quietHour(3)).toBe(true);
    expect(quietHour(6)).toBe(true);
    expect(quietHour(7)).toBe(false);
    expect(quietHour(12)).toBe(false);
    expect(quietHour(21)).toBe(false);
  });

  it("час вне диапазона не ломает правило", () => {
    // Время приходит из системы, и полагаться на его аккуратность нельзя.
    expect(quietHour(25)).toBe(quietHour(1));
    expect(quietHour(-1)).toBe(quietHour(23));
  });
});

describe("громкость", () => {
  it("ночью приглушено, днём обычная", () => {
    expect(share({ hour: 23, askedLouder: false })).toBe(QUIET_SHARE);
    expect(share({ hour: 12, askedLouder: false })).toBe(1);
    expect(QUIET_SHARE).toBeGreaterThan(0.3); // не «выключено»: ответ должен быть слышен
    expect(QUIET_SHARE).toBeLessThan(1);
  });

  it("просьба громче сильнее расписания", () => {
    // Правило про спящих рядом, а не про время как таковое.
    expect(share({ hour: 2, askedLouder: true })).toBe(1);
  });

  it("громче обычного правило не делает", () => {
    // Это настройка системы, а не наше дело.
    expect(share({ hour: 12, askedLouder: true })).toBe(1);
  });
});

describe("как это назвать", () => {
  it("сказано и число, и почему", () => {
    // «Тише» без причины читается как поломка; с причиной — как забота.
    const line = quietLine(QUIET_SHARE);
    expect(line).toContain("60%");
    expect(line).toContain("тихие часы");
  });

  it("названо, как вернуть полную громкость", () => {
    // Иначе человек считает, что приложение испортилось.
    expect(quietLine(QUIET_SHARE)).toContain("громче");
    expect(quietLine(1)).toBe("громкость обычная");
  });

  it("сказано, сколько ждать", () => {
    expect(untilLoud(23)).toBe("после 7:00");
    expect(untilLoud(12)).toBeNull(); // ждать нечего
  });
});
