import { describe, expect, it } from "vitest";
import type { Profile } from "./peopleProfiles";
import { find } from "./peopleProfiles";
import { leaks, proves, rewritten, run, step, switchTo, type Deed } from "./twoProfilesApart";

/**
 * Шаг 410: тест — два профиля не видят фактов друг друга, и переключение не теряет дела.
 */

const anna: Profile = { person: { id: "anna", name: "Анна" }, facts: ["аллергия на кошек"], allowed: [], guest: false };
const son: Profile = { person: { id: "son", name: "Сын" }, facts: ["любит футбол"], allowed: [], guest: false };

describe("два профиля не видят фактов друг друга", () => {
  it("ни одной утечки в сценарии", () => {
    expect(leaks([anna, son])).toEqual([]);
  });

  it("утечка ловится, если память общая", () => {
    // Испорченный профиль: у сына появился факт Анны — так выглядела бы общая память.
    const broken: Profile = { ...son, facts: ["аллергия на кошек"] };
    expect(leaks([anna, broken]).join()).toContain("видит факт");
  });

  it("после переключения туда-обратно чужая память не появилась", () => {
    const first = find([anna, son], "anna", "футбол");
    const second = find([anna, son], "anna", "кошек");
    expect(first.mine).toEqual([]);
    expect(second.mine).toEqual(["аллергия на кошек"]);
  });

  it("сценарий проверяет по две фразы на человека", () => {
    expect(run().greps).toHaveLength(4);
  });
});

describe("переключение не теряет дело", () => {
  const deed = (): Deed => step(step({ steps: [] }, "просмотр", "anna"), "удаление", "anna");

  it("выполненные шаги остаются за прежним человеком", () => {
    const before = deed();
    const got = switchTo(before, "son");
    expect(got.lost).toEqual([]);
    expect(rewritten(before, got.deed)).toEqual([]);
    expect(got.deed.who).toBe("son");
  });

  it("следующие шаги пишутся на нового", () => {
    const got = switchTo(deed(), "son");
    expect(step(got.deed, "проверка", got.deed.who ?? null).steps.at(-1)!.by).toBe("son");
  });

  it("переписывание шага — замечание", () => {
    const before = deed();
    const after: Deed = { steps: before.steps.map((s) => ({ ...s, by: "son" })), who: "son" };
    expect(rewritten(before, after).join()).toContain("переписан");
  });

  it("пропавший шаг — тоже замечание", () => {
    const before = deed();
    const after: Deed = { steps: [before.steps[0]!], who: "son" };
    expect(rewritten(before, after).join()).toContain("пропал");
  });
});

describe("что доказывает тест", () => {
  it("три утверждения: изоляция, последовательность, сохранность", () => {
    expect(proves()).toHaveLength(3);
  });
});
