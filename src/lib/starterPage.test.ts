import { describe, expect, it } from "vitest";
import { check, checks, groups, NEEDED, phrases, shownAt } from "./starterPage";

/**
 * Шаг 471: страница «20 фраз, которые точно работают» с экранов приложения.
 */

describe("двадцать фраз, пять групп", () => {
  it("ровно двадцать", () => {
    expect(phrases()).toHaveLength(NEEDED);
    expect(check()).toEqual([]);
  });

  it("группы названы желанием, а не рукой", () => {
    const got = groups().map((group) => group.want);
    expect(got).toContain("навести порядок");
    expect(got).toContain("найти");
    expect(got.some((want) => want.includes("рука"))).toBe(false);
  });

  it("у каждой группы сказано, что произойдёт", () => {
    for (const group of groups()) expect(group.gets.length).toBeGreaterThan(10);
  });

  it("недобор фраз — числом", () => {
    expect(check(groups().map((group, i) => (i === 0 ? { ...group, said: group.said.slice(0, 2) } : group))).join()).toContain("фраз 18, а нужно 20");
  });

  it("шесть фраз в группе — это список, а не выбор", () => {
    const got = groups().map((group, i) => (i === 0 ? { ...group, said: [...group.said, "ещё фраза", "и ещё"] } : group));
    expect(check(got).join()).toContain("больше пяти не выбирают");
  });

  it("меньше четырёх групп — не выбор", () => {
    // Три группы по пять: двадцать не набрать, но и выбор из трёх — не выбор.
    const got = check(groups().slice(0, 3));
    expect(got.join()).toContain("меньше четырёх");
  });

  it("пустая фраза — замечание", () => {
    const got = groups().map((group, i) => (i === 1 ? { ...group, said: group.said.map((p, j) => (j === 0 ? "  " : p)) } : group));
    expect(check(got).join()).toContain("пустая фраза");
  });
});

describe("страница на экранах, а не на сайте", () => {
  it("три места, первое — первый запуск", () => {
    const got = shownAt();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("первый запуск");
  });

  it("третий — значок в трее", () => {
    expect(shownAt()[2]).toContain("что сказать");
  });

  it("три проверки", () => {
    expect(checks()).toHaveLength(3);
  });
});
