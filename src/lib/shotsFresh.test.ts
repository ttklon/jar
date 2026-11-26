import { describe, expect, it } from "vitest";
import { caption, checks, decide, notDo, unmarked, type Shot } from "./shotsFresh";

/**
 * Шаг 479: скриншоты обновляются вместе с экранами или помечаются устаревшими.
 */

const shot = (over: Partial<Shot> = {}): Shot => ({ screen: "home", fingerprint: "f1", now: "f1", exists: true, marked: false, ...over });

describe("три исхода, все лучше «как было»", () => {
  it("отпечаток совпал — свежий", () => {
    expect(decide(shot())).toBe("свежий");
  });

  it("разошёлся и не помечен — переснять", () => {
    expect(decide(shot({ now: "f2" }))).toBe("переснять");
  });

  it("разошёлся, но помечен — пометка держится", () => {
    expect(decide(shot({ now: "f2", marked: true }))).toBe("помечен");
  });

  it("экрана больше нет — убрать, а не «на память»", () => {
    expect(decide(shot({ exists: false, marked: true }))).toBe("убрать");
  });
});

describe("подпись видит человек", () => {
  it("помеченный называет версию", () => {
    const got = caption(shot({ now: "f2", marked: true }), "1.4");
    expect(got).toContain("до версии 1.4");
    expect(got).toContain("детали могли измениться");
  });

  it("устаревший без пометки — «переснять или пометить»", () => {
    expect(caption(shot({ now: "f2" }), "1.4")).toContain("переснять или пометить");
  });

  it("свежий — «снимок текущий»", () => {
    expect(caption(shot(), "1.4")).toContain("снимок текущий");
  });

  it("удалённый экран — «больше нет»", () => {
    expect(caption(shot({ exists: false }), "1.4")).toBe("Экрана «home» больше нет");
  });
});

describe("молча устаревший снимок — ошибка CI", () => {
  it("находит только непомеченные устаревшие", () => {
    const got = unmarked([shot(), shot({ screen: "settings", now: "f2" }), shot({ screen: "help", now: "f2", marked: true })]);
    expect(got).toEqual(["settings"]);
  });

  it("по нему ищут кнопку, которой нет", () => {
    expect(notDo()[0]).toContain("кнопку, которой нет");
    expect(checks()).toHaveLength(3);
  });
});
