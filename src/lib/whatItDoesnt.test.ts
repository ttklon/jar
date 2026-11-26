import { describe, expect, it } from "vitest";
import { check, limits, notDo, visibleAt, type Limit } from "./whatItDoesnt";

/**
 * Шаг 465: документ «чего приложение не делает» на виду.
 */

describe("список настоящий и короткий", () => {
  it("проходит проверку", () => {
    expect(check(limits())).toEqual([]);
  });

  it("не больше пятнадцати пунктов", () => {
    expect(limits().length).toBeLessThanOrEqual(15);
  });

  it("каждый пункт с причиной", () => {
    for (const item of limits()) expect(item.why.length).toBeGreaterThan(10);
  });

  it("границы из примеров отказов есть в списке", () => {
    const said = limits().map((l) => l.what).join(" ");
    expect(said).toContain("не отправляет сообщения");
    expect(said).toContain("не тратит деньги");
    expect(said).toContain("не хранит и не меняет пароли");
  });
});

describe("проверка ловит слабые места", () => {
  it("шестнадцать пунктов — уже не читают", () => {
    const long = [...limits(), { what: "x", why: "достаточно длинная причина" }];
    expect(check(long).join()).toContain("больше пятнадцати не читают");
  });

  it("«не поддерживается» — оправдание, а не причина", () => {
    const bad: Limit[] = [{ what: "x", why: "не поддерживается в этой версии" }];
    expect(check(bad).join()).toContain("оправдание вместо причины");
  });

  it("причина из двух слов — не причина", () => {
    expect(check([{ what: "x", why: "нельзя" }]).join()).toContain("без причины");
  });
});

describe("на виду, а не спрятан", () => {
  it("три места, включая ответ на отказ", () => {
    const got = visibleAt();
    expect(got).toHaveLength(3);
    expect(got[1]).toContain("содержит ссылку");
  });

  it("не про будущее и не растёт до сотни", () => {
    const got = notDo().join();
    expect(got).toContain("обещание на будущее — это не ограничение");
    expect(got).toContain("перестанет работать");
  });
});
