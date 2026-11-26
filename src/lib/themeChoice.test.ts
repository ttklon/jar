import { describe, expect, it } from "vitest";
import { check, checks, DEFAULT, notDo, options, resolve } from "./themeChoice";

/**
 * Шаг 200: тема — светлая, тёмная, «как в системе».
 */

describe("три варианта", () => {
  it("умолчание — как в системе", () => {
    expect(DEFAULT).toBe("как в системе");
    expect(options()[0]!.choice).toBe("как в системе");
    expect(options()).toHaveLength(3);
  });

  it("у каждого варианта сказано, что он значит", () => {
    for (const option of options()) expect(option.means.length).toBeGreaterThan(15);
  });
});

describe("как в системе — следует системе", () => {
  it("система тёмная — тёмная", () => {
    const got = resolve("как в системе", "тёмная");
    expect(got.theme).toBe("тёмная");
    expect(got.said).toBe("как в системе: тёмная");
  });

  it("система светлая — светлая", () => {
    expect(resolve("как в системе", "светлая").theme).toBe("светлая");
  });

  it("система молчит — светлая, а не тёмная", () => {
    const got = resolve("как в системе", null);
    expect(got.theme).toBe("светлая");
    expect(got.said).toContain("система не сообщила тему — берём светлую");
  });
});

describe("выбранное держится", () => {
  it("светлая не зависит от системы", () => {
    expect(resolve("светлая", "тёмная").theme).toBe("светлая");
  });

  it("тёмная не зависит от системы", () => {
    expect(resolve("тёмная", "светлая").theme).toBe("тёмная");
  });

  it("неизвестная тема — замечание с вариантами", () => {
    expect(check("синяя").join()).toContain("не вариант темы");
    expect(check("тёмная")).toEqual([]);
  });
});

describe("чего тема не делает", () => {
  it("не зашита тёмной и не угадывает", () => {
    const got = notDo().join();
    expect(got).toContain("это выбор за человека");
    expect(got).toContain("берём светлую, а не тёмную");
    expect(checks()).toHaveLength(3);
  });
});
