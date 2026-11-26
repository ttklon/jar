import { describe, expect, it } from "vitest";
import { change, check, checks, notDo, publish, type Measure } from "./remeasure";

/**
 * Шаг 491: перемерить всё заново и опубликовать цифры.
 */

const measure = (over: Partial<Measure> = {}): Measure => ({ what: "прогон всех проверок", value: 240, unit: "с", before: 660, ruler: "стенные часы на CI", ...over });

describe("цифра без единицы и линейки — не цифра", () => {
  it("правильный замер проходит", () => {
    expect(check(measure())).toEqual([]);
  });

  it("нет единицы — число ничего не значит", () => {
    expect(check(measure({ unit: " " })).join()).toContain("нет единицы");
  });

  it("нет линейки — чем мерили?", () => {
    expect(check(measure({ ruler: "" })).join()).toContain("нет линейки");
  });

  it("замер без названия и отрицательное — замечания", () => {
    const got = check(measure({ what: " ", value: -1 })).join();
    expect(got).toContain("замер без названия");
    expect(got).toContain("отрицательное значение");
  });
});

describe("базовая линия или «впервые»", () => {
  it("стало быстрее — «лучше» с числами", () => {
    const got = change(measure(), "стенные часы на CI");
    expect(got.verdict).toBe("лучше");
    expect(got.said).toContain("660 → 240 с");
    expect(got.said).toContain("−420 с");
  });

  it("стало медленнее — «хуже», а не «по-другому»", () => {
    expect(change(measure({ value: 700 }), "стенные часы на CI").verdict).toBe("хуже");
  });

  it("без изменений — «столько же», а не «улучшение»", () => {
    const got = change(measure({ value: 660 }), "стенные часы на CI");
    expect(got.verdict).toBe("столько же");
    expect(got.said).toContain("без изменений");
  });

  it("первый замер — «впервые», а не улучшение", () => {
    const got = change(measure({ before: null }), "стенные часы на CI");
    expect(got.verdict).toBe("другая цифра");
    expect(got.said).toContain("мерим впервые");
  });
});

describe("другая линейка — другая цифра", () => {
  it("смена линейки не улучшение", () => {
    const got = change(measure(), "секундомер в тестах");
    expect(got.verdict).toBe("другая цифра");
    expect(got.said).toContain("другая линейка");
    expect(got.said).toContain("это не улучшение и не ухудшение");
  });

  it("при публикации линейка берётся из прошлого замера", () => {
    const got = publish([measure()], { "прогон всех проверок": "секундомер в тестах" });
    expect(got[0]).toContain("другая линейка");
  });

  it("публикация — одна строка на замер", () => {
    expect(publish([measure(), measure({ what: "память в покое", value: 210, unit: "МБ", before: 300 })], {})).toHaveLength(2);
  });
});

describe("чего замер не делает", () => {
  it("не подгоняет под желаемое", () => {
    expect(notDo()[2]).toContain("не понравилась, остаётся");
    expect(checks()).toHaveLength(3);
  });
});
