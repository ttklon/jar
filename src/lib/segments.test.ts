import { describe, expect, it } from "vitest";
import { compare, delta, gaps, lines, measured, ORDER, slowest, word, type Trace } from "./segments";

/**
 * Шаг 121: замерять каждый отрезок.
 *
 * «Отвечает 4 секунды» — а какие именно? Чинили модель, а 3 из 4 секунд уходили на
 * распознавание.
 */
const trace: Trace = {
  parts: { phrase: 400, text: 1200, plan: 60, token: 1800, sound: 300, deed: 200 },
  total: 4020,
};

describe("шесть отрезков, названных по делу", () => {
  it("порядок — как в жизни", () => {
    expect(ORDER).toEqual(["phrase", "text", "plan", "token", "sound", "deed"]);
  });

  it("каждый отрезок называет себя по-русски", () => {
    expect(word("token")).toBe("первый токен");
    expect(word("sound")).toBe("первый звук");
  });

  it("замер — миллисекунды, а не «быстро»", () => {
    expect(lines(trace).every((line) => /мс|всего/.test(line))).toBe(true);
  });
});

describe("самый длинный отрезок назван", () => {
  it("чинить надо первый токен, а не модель вообще", () => {
    const slow = slowest(trace);
    expect(slow?.kind).toBe("token");
    expect(slow?.ms).toBe(1800);
  });

  it("доля считается от учтённого времени", () => {
    const said = lines(trace).find((line) => line.startsWith("дольше всего")) ?? "";
    expect(said).toContain("первый токен");
    expect(said).toContain("%");
  });
});

describe("сумма сходится с целым, или расхождение названо", () => {
  it("сумма отрезков равна целому", () => {
    expect(measured(trace)).toBe(3960);
  });

  it("скрытое время не исчезает: оно названо", () => {
    // Время, которое никуда не попало, — и есть настоящая причина жалоб.
    const leaky: Trace = { parts: { phrase: 100, text: 200 }, total: 2000 };
    const got = gaps(leaky);
    expect(got.missing).toBe(1700);
    expect(got.said).toContain("никуда не попало");
  });

  it("небольшое расхождение — не шум, а допуск измерения", () => {
    // Измерения разных часов не сходятся до миллисекунды.
    expect(gaps({ parts: { phrase: 100 }, total: 110 }).said).toBe("");
  });
});

describe("отрезка не было — это не ноль", () => {
  it("пропущенный отрезок не печатается нулём", () => {
    // Ноль значил бы «мгновенно», а «модель не вызывалась» — другое.
    const noModel: Trace = { parts: { phrase: 100, text: 200, token: null }, total: 300 };
    expect(lines(noModel).some((line) => line.includes("первый токен"))).toBe(false);
  });

  it("сравнение пропускает отрезки, которых не было", () => {
    // В «без модели» отрезка `token` нет **вовсе** (`undefined`), а не `null`:
    // `null` — «вызывали, но не замерили», `undefined` — «не было».
    const withModel: Trace = { parts: { text: 200, token: 900 }, total: 1100 };
    const without: Trace = { parts: { text: 200 }, total: 200 };
    const changed = compare(without, withModel);
    // Появившийся отрезок — изменение: «0 → 900 мс» это ровно то, что случилось.
    expect(changed.map((item) => item.kind)).toEqual(["token"]);
    expect(changed[0]?.delta).toBe(900);
    // Отрезок пропал — тоже изменение, и так же назван.
    expect(compare(withModel, without).map((item) => item.kind)).toEqual(["token"]);
  });
});

describe("«стало лучше» проверяется по отрезкам", () => {
  it("ускорение одной части при замедлении другой видно по частям", () => {
    const after: Trace = { ...trace, parts: { ...trace.parts, token: 700, text: 1600 }, total: 2760 };
    const said = delta(trace, after);
    expect(said).toContain("быстрее");
    expect(said).toContain("первый токен -1100");
    expect(said).toContain("текст +400");
  });

  it("в пределах 20 мс — не изменение", () => {
    expect(delta(trace, { ...trace, total: trace.total + 10 })).toContain("не изменилась");
  });
});
