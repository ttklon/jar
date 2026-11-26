import { describe, expect, it } from "vitest";
import type { Profile } from "./peopleProfiles";
import { cases, may, onDelete, visible } from "./logPerProfile";

/**
 * Шаг 439: журнал доступен только своему профилю.
 */

const anna: Profile = { person: { id: "anna", name: "Анна" }, facts: [], allowed: [], guest: false };
const son: Profile = { person: { id: "son", name: "Сын" }, facts: [], allowed: [], guest: false };
const guest: Profile = { person: { id: "g", name: "Гость" }, facts: [], allowed: [], guest: true };

describe("свой журнал — всегда", () => {
  it("читать, выгружать, стирать", () => {
    for (const action of ["read", "export", "delete", "statistics"] as const) {
      expect(may(anna, anna, action, true).ok).toBe(true);
    }
  });
});

describe("чужой журнал: гостю — никогда", () => {
  it("ни читать, ни выгружать, ни считать", () => {
    for (const action of ["read", "export", "statistics"] as const) {
      const got = may(guest, anna, action, true);
      expect(got.ok).toBe(false);
      expect(got.said).toContain("гость чужих дел не видит");
    }
  });
});

describe("хозяину компьютера чужие дела видны — но не удаляются", () => {
  it("чтение и счётчики можно", () => {
    expect(may(anna, son, "read", true).ok).toBe(true);
    expect(may(anna, son, "statistics", true).ok).toBe(true);
  });

  it("экспорт можно, но видно, чей файл", () => {
    expect(may(anna, son, "export", true).said).toContain("в файле будет видно, чей он");
  });

  it("чужой журнал не удаляется вручную", () => {
    const got = may(anna, son, "delete", true);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("уходит только с профилем");
  });

  it("не хозяин — тоже нельзя", () => {
    expect(may(son, anna, "read", false).ok).toBe(false);
  });
});

describe("фильтр не пропускает лишнее", () => {
  const entries = [{ owner: "anna" }, { owner: "son" }];

  it("своё — всё", () => {
    expect(visible(anna, anna, entries, true)).toHaveLength(2);
  });

  it("гость — ничего", () => {
    expect(visible(guest, anna, entries, true)).toEqual([]);
  });
});

describe("удаление профиля журнал не стирает", () => {
  it("автор остаётся", () => {
    expect(onDelete("Анна")).toContain("Автор в строках сохраняется");
  });

  it("три случая доступа", () => {
    expect(cases()).toHaveLength(3);
  });
});
