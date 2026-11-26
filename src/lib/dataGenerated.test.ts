import { describe, expect, it } from "vitest";
import { checks, handEdited, ifManual, notDo, stale, summary, type Generated } from "./dataGenerated";

/**
 * Шаг 490: изменение данных без генерации валит сборку.
 */

const gen = (over: Partial<Generated> = {}): Generated => ({ path: "data/report.json", by: "`python3 tools/report_snapshot.py --write`", current: "{\"n\":1}", fresh: "{\"n\":1}", ...over });

describe("перегенерировать и сравнить", () => {
  it("совпадает — в порядке", () => {
    expect(stale([gen()])).toEqual([]);
  });

  it("расхождение называет файл и команду", () => {
    const got = stale([gen({ fresh: "{\"n\":2}" })]);
    expect(got[0]).toContain("data/report.json: не перегенерирован");
    expect(got[0]).toContain("tools/report_snapshot.py --write");
  });

  it("два расхождения — обе строки", () => {
    expect(stale([gen({ fresh: "x" }), gen({ path: "docs/AUTONOMY.md", fresh: "y" })])).toHaveLength(2);
  });
});

describe("руками или забыл — разные беды", () => {
  it("правили руками: не совпадает ни с прошлым, ни со свежим", () => {
    expect(handEdited(gen({ current: "ручное", fresh: "свежее" }), "прошлое")).toBe(true);
  });

  it("забыли перегенерировать: совпадает с прошлым", () => {
    expect(handEdited(gen({ current: "прошлое", fresh: "свежее" }), "прошлое")).toBe(false);
  });

  it("сводка называет правленые руками отдельно", () => {
    const got = summary([gen({ current: "ручное", fresh: "свежее" })], new Map([["data/report.json", "прошлое"]]));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("Правлены руками: data/report.json");
    expect(got.said).toContain("правка исчезнет при генерации");
  });

  it("всё совпадает — числом", () => {
    expect(summary([gen()], new Map()).said).toContain("все совпадают с генератором");
  });
});

describe("что делать и чего не делать", () => {
  it("правка вносится в генератор", () => {
    expect(ifManual()[0]).toContain("**генератор**");
  });

  it("не правит файл, чтобы сравнение сошлось", () => {
    expect(notDo()[0]).toContain("это та же ручная правка");
    expect(checks()).toHaveLength(3);
  });
});
