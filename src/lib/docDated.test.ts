import { describe, expect, it } from "vitest";
import { check, checks, days, FRESH_DAYS, header, notDo, stale, type Doc } from "./docDated";

/**
 * Шаг 477: у всех документов есть дата и область проверки.
 */

const doc = (over: Partial<Doc> = {}): Doc => ({ path: "docs/GUIDE.md", at: "2026-11-01", scope: "клавиши, установка, первый запуск", ...over });
const TODAY = "2026-11-20";

describe("дата и область — обязательны", () => {
  it("правильный документ проходит", () => {
    expect(check(doc())).toEqual([]);
  });

  it("нет даты — замечание", () => {
    expect(check(doc({ at: "" })).join()).toContain("даты нет");
  });

  it("«актуально» вместо области — не область", () => {
    expect(check(doc({ scope: "актуально" })).join()).toContain("что именно сверено");
  });

  it("короткая область — не область", () => {
    expect(check(doc({ scope: "ок" })).join()).toContain("короче десяти знаков");
  });
});

describe("девяносто дней — порог", () => {
  it("свежий не устарел", () => {
    expect(stale([doc()], TODAY)).toEqual([]);
  });

  it("старше — путь и число дней", () => {
    const got = stale([doc({ at: "2026-06-01" })], TODAY);
    expect(got[0]).toContain("docs/GUIDE.md");
    expect(got[0]).toMatch(/\d+ дней/);
  });

  it("ровно на пороге ещё свежий", () => {
    const at = new Date(Date.parse(`${TODAY}T00:00:00Z`) - FRESH_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(stale([doc({ at })], TODAY)).toEqual([]);
  });

  it("плохая дата «сегодня» — сравнивать не с чем", () => {
    expect(stale([doc()], "вчера")[0]).toContain("не дата");
  });
});

describe("шапка видна человеку", () => {
  it("свежий — дата и область", () => {
    expect(header(doc(), TODAY)).toBe("Проверено: 2026-11-01 — клавиши, установка, первый запуск");
  });

  it("устаревший — видимая пометка, а не скрытая", () => {
    const got = header(doc({ at: "2026-06-01" }), TODAY);
    expect(got).toContain("Не проверялся");
    expect(got).toContain("сверьте или поставьте дату");
  });
});

describe("что дата не делает", () => {
  it("новая дата без проверки — ложь с печатью", () => {
    expect(notDo()[0]).toContain("ложь с печатью");
    expect(checks()).toHaveLength(3);
    expect(days("2026-11-20")).not.toBeNull();
  });
});
