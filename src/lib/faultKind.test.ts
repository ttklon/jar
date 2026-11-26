import { describe, expect, it } from "vitest";
import { byGroup, kind, neverMix, next, report } from "./faultKind";

/**
 * Шаг 436: ошибки модели отличаются от ошибок политики в отчётах.
 */

describe("три группы, и у каждой свой адресат", () => {
  it("сбои модели", () => {
    expect([kind("timeout"), kind("broken"), kind("engineDown")]).toEqual(["модель", "модель", "модель"]);
  });

  it("политика — это нормальное поведение, а не ошибка", () => {
    expect([kind("refusedDangerous"), kind("guestRights"), kind("rateLimit"), kind("secret")]).toEqual([
      "политика", "политика", "политика", "политика",
    ]);
  });

  it("фраза не разобрана — третья группа", () => {
    expect(kind("unclear")).toBe("человек");
  });

  it("политику «не чинят», а меняют разрешения", () => {
    expect(next("политика")).toContain("менять разрешения");
  });

  it("сбой модели — поддержке, человеку делать нечего", () => {
    expect(next("модель")).toContain("человеку делать нечего");
  });
});

describe("отчёт считает группами", () => {
  it("сбои модели и отказы политикой — раздельно", () => {
    const got = report(["timeout", "broken", "rateLimit", "guestRights", "unclear"]);
    expect([got.model, got.policy, got.wording]).toEqual([2, 2, 1]);
    expect(got.said).toContain("2 сбоя модели — наша ошибка");
    expect(got.said).toContain("2 отказа политикой — так и задумано");
    expect(got.said).toContain("1 фраза не разобрана");
  });

  it("только политика — ни слова об ошибках", () => {
    const got = report(["rateLimit", "refusedDangerous"]);
    expect(got.model).toBe(0);
    expect(got.said).not.toContain("сбоя");
  });

  it("ничего не было — так и сказано", () => {
    expect(report([]).said).toBe("отказов не было");
  });

  it("по группам — только непустые строки", () => {
    expect(byGroup(["timeout", "unclear"]).map((r) => r.group)).toEqual(["модель", "человек"]);
  });
});

describe("чего нельзя делать с группами", () => {
  it("три запрета, первый — «50 ошибок»", () => {
    const got = neverMix().join();
    expect(got).toContain("50 ошибок");
    expect(got).toContain("это язык, а не сбой");
  });
});
