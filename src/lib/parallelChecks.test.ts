import { describe, expect, it } from "vitest";
import { checks, conflicts, notDo, summary, waves, type Part } from "./parallelChecks";

/**
 * Шаг 483: параллельные проверки по независимым областям.
 */

const part = (over: Partial<Part> = {}): Part => ({ name: "типы", writes: ["dist/"], reads: ["src/"], ...over });

describe("что делает части зависимыми", () => {
  it("разные файлы — независимы", () => {
    expect(conflicts([part(), part({ name: "тесты", writes: ["coverage/"], reads: ["src/"] })])).toEqual([]);
  });

  it("пишут в один файл — конфликт с именем файла", () => {
    const got = conflicts([part(), part({ name: "тесты", writes: ["dist/", "coverage/"] })]);
    expect(got[0]).toContain("пишут в одно: dist/");
  });

  it("одна читает то, что пишет другая — конфликт", () => {
    const got = conflicts([part(), part({ name: "снимок", writes: ["data/report.json"], reads: ["dist/"] })]);
    expect(got.join()).toContain("одна читает то, что пишет другая");
    expect(got.join()).toContain("dist/");
  });
});

describe("волны", () => {
  it("независимые — одна волна", () => {
    const got = waves([part(), part({ name: "тесты", writes: ["coverage/"], reads: ["src/"] })]);
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual(["типы", "тесты"]);
  });

  it("зависимые — разные волны", () => {
    const got = waves([part({ name: "конфликт", writes: ["dist/"] }), part({ name: "типы", writes: ["dist/"] })]);
    expect(got.length).toBeGreaterThan(1);
  });

  it("сам с собой конфликтов нет", () => {
    expect(conflicts([part({ writes: ["x"] })])).toEqual([]);
    expect(waves([part({ name: "a", writes: ["x"] }), part({ name: "b", writes: ["y"] })])[0]).toEqual(["a", "b"]);
  });
});

describe("сводка говорит правду", () => {
  it("без конфликтов — волнами", () => {
    const got = summary([part(), part({ name: "тесты", writes: ["coverage/"], reads: ["src/"] })]);
    expect(got.said).toContain("общих файлов нет");
    expect(got.waves).toBe(1);
  });

  it("с конфликтом — «параллельно нельзя»", () => {
    const got = summary([part(), part({ name: "b", writes: ["dist/"] })]);
    expect(got.said).toContain("параллельно нельзя");
  });
});

describe("чего параллельность не делает", () => {
  it("плавающий прогон — дефект", () => {
    expect(notDo()[2]).toContain("плавающий — это дефект");
    expect(checks()).toHaveLength(3);
  });
});
