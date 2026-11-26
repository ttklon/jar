import { describe, expect, it } from "vitest";
import { checks, notDo, phantom, summary, uncovered, type Doc } from "./docsGenerated";

/**
 * Шаг 469: все документы генерируются или проверяются.
 */

const doc = (over: Partial<Doc> = {}): Doc => ({ path: "docs/DASHBOARD.md", kind: "сгенерирован", by: "dashboard.py", ...over });

describe("у каждого документа есть чем жить", () => {
  it("сгенерированный с генератором — покрыт", () => {
    expect(uncovered([doc()])).toEqual([]);
  });

  it("сгенерированный без генератора — назван", () => {
    expect(uncovered([doc({ by: undefined })])).toEqual(["docs/DASHBOARD.md"]);
  });

  it("ручной без даты — не покрыт", () => {
    expect(uncovered([doc({ kind: "ручной" })])).toEqual(["docs/DASHBOARD.md"]);
  });

  it("ручной с датой и областью — законное исключение", () => {
    expect(uncovered([doc({ kind: "ручной", dated: { at: "2026-11-20", scope: "пользовательский GUIDE" } })])).toEqual([]);
  });

  it("пустая область — тоже не покрыт", () => {
    expect(uncovered([doc({ kind: "ручной", dated: { at: "2026-11-20", scope: "  " } })])).toHaveLength(1);
  });
});

describe("генератор должен существовать", () => {
  it("есть в tools — ок", () => {
    expect(phantom([doc()], ["dashboard.py"])).toEqual([]);
  });

  it("нет — назван с путём", () => {
    const got = phantom([doc({ by: "нет.py" })], ["dashboard.py"]);
    expect(got[0]).toContain("нет.py не существует");
  });

  it("ручной не требует генератора", () => {
    expect(phantom([doc({ kind: "ручной", dated: { at: "x", scope: "y" } })], [])).toEqual([]);
  });
});

describe("ручных должно быть мало", () => {
  it("считает и предупреждает, когда их больше пятой части", () => {
    const many = Array.from({ length: 10 }, (_, i) => doc({ path: `d${i}.md`, kind: "ручной", dated: { at: "x", scope: "y" } }));
    const got = summary(many);
    expect(got.manual).toBe(10);
    expect(got.said).toContain("многовато");
  });

  it("без ручных — без предупреждения", () => {
    expect(summary([doc()]).said).not.toContain("многовато");
  });

  it("три проверки и один запрет", () => {
    expect(checks()).toHaveLength(3);
    expect(notDo()).toContain("выглядит проверенным");
  });
});
