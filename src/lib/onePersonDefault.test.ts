import { describe, expect, it } from "vitest";
import { addWhen, changes, firstRun, shown, unchanged } from "./onePersonDefault";
import { first, type Profile } from "./peopleProfiles";

/**
 * Шаг 409: профиль не мешает основному сценарию — один человек ничего не выбирает.
 */

const anna = first("Анна");
const son: Profile = { person: { id: "son", name: "Сын" }, facts: [], allowed: [], guest: false };

describe("один человек — ничего про профили", () => {
  it("ни заголовка, ни переключателя, ни подсказки", () => {
    const got = shown([anna]);
    expect([got.people, got.switcher, got.hint]).toEqual([false, false, false]);
  });

  it("пустой список — тоже ничего (первый запуск)", () => {
    expect(shown([]).switcher).toBe(false);
  });

  it("первый запуск — один вопрос про имя", () => {
    const got = firstRun();
    expect(got.questions).toBe(1);
    expect(got.said).toContain("профиль создаётся сам");
  });

  it("три вещи, которые не должны измениться", () => {
    const got = unchanged().join();
    expect(got).toContain("ни бейджа в углу");
    expect(got).toContain("от «я»");
  });
});

describe("два человека — усложнение ровно там, где нужно", () => {
  it("переключатель виден, но вопрос только перед опасным", () => {
    const got = shown([anna, son]);
    expect(got.switcher).toBe(true);
    expect(got.said).toContain("только перед опасным делом");
  });

  it("второй профиль — только по явному действию", () => {
    expect(addWhen()).toContain("не решает за человека");
  });

  it("что именно меняется — три пункта", () => {
    expect(changes().length).toBe(3);
  });
});
