import { describe, expect, it } from "vitest";
import { checks, line, notCopied, ofDeed, orphans, resultWord, type Entry } from "./commandTrace";

/**
 * Шаг 435: любая команда в журнале связана с делом, фразой и результатом.
 */

const entry = (over: Partial<Entry> = {}): Entry => ({
  command: "удаление",
  deed: "уборка загрузок",
  said: "почисти загрузки",
  result: "done",
  proof: "12 файлов, 340 МБ",
  ...over,
});

describe("каждая строка отвечает на три вопроса", () => {
  it("дело, фраза, результат", () => {
    const got = line(entry());
    expect(got).toBe("дело «уборка загрузок»: удаление — сделано (просили: «почисти загрузки»; 12 файлов, 340 МБ)");
  });

  it("не получилось — без доказательства, но с результатом", () => {
    const got = line(entry({ result: "failed", proof: undefined }));
    expect(got).toContain("не получилось");
    expect(got).not.toContain("undefined");
  });

  it("доказательство — только у «сделано»: у отменённого его быть не может", () => {
    const got = line(entry({ result: "cancelled" }));
    expect(got).not.toContain("12 файлов");
  });

  it("служебная строка без дела — сказано «без дела»", () => {
    expect(line(entry({ deed: null }))).toContain("без дела");
  });

  it("результаты по-русски", () => {
    expect(resultWord("cancelled")).toBe("отменено");
  });
});

describe("сирота — ошибка, а не мелочь", () => {
  it("строка без дела — найдена", () => {
    expect(orphans([entry(), entry({ deed: null, command: "проверка" })])).toEqual(["проверка"]);
  });

  it("строка без фразы — тоже сирота", () => {
    expect(orphans([entry({ said: "   " })])).toEqual(["удаление"]);
  });

  it("все связаны — пустой список", () => {
    expect(orphans([entry(), entry({ result: "failed" })])).toEqual([]);
  });
});

describe("разбор по делу", () => {
  const entries = [entry(), entry({ command: "проверка", result: "done" }), entry({ deed: "другое" })];

  it("все строки дела и в порядке записи", () => {
    expect(ofDeed(entries, "уборка загрузок").map((e) => e.command)).toEqual(["удаление", "проверка"]);
  });

  it("фраза не копируется в каждую строку", () => {
    expect(notCopied()).toContain("разошлась бы");
  });

  it("три требования к строке", () => {
    expect(checks()).toHaveLength(3);
  });
});
