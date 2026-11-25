import { describe, expect, it } from "vitest";
import { confirm, forget, notDo, now, restore, stays, willGo } from "./forgetProfile";
import type { Profile } from "./peopleProfiles";

/**
 * Шаг 408: «забыть профиль» — одной кнопкой, но с настоящим подтверждением.
 */

const anna: Profile = {
  person: { id: "anna", name: "Анна" },
  facts: ["аллергия на кошек", "любит утренний кофе"],
  allowed: ["delete"],
  guest: false,
};

describe("подтверждение называет, что именно исчезнет", () => {
  it("по частям и с числами", () => {
    expect(willGo(anna)).toEqual(["имя «Анна»", "2 факта памяти", "1 разрешение"]);
  });

  it("пустой профиль — честные нули", () => {
    const empty: Profile = { person: { id: "e", name: "Е" }, facts: [], allowed: [], guest: false };
    expect(willGo(empty).join()).toContain("0 фактов");
  });

  it("текст целиком: что уйдёт, что останется, сколько думать", () => {
    const got = confirm(anna, 30);
    expect(got).toContain("Исчезнет: имя «Анна», 2 факта памяти, 1 разрешение.");
    expect(got).toContain("скачанная модель");
    expect(got).toContain("Можно передумать 30 дней");
  });

  it("что останется — три вещи", () => {
    expect(stays().length).toBe(3);
  });
});

describe("корзина, в которой не видно", () => {
  it("спрятан из списка и поиска, но не удалён", () => {
    const got = forget("Анна", new Date(2026, 10, 20).getTime(), 30);
    expect(got.hidden).toBe(true);
    expect(got.said).toContain("убран из списка и поиска");
    expect(got.said).toContain("20.12.2026");
  });

  it("вернуть можно — всё на месте", () => {
    expect(restore("Анна")).toContain("факты и разрешения на месте");
  });

  it("сразу — законно, но сказано, что назад нельзя", () => {
    expect(now("Анна")).toContain("вернуть не получится");
  });
});

describe("день склоняется", () => {
  it("1 день, 3 дня, 30 дней", () => {
    expect(confirm(anna, 1)).toContain("1 день");
    expect(confirm(anna, 3)).toContain("3 дня");
    expect(confirm(anna, 30)).toContain("30 дней");
  });
});

describe("что удаление не делает", () => {
  it("не трогает общее и не переписывает журнал", () => {
    const got = notDo().join();
    expect(got).toContain("дело уже случилось");
    expect(got).toContain("без автора дел журнал перестал бы быть честным");
  });
});
