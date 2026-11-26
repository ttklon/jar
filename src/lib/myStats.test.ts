import { describe, expect, it } from "vitest";
import { between, compare, count, notCounted, time, week, type Deed } from "./myStats";

/**
 * Шаг 424: статистика своих дел на экране «Обзор».
 */

const now = new Date(2026, 10, 20, 12).getTime();
const deed = (over: Partial<Deed> = {}): Deed => ({ at: now, outcome: "done", savedMs: 120_000, ...over });

describe("четыре числа, и ни одного лишнего", () => {
  it("за неделю, а не с понедельника", () => {
    const got = week([deed(), deed({ at: now - 10 * 86_400_000 })], now);
    expect(got.total).toBe(1);
  });

  it("сделанное, отказы и отмены — раздельно", () => {
    const got = count([deed(), deed({ outcome: "failed" }), deed({ outcome: "cancelled" })]);
    expect([got.done, got.failed, got.cancelled]).toEqual([1, 1, 1]);
  });

  it("сэкономленное складывается, а неизвестное не считается нулём", () => {
    const got = count([deed({ savedMs: 60_000 }), deed({ savedMs: null })]);
    expect(got.savedMs).toBe(60_000);
  });

  it("не из чего считать время — null, а не 0", () => {
    expect(count([deed({ savedMs: null })]).savedMs).toBeNull();
  });

  it("нет дел — не нули, а «нечего считать»", () => {
    expect(count([]).said).toBe("пока нечего считать: дел за неделю не было");
  });

  it("сводка одной строкой", () => {
    const got = count([deed(), deed({ outcome: "failed" }), deed({ savedMs: 60_000 })]);
    expect(got.said).toBe("3 дела за неделю, сделано 2, не получилось 1, сэкономлено 5 мин");
  });

  it("склонение дел", () => {
    expect(count([deed()]).said).toContain("1 дело");
  });
});

describe("сравнение честное", () => {
  it("больше и меньше — числом", () => {
    const five = count([deed(), deed(), deed(), deed(), deed()]);
    expect(compare(five, count([deed(), deed()]))).toBe("на 3 больше, чем на прошлой неделе");
    expect(compare(count([deed()]), count([deed(), deed()]))).toBe("на 1 меньше, чем на прошлой неделе");
  });

  it("столько же", () => {
    expect(compare(count([deed()]), count([deed()]))).toBe("столько же, сколько на прошлой неделе");
  });

  it("пустая прошлая неделя — не «+100 %»", () => {
    expect(compare(count([deed()]), count([]))).toContain("сравнивать не с чем");
  });

  it("пусто и там, и там", () => {
    expect(compare(count([]), count([]))).toBe("и на прошлой неделе дел не было");
  });
});

describe("время по-человечески", () => {
  it("секунды, минуты, часы", () => {
    expect(time(45_000)).toBe("45 с");
    expect(time(300_000)).toBe("5 мин");
    expect(time(5_400_000)).toBe("1.5 ч");
  });
});

describe("что не считаем", () => {
  it("три запрета, включая время в приложении", () => {
    const got = notCounted().join();
    expect(got).toContain("это не дело");
    expect(got).toContain("сколько раз человек ошибся");
  });
});

describe("окно счёта (сведено из weekCounters)", () => {
  // Единственное полезное, что было в weekCounters: недели не пересекаются.
  const WEEK = 7 * 86_400_000;

  it("граница окна: from включается, to нет", () => {
    expect(between([deed({ at: now - WEEK }), deed({ at: now })], now - WEEK, now).total).toBe(1);
  });

  it("дело на границе двух недель считается один раз, а не дважды", () => {
    const border = now - WEEK;
    const before = between([deed({ at: border })], now - 2 * WEEK, border);
    const after = between([deed({ at: border })], border, now);
    expect(before.total + after.total).toBe(1);
  });
});
