import { describe, expect, it } from "vitest";
import type { Profile } from "./peopleProfiles";
import { filter, may, scope, silent } from "./profileSearchScope";

/**
 * Шаг 418: память профиля не попадает в чужие поиски.
 */

const anna: Profile = { person: { id: "anna", name: "Анна" }, facts: ["аллергия на кошек"], allowed: [], guest: false };
const son: Profile = { person: { id: "son", name: "Сын" }, facts: ["любит футбол"], allowed: [], guest: false };
const guest: Profile = { person: { id: "g", name: "Гость" }, facts: [], allowed: [], guest: true };

describe("каждая точка поиска спрашивает разрешение", () => {
  it("своя память — можно", () => {
    expect(may(anna, anna, "memory").ok).toBe(true);
  });

  it("чужая память — нельзя", () => {
    expect(may(anna, son, "memory").ok).toBe(false);
  });

  it("подсказка из чужой памяти — тоже нельзя", () => {
    expect(may(anna, son, "suggest").why).toContain("ни фактом, ни подсказкой");
  });

  it("поиск по файлам память не читает", () => {
    expect(may(anna, son, "files").ok).toBe(true);
  });
});

describe("журнал: хозяину можно, гостю нет", () => {
  it("хозяин видит чужие дела", () => {
    expect(may(anna, son, "journal").ok).toBe(true);
  });

  it("гость не видит никогда", () => {
    expect(may(guest, son, "journal").ok).toBe(false);
    expect(may(guest, son, "journal").why).toBe("гость чужих дел не видит");
  });
});

describe("фильтр по точке поиска", () => {
  const results = [
    { owner: anna, text: "моё" },
    { owner: son, text: "чужое" },
  ];

  it("память — только свои", () => {
    expect(filter(anna, "memory", results).map((r) => r.text)).toEqual(["моё"]);
  });

  it("журнал — оба, потому что зритель хозяин", () => {
    expect(filter(anna, "journal", results)).toHaveLength(2);
  });

  it("гость в журнале — только своё", () => {
    expect(filter(guest, "journal", results)).toEqual([]);
  });
});

describe("точки поиска перечислены", () => {
  it("четыре, и в каждой сказано, что видно", () => {
    const got = scope(anna);
    expect(got).toHaveLength(4);
    expect(got.find((s) => s.where === "journal")!.said).toContain("остальных людей");
  });

  it("даже число — утечка", () => {
    expect(silent()).toContain("это уже утечка темы");
  });
});
