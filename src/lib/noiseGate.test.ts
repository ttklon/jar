import { describe, expect, it } from "vitest";
import { MARGIN_DB, db, gate, gateLine, nextFloor, noiseFloor, speaking } from "./noiseGate";

/**
 * Шаг 43: порог шума подстраивается — «я говорю» или «телевизор говорит».
 *
 * Одно число не бывает верным и в тихой комнате, и в шумной: в тихой порог ловит
 * холодильник, в шумной человек не может дотянуться до порога. Отсюда два слоя —
 * фон и запас над ним.
 */
describe("фон", () => {
  it("фон берётся по тихим замерам, а не по среднему", () => {
    // Среднее поднимает речь и шум — и порог уезжает вверх ровно тогда, когда
    // человек говорит. Медиана тихой трети не боится ни щелчка, ни слова.
    const levels = [0.01, 0.012, 0.011, 0.2, 0.3, 0.4];
    const floor = noiseFloor(levels);
    expect(floor).toBeGreaterThan(0.01);
    expect(floor).toBeLessThan(0.015);
  });

  it("один щелчок не сдвигает фон", () => {
    const quiet = [0.01, 0.011, 0.012, 0.01, 0.011, 0.012];
    expect(noiseFloor([...quiet, 0.9])).toBeCloseTo(noiseFloor(quiet), 3);
  });

  it("тишины нет — и фона нет", () => {
    expect(noiseFloor([])).toBe(0);
    expect(noiseFloor([0, 0])).toBe(0);
  });
});

describe("порог", () => {
  it("порог — фон плюс запас, и запас в децибелах", () => {
    // Удвоение громкости — +6 дБ; в тихой комнате этого мало, в шумной много.
    // Поэтому запас считается от фона, а не от порога.
    const floor = 0.01; // -40 дБ
    const threshold = gate(floor);
    const thresholdDb = db(threshold);
    expect(Math.round(thresholdDb)).toBe(-40 + MARGIN_DB);
  });

  it("тише комната — ниже порог; громче — выше", () => {
    expect(gate(0.001)).toBeLessThan(gate(0.01));
    expect(gate(0.01)).toBeLessThan(gate(0.1));
  });

  it("порог не уходит в бесконечность и не падает в ноль", () => {
    // Без нижней границы в полной тишине порог равен нулю и ловит дыхание; без
    // верхней в шумной комнате он уходит так высоко, что человека не слышно.
    const quiet = gate(0);
    const loud = gate(10);
    expect(quiet).toBeGreaterThan(0);
    expect(Number.isFinite(loud)).toBe(true);
    expect(loud).toBeLessThan(1);
  });

  it("речь слышна, шум — нет", () => {
    const floor = 0.01;
    expect(speaking(0.2, floor)).toBe(true); // человек говорит
    expect(speaking(0.011, floor)).toBe(false); // холодильник
  });
});

describe("подстройка", () => {
  it("речь не двигает фон — иначе человек глушит себя своим голосом", () => {
    const floor = 0.01;
    expect(nextFloor(floor, 0.5)).toBe(floor);
  });

  it("тишина двигает фон плавно: один замер не сдвигает порог", () => {
    const floor = 0.01;
    const after = nextFloor(floor, 0.02, 0.05);
    expect(after).toBeGreaterThan(floor);
    expect(after).toBeLessThan(0.011); // сдвинулся на малую долю, а не на всё
  });

  it("фон называется числами, а не «подстроен»", () => {
    // «Порог подстроен» без чисел — то же «готово», от которого мы ушли.
    const line = gateLine(0.01, gate(0.01));
    expect(line).toContain("дБ");
    expect(line).toContain("фон");
    expect(line).toContain("порог");
  });
});
