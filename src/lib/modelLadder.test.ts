import { describe, expect, it } from "vitest";
import {
  faster,
  fits,
  nothing,
  OVERHEAD_MB,
  pick,
  speedWord,
  STEPS,
  warning,
  type Speed,
} from "./modelLadder";

/**
 * Шаг 63: лестница 0.5B / 1.5B / 3B / 7B с честными замерами на этой машине.
 *
 * «Какая модель лучше» — вопрос без ответа: паспорт мерян на чужом железе.
 */
describe("ступени — не хорошая и плохая, а разные компромиссы", () => {
  it("каждая ступень названа по размеру и что теряет", () => {
    // Выбирают не «лучшую модель», а потери, которые устраивают.
    expect(STEPS.map((step) => step.name)).toEqual(["0.5B", "1.5B", "3B", "7B"]);
    for (const step of STEPS) {
      expect(step.loses.length).toBeGreaterThan(0);
      expect(step.good.length).toBeGreaterThan(0);
    }
  });

  it("большая ступень требует больше памяти", () => {
    const needs = STEPS.map((step) => step.needsMb);
    expect(needs).toEqual([...needs].sort((a, b) => a - b));
    // Запас сверх размера: модель в памяти — это не только веса.
    expect(STEPS[3]?.needsMb).toBe((STEPS[3]?.sizeMb ?? 0) + OVERHEAD_MB);
  });
});

describe("что влезает на этой машине", () => {
  it("на 8 ГБ влезают все ступени, на 2 ГБ — только маленькая", () => {
    expect(fits(8192).map((step) => step.name)).toEqual(["0.5B", "1.5B", "3B", "7B"]);
    expect(fits(2000).map((step) => step.name)).toEqual(["0.5B"]);
  });

  it("предлагается самая большая из влезающих", () => {
    // Если машина тянет 3B, предлагать 0.5B — наказывать человека за хорошее
    // железо.
    expect(pick(8192)?.name).toBe("7B");
    expect(pick(4000)?.name).toBe("3B");
    expect(pick(2000)?.name).toBe("0.5B");
  });

  it("не влезает ничего — не молчим и не приговариваем железо", () => {
    // 0.5B требует 1.9 ГБ и влезает почти везде; пустой список значит, что
    // свободной памяти почти нет.
    expect(pick(100)).toBeNull();
    expect(nothing()).toContain("закройте");
  });

  it("ступень, которая не влезает, не предлагается вовсе", () => {
    // «Попробуйте, может, пойдёт» — не выбор, а лотерея; проигрыш человек
    // спишет на приложение.
    expect(fits(5000).some((step) => step.name === "7B")).toBe(false);
  });
});

describe("замер на этой машине главнее паспорта", () => {
  const speed = (name: string, measured: number | null, passport: number): Speed => {
    const step = STEPS.find((item) => item.name === name) ?? STEPS[0]!;
    return { step, measured, passport };
  };

  it("замер решает, кто быстрее", () => {
    // На этой машине 3B с замером обгоняет 7B — и это правда, которую паспорт
    // скрывает.
    const three = speed("3B", 18, 10);
    const seven = speed("7B", 6, 9);
    expect(faster(three, seven).step.name).toBe("3B");
  });

  it("без замера берём паспорт", () => {
    expect(faster(speed("3B", null, 10), speed("7B", null, 9)).step.name).toBe("3B");
  });

  it("подпись называет, откуда число", () => {
    // «По паспорту» и «на этой машине» — разные вещи.
    expect(speedWord(speed("7B", null, 9))).toContain("по паспорту");
    expect(speedWord(speed("7B", 8.66, 9))).toContain("на этой машине");
    expect(speedWord(speed("7B", 8.66, 9))).not.toContain("по паспорту");
  });

  it("дробное число не превращается в полотно", () => {
    expect(speedWord(speed("7B", 8.66, 9))).toContain("8.7");
  });
});

describe("потери ступени названы заранее", () => {
  it("человек видит, что теряет, до выбора", () => {
    const step = STEPS[0]!;
    const said = warning(step);
    expect(said).toContain("0.5B");
    expect(said).toContain(step.loses);
  });
});
