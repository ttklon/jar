import { describe, expect, it } from "vitest";
import { checks, moved, notDo, ordered, series, type Pass } from "./cycleRepeat";

/**
 * Шаг 495: повторять цикл — измерение, правка, доказательство.
 */

const pass = (over: Partial<Pass> = {}): Pass => ({ n: 1, measured: "прогон всех проверок", before: 660, fixed: "кэш зависимостей", after: 240, sameRuler: true, guarded: true, ...over });

describe("порядок обязателен", () => {
  it("правильный проход — без замечаний", () => {
    expect(ordered(pass())).toEqual([]);
  });

  it("правка без измерения — по ощущению", () => {
    expect(ordered(pass({ measured: " " })).join()).toContain("правка без измерения");
  });

  it("измерение без правки — цикл не двигается", () => {
    expect(ordered(pass({ fixed: "" })).join()).toContain("цикл не двигается");
  });

  it("другая линейка — не результат", () => {
    expect(ordered(pass({ sameRuler: false })).join()).toContain("доказательство другой линейкой");
  });

  it("без теста против возврата — правка вернётся", () => {
    expect(ordered(pass({ guarded: false })).join()).toContain("правка вернётся");
  });
});

describe("двинулся или нет", () => {
  it("лучше — с числами и правкой", () => {
    const got = moved(pass());
    expect(got.verdict).toBe("лучше");
    expect(got.said).toContain("660 → 240");
    expect(got.said).toContain("кэш зависимостей");
  });

  it("хуже — тоже результат", () => {
    expect(moved(pass({ after: 700 })).verdict).toBe("хуже");
  });

  it("столько же — причина не в том, что правили", () => {
    const got = moved(pass({ after: 660 }));
    expect(got.verdict).toBe("столько же");
    expect(got.said).toContain("причина не в том, что правили");
  });
});

describe("серия проходов — это и есть цикл", () => {
  it("два прохода с улучшением", () => {
    const got = series([pass(), pass({ n: 2, before: 240, after: 190 })]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("проходов 2");
    expect(got.said).toContain("с улучшением 2");
  });

  it("ни одного прохода — есть намерение, а не цикл", () => {
    expect(series([]).said).toContain("цикла нет, есть намерение");
  });

  it("проблемный проход валит серию", () => {
    expect(series([pass({ guarded: false })]).ok).toBe(false);
  });
});

describe("чего цикл не делает", () => {
  it("не заменяется подвигом", () => {
    expect(notDo()[0]).toContain("цикл — каждый раз");
    expect(checks()).toHaveLength(3);
  });
});
