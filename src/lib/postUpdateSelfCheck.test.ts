import { describe, expect, it } from "vitest";
import { compare, nameOf, nextStep, show, when, type Point } from "./postUpdateSelfCheck";

/**
 * Шаг 344: самопроверка после обновления — что изменилось на этой машине.
 *
 * Регрессия, которую видно сразу, — это «до обновления работало, после — нет».
 */

const point = (check: Point["check"], passed: boolean, detail = ""): Point => ({ check, passed, detail });

const before: Point[] = [
  point("engine", true, "1.2"),
  point("model", true, "qwen2.5-1.5b"),
  point("memory", true, "40 фактов"),
  point("voice", true, "микрофон"),
];

describe("сравнение до и после", () => {
  it("ничего не изменилось — так и говорим", () => {
    const got = compare(before, before);
    expect(got.changes).toEqual([]);
    expect(got.said).toContain("ничего не изменилось");
  });

  it("сломалось — главное, и названо первым", () => {
    const got = compare(before, [point("engine", false, "не запускается"), ...before.slice(1)]);
    expect(got.changes[0]?.kind).toBe("broke");
    expect(got.said).toContain("сломалось 1 пункт");
    expect(got.said).toContain("движок");
  });

  it("стало лучше — не причина для тревоги", () => {
    const was = before.map((item) => (item.check === "voice" ? point("voice", false, "нет микрофона") : item));
    const got = compare(was, before);
    expect(got.changes[0]?.kind).toBe("fixed");
    expect(got.said).toContain("ничего не сломалось");
  });

  it("изменилась деталь — версия, а не поломка", () => {
    const got = compare(before, [point("engine", true, "1.3"), ...before.slice(1)]);
    expect(got.changes[0]?.kind).toBe("changed");
    expect(got.changes[0]?.detail).toContain("было «1.2», стало «1.3»");
  });

  it("первый запуск — сравнения нет, и это сказано", () => {
    const got = compare(null, before);
    expect(got.changes).toEqual([]);
    expect(got.said).toContain("сравнивать не с чем");
    expect(got.said).toContain("а не «всё хорошо»");
  });

  it("склонение: 1 пункт, 2 пункта, 5 пунктов", () => {
    const broken = before.map((item) => point(item.check, false));
    expect(compare(before, broken).said).toContain("сломалось 4 пункта");
  });
});

describe("что показывается человеку", () => {
  it("сломанное первым, «стало лучше» в конце", () => {
    const withBrokenVoice = before.map((item) => (item.check === "voice" ? point("voice", false, "нет микрофона") : item));
    const got = compare(withBrokenVoice, [
      point("engine", false, "не запускается"),
      point("model", true, "qwen2.5-1.5b"),
      point("memory", true, "40 фактов"),
      point("voice", true, "микрофон"),
    ]);
    const lines = show(got);
    expect(lines[1]).toContain("сломалось: движок");
    expect(lines[lines.length - 1]).toContain("стало лучше");
  });

  it("ничего не изменилось — одна строка", () => {
    expect(show(compare(before, before)).length).toBe(1);
  });
});

describe("ремонт предлагается, но не запускается сам", () => {
  it("движок — переустановить, модели на месте", () => {
    expect(nextStep({ kind: "broke", check: "engine", detail: "" })).toContain("модели и память останутся");
  });

  it("память — из копии, сделанной до обновления", () => {
    expect(nextStep({ kind: "broke", check: "memory", detail: "" })).toContain("до обновления");
  });

  it("не поломка — делать нечего", () => {
    expect(nextStep({ kind: "changed", check: "engine", detail: "" })).toBe("ничего делать не нужно");
  });

  it("пункт называется по-русски", () => {
    expect(nameOf("hands")).toBe("руки");
  });

  it("когда сравнивать — до первого дела", () => {
    expect(when()).toContain("до первого дела");
  });
});
