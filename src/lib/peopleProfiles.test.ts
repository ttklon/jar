import { describe, expect, it } from "vitest";
import { find, first, may, personal, remember, shared, type Profile } from "./peopleProfiles";

/**
 * Шаг 401: профили людей — у каждого своя память и свои разрешения.
 */

const anna = (): Profile => ({ ...first("Анна"), person: { id: "anna", name: "Анна" }, facts: ["аллергия на кошек"] });
const son: Profile = { person: { id: "son", name: "Сын" }, facts: ["любит футбол"], allowed: [], guest: false };

describe("память у каждого своя", () => {
  it("факт ложится только своему", () => {
    const got = remember([anna(), son], "son", "учится в 9 классе");
    expect(got.ok).toBe(true);
    expect(got.profiles[1]!.facts).toEqual(["любит футбол", "учится в 9 классе"]);
    expect(got.profiles[0]!.facts).toEqual(["аллергия на кошек"]);
  });

  it("нет такого человека — не пишем никому", () => {
    const got = remember([anna(), son], "нет", "факт");
    expect(got.ok).toBe(false);
    expect(got.profiles.every((p) => !p.facts.includes("факт"))).toBe(true);
  });

  it("чужой факт не находится в моём поиске", () => {
    const got = find([anna(), son], "anna", "футбол");
    expect(got.mine).toEqual([]);
  });

  it("но видно, что у другого есть — числом, а не фактами", () => {
    const got = find([anna(), son], "anna", "футбол");
    expect(got.elsewhere).toBe(1);
  });

  it("свои и чужие совпадения не складываются в одно", () => {
    // «кошек» есть у Анны и у Сына — иначе мутация «считать всех» проходит незамеченной.
    const son2: Profile = { ...son, facts: ["аллергия на кошек" ] };
    const got = find([anna(), son2], "anna", "кошек");
    expect(got.mine).toHaveLength(1);
    expect(got.elsewhere).toBe(1);
  });

  it("своё находится", () => {
    expect(find([anna(), son], "anna", "кошек").mine).toEqual(["аллергия на кошек"]);
  });

  it("пустой запрос ничего не ищет", () => {
    expect(find([anna()], "anna", "  ")).toEqual({ mine: [], elsewhere: 0 });
  });
});

describe("разрешения по человеку, а не по машине", () => {
  it("разрешил — можно", () => {
    const profile: Profile = { ...son, allowed: ["delete"] };
    expect(may(profile, "delete").ok).toBe(true);
  });

  it("чужое согласие не считается моим", () => {
    const got = may(son, "delete");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не разрешал");
  });

  it("гостю можно только чтение", () => {
    const guest: Profile = { person: { id: "g", name: "Гость" }, facts: [], allowed: [], guest: true };
    expect(may(guest, "read").ok).toBe(true);
    expect(may(guest, "delete").ok).toBe(false);
  });
});

describe("первый профиль — без выбора", () => {
  it("создаётся молча, имя необязательно", () => {
    expect(first("").person.name).toBe("я");
    expect(first("Анна").person.name).toBe("Анна");
  });

  it("что общее, что личное", () => {
    expect(shared().join()).toContain("скачанная модель");
    expect(personal()).toContain("факты памяти");
    expect(personal().length).toBe(3);
  });
});
