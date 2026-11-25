import { describe, expect, it } from "vitest";
import { POINTS, fair, score, total, verdict, whatOf, type Compare, type Point } from "./benchmark";

/**
 * Шаг 297: сравнение с двумя прямыми конкурентами по пяти пунктам сценария.
 *
 * Списком функций выигрывает тот, у кого их больше, — а это ровно то соревнование,
 * в котором пользователю хуже.
 */

const point = (id: Point["id"], us: Point["us"], them: Point["them"], over: Partial<Point> = {}): Point => ({
  id,
  what: whatOf(id),
  us,
  them,
  why: "проверяли руками на одном сценарии в ноябре",
  ...over,
});

const good: Compare = {
  name: "Jan",
  points: [
    point("find", "partial", "yes"),
    point("say", "yes", "partial"),
    point("do", "yes", "no"),
    point("offline", "yes", "yes", { why: "обе работают без сети, разница только в руках" }),
    point("refusal", "yes", "partial"),
  ],
};

// «offline» одинаково у обоих — поэтому в этом сравнении правило «одинаково — подозрительно» надо
// проверить отдельно, а здесь оно ожидаемо.
const honest: Compare = {
  ...good,
  points: good.points.map((item) =>
    item.id === "offline" ? { ...item, us: "yes" as const, them: "partial" as const } : item,
  ),
};

describe("пять пунктов, и их нельзя выкинуть", () => {
  it("ровно пять и все названы", () => {
    expect(POINTS.length).toBe(5);
    expect(POINTS.map(whatOf)).toEqual(["найти", "сказать", "сделать", "без сети", "понять отказ"]);
  });

  it("пропущенный пункт — подогнанное сравнение", () => {
    const got = fair({ name: "Jan", points: honest.points.filter((item) => item.id !== "do") });
    expect(got.ok).toBe(false);
    expect(got.problems.join()).toContain("пункт «сделать» пропущен");
  });

  it("пункт без объяснения не считается", () => {
    const got = fair({ name: "Jan", points: honest.points.map((item) => (item.id === "find" ? { ...item, why: "очевидно" } : item)) });
    expect(got.problems.join()).toContain("«найти» без объяснения");
  });
});

describe("счёт не прячет проигрыш", () => {
  it("«частично» — половина, а не «наверное, да»", () => {
    expect(score("yes")).toBe(1);
    expect(score("partial")).toBe(0.5);
    expect(score("no")).toBe(0);
  });

  it("сумма по пяти пунктам", () => {
    expect(total(honest.points)).toEqual({ us: 4.5, them: 2.5 });
  });

  it("проигрыш назван по пункту", () => {
    const got = verdict(honest);
    expect(got).toContain("они лучше — найти");
    expect(got).toContain("мы лучше — сказать, сделать");
  });

  it("ничья видна отдельно", () => {
    expect(verdict({ ...honest, points: honest.points.map((item) => (item.id === "refusal" ? { ...item, them: "yes" as const } : item)) })).toContain("одинаково — 1");
  });
});

describe("честность проверяется машинно", () => {
  it("победа во всех пяти — сравнение не проверяли", () => {
    const got = fair({ ...honest, points: honest.points.map((item) => ({ ...item, them: "no" as const })) });
    expect(got.ok).toBe(false);
    expect(got.problems.join()).toContain("не проверяли");
  });

  it("одинаково у обоих — подозрительно, требуем объяснения", () => {
    // В хорошей таблице такое бывает, поэтому это не «ошибка», а повод перепроверить.
    const got = fair(good);
    expect(got.problems.join()).toContain("одинаково");
  });

  it("честное сравнение проходит", () => {
    const got = fair(honest);
    expect(got.ok).toBe(true);
    expect(got.problems).toEqual([]);
  });

  it("два конкурента проверяются одинаково строго", () => {
    const second: Compare = { ...honest, name: "LM Studio" };
    expect(fair(second).ok).toBe(true);
  });
});
