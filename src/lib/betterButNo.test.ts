import { describe, expect, it } from "vitest";
import { audit, check, reply, vagueShare, type NotTaken } from "./betterButNo";

/**
 * Шаг 299: список «что у них лучше и почему мы не берём» — с причиной.
 *
 * Самый неудобный документ в проекте: он про то, где мы проигрываем, и при этом остаётся.
 */

const NOW = Date.UTC(2026, 11, 1);
const LATER = Date.UTC(2027, 3, 1);

const row = (over: Partial<NotTaken> = {}): NotTaken => ({
  what: "поиск по всем файлам компьютера",
  who: "Everything",
  betterFor: "тот, кто ищет по имени файла, которое помнит",
  instead: "поиск по своей памяти одной строкой на факт",
  cost: "индексировать весь диск: 40 МБ и вечная служба",
  revisitAt: LATER,
  ...over,
});

describe("«лучше вообще» — не аргумент", () => {
  it("полная строка проходит", () => {
    expect(check(row(), NOW).problems).toEqual([]);
  });

  it("«полировка» — не конкретная вещь", () => {
    expect(check(row({ what: "полировка" }), NOW).problems.join()).toContain("не конкретная вещь");
  });

  it("«лучше для всех» — значит, ни для кого", () => {
    expect(check(row({ betterFor: "всем" }), NOW).problems.join()).toContain("для никого конкретно");
  });

  it("без «что вместо» это жалоба, а не сравнение", () => {
    expect(check(row({ instead: "" }), NOW).problems.join()).toContain("не сравнение, а жалоба");
  });

  it("цена без числа ничего не говорит", () => {
    expect(check(row({ cost: "дорого" }), NOW).problems.join()).toContain("цена без числа");
  });

  it("срок пересмотра прошёл — решение устарело само", () => {
    const got = check(row({ revisitAt: Date.UTC(2026, 0, 1) }), NOW);
    expect(got.problems.join()).toContain("решение устарело");
  });
});

describe("ответ не спор и не защита", () => {
  it("да, лучше — и для кого именно", () => {
    const got = reply(row());
    expect(got).toContain("Да, у Everything это лучше");
    expect(got).toContain("для тот, кто ищет");
  });

  it("названо, что у нас вместо и когда вернёмся", () => {
    const got = reply(row());
    expect(got).toContain("У нас вместо этого");
    expect(got).toContain("2027-04-01");
  });
});

describe("итог ловит защиту вместо сравнения", () => {
  it("весь список проверен", () => {
    const got = audit([row()], NOW);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("для кого лучше");
  });

  it("просроченные названы отдельно", () => {
    const got = audit([row({ revisitAt: Date.UTC(2026, 0, 1), what: "история запросов" })], NOW);
    expect(got.due).toEqual(["история запросов"]);
  });

  it("доля «лучше для всех» считается", () => {
    expect(vagueShare([row({ betterFor: "всем" }), row()])).toBe(0.5);
    expect(vagueShare([])).toBe(0);
  });
});
