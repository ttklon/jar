import { describe, expect, it } from "vitest";
import { classify, describe as describeRule, holds, notUnderstood, parse, type Facts } from "./plainCondition";

/**
 * Шаг 333: условие «только если…» словами человека — точность без кода.
 */

const facts = (over: Partial<Facts> = {}): Facts => ({ freePercent: 50, files: 0, ranToday: false, ...over });

describe("условие стоит где угодно и разбирается целиком", () => {
  it("«только если» в конце фразы", () => {
    const got = parse("каждый день в 9 — отчёт о диске, только если места меньше 10 %");
    expect(got.what).toBe("каждый день в 9 — отчёт о диске");
    expect(got.condition).toEqual({ kind: "diskBelow", percent: 10 });
  });

  it("без условия — дела как есть", () => {
    const got = parse("каждый день в 9 — отчёт");
    expect(got.condition).toBeNull();
  });

  it("«только если сегодня ещё не было»", () => {
    const got = classify("сегодня ещё не было");
    expect(got.kind).toBe("notYetDoneToday");
  });

  it("«больше 5 файлов»", () => {
    const got = classify("в загрузках больше 5 файлов");
    expect(got.kind).toBe("fileCount");
    if (got.kind === "fileCount") expect(got.count).toBe(5);
  });

  it("непонятное условие не выдумывается", () => {
    expect(classify("луна в третьей четверти").kind).toBe("unknown");
  });

  it("порог 0 % — не порог", () => {
    expect(classify("места меньше 0 %").kind).toBe("unknown");
  });
});

describe("неизвестное условие — не «да»", () => {
  it("unknown даёт null, а не true", () => {
    // null означает «не знаю» — и дело не запускается, а пропускается с причиной.
    expect(holds({ kind: "unknown", text: "?" }, facts())).toBeNull();
  });

  it("известные условия считаются", () => {
    expect(holds({ kind: "diskBelow", percent: 10 }, facts({ freePercent: 5 }))).toBe(true);
    expect(holds({ kind: "diskBelow", percent: 10 }, facts({ freePercent: 50 }))).toBe(false);
    expect(holds({ kind: "notYetDoneToday" }, facts({ ranToday: true }))).toBe(false);
    expect(holds({ kind: "fileCount", folder: "любой", op: "more", count: 5 }, facts({ files: 9 }))).toBe(true);
  });
});

describe("условие читается в списке", () => {
  it("по-человечески, а не кодом", () => {
    expect(describeRule({ kind: "diskBelow", percent: 10 })).toBe("только если места меньше 10 %");
  });

  it("непонятое условие так и называется", () => {
    expect(describeRule({ kind: "unknown", text: "луна" })).toContain("не понято");
  });

  it("«не понял» — с тремя примерами, а не отказ", () => {
    const got = notUnderstood("луна");
    expect(got).toContain("места меньше 10 %");
    expect(got).toContain("сегодня ещё не было");
    expect(got).toContain("больше 5 файлов");
  });
});
