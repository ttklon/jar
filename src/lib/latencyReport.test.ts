import { describe, expect, it } from "vitest";
import { defect, line, mark, repeated, total, type Deed } from "./latencyReport";

/**
 * Шаг 124: всё, что дольше бюджета, помечается в отчёте как нарушение.
 *
 * Медленное дело списывалось на «слабый компьютер» и не становилось задачей.
 */
const deeds: Deed[] = [
  { what: "переименовать фото", ms: 2400, limit: 1500 },
  { what: "открыть калькулятор", ms: 400, limit: 1500 },
  { what: "проверить диск", ms: null, limit: 1500 },
  { what: "переименовать фото", ms: 2600, limit: 1500 },
];

describe("нарушение видно там, где дело", () => {
  it("помечено числом и пределом", () => {
    expect(mark(deeds[0]!).note).toBe("нарушение бюджета: 2400 мс при пределе 1500");
  });

  it("в бюджете — без пометки, но и без похвалы", () => {
    expect(mark(deeds[1]!)).toEqual({ broken: false, note: "" });
  });

  it("строка отчёта соединяет дело и нарушение", () => {
    expect(line(deeds[0]!)).toBe("переименовать фото · нарушение бюджета: 2400 мс при пределе 1500");
  });
});

describe("замера нет — ни нарушения, ни соблюдения", () => {
  it("не «в порядке»: зелёная галочка была бы обещанием", () => {
    expect(mark(deeds[2]!).broken).toBeNull();
  });

  it("в строке сказано «не замерено»", () => {
    expect(line(deeds[2]!)).toContain("не замерено");
  });
});

describe("нарушения считаются, а не описываются", () => {
  it("сколько нарушений из скольких замеренных", () => {
    const got = total(deeds);
    expect(got.broken).toHaveLength(2);
    expect(got.measured).toBe(3);
    expect(got.said).toContain("нарушений бюджета: 2 из 3");
  });

  it("пропуски считаются отдельно и не выдают себя за успех", () => {
    const got = total(deeds);
    expect(got.skipped).toBe(1);
    expect(got.said).toContain("не замерено: 1");
    // «0 нарушений из 0» не должно выглядеть победой.
    expect(total([deeds[2]!]).said).toContain("замеров нет");
  });

  it("самое медленное из нарушений названо", () => {
    expect(total(deeds).said).toContain("медленнее всего: переименовать фото — 2600 мс");
  });
});

describe("слабый компьютер — не оправдание", () => {
  it("масштаб меняет предел, но нарушение остаётся нарушением", () => {
    // Цель мягче, но она есть (шаг 123).
    const slow: Deed = { what: "дело", ms: 3500, limit: 3000 };
    expect(defect(slow)).toBe(true);
    expect(mark(slow).note).toContain("при пределе 3000");
  });

  it("в пределах нового предела — не нарушение", () => {
    expect(defect({ what: "дело", ms: 2800, limit: 3000 })).toBe(false);
  });
});

describe("что чинить в первую очередь", () => {
  it("повторяющееся дело — первым", () => {
    expect(repeated(deeds)[0]).toEqual({ what: "переименовать фото", times: 2 });
  });

  it("разовое — не в списке приоритетов", () => {
    expect(repeated([deeds[1]!])).toEqual([]);
  });
});
