import { describe, expect, it } from "vitest";
import { destinations, mark, meaning, show, visible, type Line } from "./logLevels";

/**
 * Шаг 421: локальный журнал с понятными уровнями, без выхода наружу.
 */

const line = (over: Partial<Line> = {}): Line => ({ at: 1, level: "дело", what: "почистил загрузки", ...over });

describe("уровни по-русски, а не DEBUG", () => {
  it("четыре уровня и что каждый значит", () => {
    expect(meaning()).toHaveLength(4);
    expect(meaning()[0]!.level).toBe("дело");
  });

  it("мелочь по умолчанию не видна", () => {
    expect(visible("мелочь")).toBe(false);
    expect(visible("ошибка")).toBe(true);
  });

  it("мелочь можно включить — поддержке она нужна", () => {
    expect(visible("мелочь", true)).toBe(true);
  });

  it("«дело» без пометки, остальные с пометкой", () => {
    expect(mark(line())).toBe("почистил загрузки");
    expect(mark(line({ level: "ошибка", what: "диск занят" }))).toBe("не получилось: диск занят");
    expect(mark(line({ level: "внимание" }))).toBe("стоит посмотреть: почистил загрузки");
  });
});

describe("журнал читают с конца", () => {
  const lines = [line({ at: 1 }), line({ at: 3 }), line({ at: 2 }), line({ at: 4, level: "мелочь" })];

  it("новые сверху, мелочь не мешает", () => {
    expect(show(lines).map((l) => l.at)).toEqual([3, 2, 1]);
  });

  it("с мелочью — все, тоже с конца", () => {
    expect(show(lines, 50, true).map((l) => l.at)).toEqual([4, 3, 2, 1]);
  });

  it("порог по числу строк, а не по времени", () => {
    expect(show(lines, 2)).toHaveLength(2);
  });
});

describe("журнал только локальный", () => {
  it("ни одного адреса отправки", () => {
    expect(destinations()).toEqual([]);
  });
});
