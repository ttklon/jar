import { describe, expect, it } from "vitest";
import { fromResources, order, say, strongAt, type Node } from "./depOrder";

/**
 * Шаг 112: порядок шагов — из зависимостей, а не из порядка в файле.
 *
 * «Переместить отчёт в архив» шло раньше «создать архив» — и падало или клало файл
 * в случайное место.
 */
function node(patch: Partial<Node> & { what: string }): Node {
  return { tool: "files|шаг|дело", after: [], writes: [], reads: [], ...patch };
}

const move = node({
  what: "переместить отчёт в архив",
  tool: "files|переместить|файлы/папки",
  reads: ["folder:D:\\Архив"],
  writes: ["file:D:\\Архив\\отчёт.pdf"],
});

const make = node({ what: "создать архив", tool: "files|создать|папку", writes: ["folder:D:\\Архив"] });

describe("порядок вычисляется из зависимостей", () => {
  it("шаг, читающий папку, идёт после того, кто её создаёт", () => {
    // Иначе перемещение падает или кладёт файл в случайное место.
    const got = order([move, make]);
    expect(got.steps[0]?.what).toBe("создать архив");
    expect(got.steps[1]?.what).toBe("переместить отчёт в архив");
  });

  it("причина названа, а не просто применена", () => {
    const got = order([move, make]);
    const said = say(got);
    expect(said.some((line) => line.includes("после шага"))).toBe(true);
  });

  it("зависимость по ресурсу видна и отдельно", () => {
    const got = fromResources([move, make]);
    expect(got.after[0]).toContain(1);
    expect(got.why[0]).toContain("читает folder:D:\\Архив");
  });

  it("порядок не зависит от порядка в файле", () => {
    // Один и тот же набор — один и тот же порядок.
    const first = order([move, make]).steps.map((item) => item.what);
    const second = order([move, make]).steps.map((item) => item.what);
    expect(first).toEqual(second);
  });
});

describe("независимые шаги остаются как записаны", () => {
  it("без зависимостей перестановки нет и это сказано", () => {
    const a = node({ what: "посчитать место", writes: ["x"] });
    const b = node({ what: "прочитать список", reads: ["y"] });
    const got = order([a, b]);
    expect(got.steps.map((item) => item.what)).toEqual(["посчитать место", "прочитать список"]);
    expect(say(got)).toContain("зависимостей нет — порядок как записан, и это законно");
  });

  it("перестановка ради перестановки не делается", () => {
    // Изменение, которого никто не просил, — тоже дефект.
    const got = order([node({ what: "a" }), node({ what: "b" }), node({ what: "c" })]);
    expect(got.indexes).toEqual([0, 1, 2]);
  });
});

describe("круг — отказ целиком", () => {
  it("шаги по кругу — ошибка, и половина не выполняется", () => {
    const first = node({ what: "первый", reads: ["b"], writes: ["a"] });
    const second = node({ what: "второй", reads: ["a"], writes: ["b"] });
    const got = order([first, second]);
    expect(got.steps).toHaveLength(0);
    expect(say(got)[0]).toContain("по кругу");
  });

  it("ссылка мимо массива названа", () => {
    const got = order([node({ what: "один", after: [5] })]);
    expect(got.errors[0]).toContain("несуществующий");
  });
});

describe("сильная зависимость — та, без которой шаг невозможен", () => {
  it("чтение того, что пишут, — сильная", () => {
    expect(strongAt([move, make], 0)).toBe(true);
    expect(strongAt([move, make], 1)).toBe(false);
  });
});
