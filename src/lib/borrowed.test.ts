import { describe, expect, it } from "vitest";
import { ROWS, audit, decoration, table, type Row } from "./borrowed";

/**
 * Шаг 290: свести заимствования в таблицу «что взяли и почему».
 *
 * Заимствование живёт в коде годами, а причина — в чужой голове. Таблица отвечает
 * на три вопроса: что взяли, зачем, и какую цену не берём.
 */

const row = (over: Partial<Row> = {}): Row => ({
  what: "одно поле как вход",
  from: "Raycast",
  pain: "не помню, где лежит нужное",
  notTaken: "расширения",
  step: "281",
  ...over,
});

describe("каждая строка называет боль", () => {
  it("заимствование без боли — украшение", () => {
    const got = audit([row({ pain: "" })]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("украшение");
  });

  it("украшения перечисляются отдельно", () => {
    expect(decoration([row({ pain: "" }), row()])).toEqual(["одно поле как вход"]);
  });
});

describe("каждая строка называет цену", () => {
  it("не сказано, что не взяли — значит, скопировали продукт", () => {
    const got = audit([row({ notTaken: "" })]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("скопировали продукт");
  });
});

describe("каждая строка связана с работой", () => {
  it("без номера шага — текст, оторванный от работы", () => {
    expect(audit([row({ step: "скоро" })]).ok).toBe(false);
  });

  it("название продукта вместо приёма — тоже ошибка", () => {
    const got = audit([row({ what: "Raycast" })]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("название продукта");
  });
});

describe("повтор одного и того же не проходит", () => {
  it("две одинаковые строки — ошибка", () => {
    const got = audit([row(), row()]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("дважды");
  });
});

describe("настоящая таблица проходит проверку", () => {
  it("девять заимствований из 281–289", () => {
    const got = audit();
    expect(got.ok).toBe(true);
    expect(got.said).toContain("заимствований 9");
    expect(ROWS.length).toBe(9);
  });

  it("у каждого есть боль, цена и шаг", () => {
    for (const item of ROWS) {
      expect(item.pain.trim()).not.toBe("");
      expect(item.notTaken.trim()).not.toBe("");
      expect(item.step).toMatch(/^\d+$/);
    }
  });

  it("шаги идут по порядку 281–289", () => {
    expect(ROWS.map((item) => item.step)).toEqual(["281", "282", "283", "284", "285", "286", "287", "288", "289"]);
  });

  it("таблица печатается как таблица", () => {
    const text = table();
    expect(text.split("\n").length).toBe(ROWS.length + 2);
    expect(text).toContain("| что взяли |");
    expect(text).toContain("Raycast");
  });
});
