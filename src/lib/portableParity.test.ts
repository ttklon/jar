import { describe, expect, it } from "vitest";
import { PORTABLE_DIFF, SAME_ALWAYS, audit, before, dataPath, tagline, update } from "./portableParity";

/**
 * Шаг 306: портативная версия с теми же проверками — одно поведение, не два.
 *
 * Портативная сборка удобная и потому выпадает из всех проверок; для человека это
 * «та же программа».
 */

describe("портативность меняет место, а не поведение", () => {
  it("все обязательные проверки на месте — нарушений нет", () => {
    expect(audit("portable", SAME_ALWAYS)).toEqual([]);
  });

  it("потерянная проверка называется по имени", () => {
    const got = audit("portable", SAME_ALWAYS.filter((row) => !row.includes("хеш модели")));
    expect(got.join()).toContain("потеряла проверку");
    expect(got.join()).toContain("хеш модели");
  });

  it("у установщика не бывает отдельного списка проверок", () => {
    expect(audit("installer", SAME_ALWAYS.concat(["свои проверки установщика"])).join()).toContain("проверки одни на всех");
  });

  it("списки разные и не пустые", () => {
    expect(PORTABLE_DIFF.length).toBe(3);
    expect(SAME_ALWAYS.length).toBe(4);
    expect(PORTABLE_DIFF).not.toEqual(SAME_ALWAYS);
  });
});

describe("данные рядом, а не на чужом компьютере", () => {
  it("портативная — в папке data рядом", () => {
    expect(dataPath("portable", "D:\\ZShelper")).toBe("D:\\ZShelper\\data");
  });

  it("установщик — в профиле", () => {
    expect(dataPath("installer", "D:\\ZShelper")).toContain("%LOCALAPPDATA%");
  });
});

describe("человек знает три факта до запуска", () => {
  it("где данные, как удалять, как обновлять", () => {
    const got = before("portable");
    expect(got).toContain("папке data");
    expect(got).toContain("удаление");
    expect(got).toContain("обновление");
  });

  it("у установщика — про «Программы и компоненты» и выбор", () => {
    expect(before("installer")).toContain("Программы и компоненты");
  });
});

describe("обновление не подменяет работающие файлы", () => {
  it("портативная — после закрытия, а не на ходу", () => {
    expect(update("portable")).toContain("после закрытия");
  });

  it("на странице загрузки без слова «полноценная»", () => {
    expect(tagline("portable")).toContain("те же проверки");
    expect(tagline("portable")).not.toContain("полноценная");
  });
});
