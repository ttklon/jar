import { describe, expect, it } from "vitest";
import type { Profile } from "./peopleProfiles";
import { grant, guestMode, riskWord, rows, rules } from "./profileRightsGuest";

/**
 * Шаг 413: права по профилю и отдельный «гостевой» режим.
 */

const anna: Profile = { person: { id: "anna", name: "Анна" }, facts: [], allowed: [], guest: false };
const son: Profile = { person: { id: "son", name: "Сын" }, facts: [], allowed: [], guest: true };

describe("экран прав: кто что может", () => {
  it("одна строка на опасную руку и человека", () => {
    expect(rows([anna], [])).toHaveLength(5);
  });

  it("разрешено — с папкой", () => {
    const got = rows([anna], [{ to: "anna", risk: "delete", scope: "Загрузки" }]);
    expect(got.find((r) => r.risk === "delete")!.line).toBe("Анна: удаление — «Загрузки»");
  });

  it("гостю нельзя и выдать нельзя — сказано в строке", () => {
    const got = rows([son], [{ to: "son", risk: "delete", scope: "всё" }]).find((r) => r.risk === "delete")!;
    expect(got.ok).toBe(false);
    expect(got.line).toContain("гостю нельзя");
  });

  it("рода по-русски, а не delete", () => {
    expect(riskWord("foreignWrite")).toBe("запись в чужую папку");
  });
});

describe("выдача права", () => {
  it("обычному человеку — можно", () => {
    expect(grant(anna, "delete", "Загрузки").ok).toBe(true);
  });

  it("гостю — отказ, и он не молчаливый", () => {
    const got = grant(son, "delete", "Загрузки");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("по устройству гостевого режима");
  });

  it("чтение не требует строки", () => {
    expect(grant(anna, "read", "всё").ok).toBe(false);
  });
});

describe("гостевой режим — одна кнопка", () => {
  it("включить: только чтение, прежние разрешения снимаются", () => {
    const withRights: Profile = { ...anna, allowed: ["delete"] };
    const got = guestMode(withRights, true);
    expect(got.profile.guest).toBe(true);
    expect(got.profile.allowed).toEqual([]);
  });

  it("выключить: обычный человек, но права не появились задним числом", () => {
    const got = guestMode(son, false);
    expect(got.profile.guest).toBe(false);
    expect(got.said).toContain("не появились");
  });
});

describe("три правила — они же проверки", () => {
  it("право человеку, а не компьютеру", () => {
    expect(rules()[0]).toContain("а не компьютеру");
  });
});
