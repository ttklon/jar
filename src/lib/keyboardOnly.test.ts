import { describe, expect, it } from "vitest";
import { check, checks, escape, notDo, steps, untilDone, type Step } from "./keyboardOnly";

/**
 * Шаг 193: главный сценарий без мыши.
 */

describe("пять шагов до дела", () => {
  it("Ctrl+K → буквы → Enter → фраза → Enter", () => {
    expect(steps().map((step) => step.key)).toEqual(["Ctrl+K", "буквы", "Enter", "фраза", "Enter"]);
    expect(untilDone()).toBe(5);
    expect(check()).toEqual([]);
  });

  it("у каждого шага есть место и объявление", () => {
    for (const step of steps()) {
      expect(step.where.trim().length).toBeGreaterThan(3);
      // «выполняю» — коротко, но это полное объявление: порог по длине тут не главное.
      expect(step.heard.trim().length).toBeGreaterThan(7);
    }
  });

  it("шаг без объявления — потеря места", () => {
    const list: Step[] = [...steps().slice(0, 4), { key: "Enter", where: "дело", heard: " " }];
    expect(check(list).join()).toContain("сценарий без диктора неполон");
  });

  it("больше семи шагов — лабиринт", () => {
    const many: Step[] = Array.from({ length: 8 }, () => ({ key: "шаг", where: "место", heard: "объявлено вслух" }));
    expect(check(many).join()).toContain("это уже лабиринт");
  });
});

describe("Escape возвращает и говорит куда", () => {
  it("из середины — на шаг назад", () => {
    const got = escape(2);
    expect(got.to).toBe(1);
    expect(got.said).toContain("вернулся:");
  });

  it("из начала — закрывает палитру", () => {
    expect(escape(0).said).toContain("закрываю палитру");
  });
});

describe("чего сценарий не делает", () => {
  it("не Tab по кругу и не запирает", () => {
    const got = notDo().join();
    expect(got).toContain("Tab по кругу");
    expect(got).toContain("Escape всегда возвращает");
    expect(checks()).toHaveLength(3);
  });
});
