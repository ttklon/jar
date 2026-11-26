import { describe, expect, it } from "vitest";
import { both, check, NEEDED, refuses, works } from "./recipes20";

/**
 * Шаг 464: рецепты — 20 фраз, которые работают, и 20, которые честно отказывают.
 */

describe("ровно двадцать в каждом списке", () => {
  it("успехи и отказы", () => {
    expect(works()).toHaveLength(NEEDED);
    expect(refuses()).toHaveLength(NEEDED);
  });

  it("оба проходят проверку", () => {
    for (const list of both()) expect(check(list.list, list.label)).toEqual([]);
  });
});

describe("проверка ловит дефекты списков", () => {
  it("девятнадцать — не двадцать", () => {
    expect(check(works().slice(0, 19), "работают").join()).toContain("19 вместо 20");
  });

  it("повтор — назван", () => {
    const list = [...works().slice(0, 19), { ...works()[0]!, said: "  СКОЛЬКО МЕСТА НА ДИСКЕ " }];
    expect(check(list, "работают").join()).toContain("повторяется");
  });

  it("один жанр — это двадцать вариаций одного", () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ said: `фраза ${i}`, what: "что-то", kind: "чтение" }));
    expect(check(list, "работают").join()).toContain("двадцать вариаций одного");
  });

  it("отказ без причины", () => {
    const list = [...refuses().slice(0, 19), { said: "x", what: "  ", kind: "деньги" }];
    expect(check(list, "отказывают").join()).toContain("без объяснения");
  });
});

describe("отказы правдоподобные, а не «абракадабра»", () => {
  it("«напиши маме» и «купи хлеб» — в списке", () => {
    const said = refuses().map((r) => r.said).join(" ");
    expect(said).toContain("напиши маме");
    expect(said).toContain("купи хлеб");
  });

  it("каждый отказ объясняет, почему — это и создаёт доверие", () => {
    for (const item of refuses()) expect(item.what.length).toBeGreaterThan(15);
  });

  it("жанров не меньше пяти в каждом списке", () => {
    for (const list of both()) expect(new Set(list.list.map((r) => r.kind)).size).toBeGreaterThanOrEqual(5);
  });
});

describe("фразы успеха — настоящие", () => {
  it("есть чтение, файлы, расписание, память", () => {
    const kinds = new Set(works().map((r) => r.kind));
    expect(kinds).toContain("чтение");
    expect(kinds).toContain("файлы");
    expect(kinds).toContain("расписание");
    expect(kinds).toContain("память");
  });

  it("опасная фраза объясняет, что спросит подтверждение", () => {
    const clean = works().find((r) => r.said.includes("удали файлы"))!;
    expect(clean.what).toContain("спрошу подтверждение");
  });
});
