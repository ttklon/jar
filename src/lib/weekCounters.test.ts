import { describe, expect, it } from "vitest";
import { notShown, trend, window, type Deed } from "./weekCounters";

/**
 * Шаг 434: счётчики — сколько дел, сколько отказов, сколько отмен — за неделю.
 */

const now = new Date(2026, 10, 20, 12).getTime();
const WEEK = 7 * 86_400_000;
const deed = (over: Partial<Deed> = {}): Deed => ({ at: now - 1000, outcome: "done", ...over });

describe("отказ ≠ отмена", () => {
  it("считаются раздельно", () => {
    const got = window([deed(), deed({ outcome: "failed" }), deed({ outcome: "cancelled" })], now - WEEK, now);
    expect([got.total, got.done, got.failed, got.cancelled]).toEqual([3, 1, 1, 1]);
  });

  it("отмена не попадает в отказы", () => {
    expect(window([deed({ outcome: "cancelled" })], now - WEEK, now).failed).toBe(0);
  });

  it("прошлая неделя — ровно семь суток до текущей, а не «всё, что раньше»", () => {
    // Иначе древнее дело попадёт в «прошлую неделю» и раздувает разницу — мутация
    // `window(deeds, 0, now - WEEK)` проходит незамеченной на свежих данных.
    const ancient = deed({ at: now - 30 * 86_400_000 });
    expect(window([ancient], now - 2 * WEEK, now - WEEK).total).toBe(0);
  });

  it("граница окна: from включается, to нет", () => {
    expect(window([deed({ at: now - WEEK }), deed({ at: now })], now - WEEK, now).total).toBe(1);
  });
});

describe("неделя к неделе", () => {
  it("больше, чем на прошлой", () => {
    const deeds = [deed(), deed(), deed(), deed({ at: now - WEEK - 1000 })];
    const got = trend(deeds, now);
    expect(got.delta.total).toBe(2);
    expect(got.said).toContain("на 2 больше прошлой недели");
  });

  it("меньше", () => {
    const deeds = [deed(), deed({ at: now - WEEK - 1000 }), deed({ at: now - WEEK - 2000 })];
    expect(trend(deeds, now).said).toContain("на 1 меньше прошлой недели");
  });

  it("столько же", () => {
    const deeds = [deed(), deed({ at: now - WEEK - 1000 })];
    expect(trend(deeds, now).said).toContain("столько же");
  });

  it("пустая прошлая неделя — не «+100 %»", () => {
    const got = trend([deed()], now);
    expect(got.delta.total).toBeNull();
    expect(got.said).toContain("сравнивать не с чем");
  });

  it("две недели без дел", () => {
    expect(trend([], now).said).toBe("две недели без дел");
  });

  it("отказов стало меньше — это сказано словами", () => {
    const deeds = [deed(), deed({ at: now - WEEK - 1000, outcome: "failed" }), deed({ at: now - WEEK - 2000, outcome: "failed" })];
    expect(trend(deeds, now).said).toContain("отказов стало меньше");
  });
});

describe("что счётчики не показывают", () => {
  it("три запрета, включая «худший день»", () => {
    const got = notShown().join();
    expect(got).toContain("это не дело");
    expect(got).toContain("не табель");
  });
});
