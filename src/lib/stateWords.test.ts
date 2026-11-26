import { describe, expect, it } from "vitest";
import { check, checks, meaning, notChecked, notDo, words, type State } from "./stateWords";

/**
 * Шаг «2» (вторая строка плана): словарь состояния.
 */

describe("четыре состояния, словарь закрыт", () => {
  it("ровно четыре", () => {
    expect(words()).toHaveLength(4);
    expect(words().map((word) => word.state)).toEqual(["не установлено", "не проверено", "проверено на этой машине", "не работает"]);
  });

  it("у каждого — что показываем", () => {
    for (const word of words()) expect(word.shows.length).toBeGreaterThan(15);
  });

  it("пользоваться можно только проверенным", () => {
    expect(words().filter((word) => word.usable).map((word) => word.state)).toEqual(["проверено на этой машине"]);
  });

  it("слово не из словаря — ошибка, а не «вроде да»", () => {
    expect(meaning("полуработает")).toBeNull();
    expect(check("полуработает").join()).toContain("не из словаря");
  });
});

describe("«не проверено» — не «не работает»", () => {
  it("разные слова, разные кнопки", () => {
    expect(meaning("не проверено")!.shows).toContain("«проверить»");
    expect(meaning("не проверено")!.shows).toContain("никакого «не работает»");
    expect(meaning("не работает")!.shows).toContain("причина и что сделать");
  });

  it("сказать человеку — одно действие", () => {
    const got = notChecked();
    expect(got).toContain("нажмите «проверить»");
    expect(got).not.toContain("не работает");
  });

  it("«не работает» без проверки — замечание", () => {
    expect(check("не работает").join()).toContain("это «не проверено»");
  });
});

describe("«проверено» — только на этой машине", () => {
  it("полное слово проходит", () => {
    expect(check("проверено на этой машине")).toEqual([]);
  });

  it("без оговорки — обещание больше проверенного", () => {
    expect(check("проверено").join()).toContain("обещание больше проверенного");
  });

  it("состояния — типизированный список", () => {
    const all: State[] = ["не установлено", "не проверено", "проверено на этой машине", "не работает"];
    for (const state of all) expect(meaning(state)).not.toBeNull();
  });
});

describe("чего словарь не делает", () => {
  it("не вводит полу-состояния", () => {
    const got = notDo().join();
    expect(got).toContain("«полуработает»");
    expect(checks()).toHaveLength(3);
  });
});
