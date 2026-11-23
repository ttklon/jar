import { describe, expect, it } from "vitest";
import { choose, DEFAULT, FORBIDDEN, level, LEVELS, say, sizeMb, upgrade, whyNotSmaller } from "./quant";

/**
 * Шаг 64: Q4_K_M по умолчанию; Q8 только когда железо доказано.
 *
 * На сайте модели лежит «лучший» вариант, и человек тянет Q8: памяти вдвое
 * больше, скорость вдвое ниже — и разницы в ответах не замечает.
 */
describe("умолчание не требует решения", () => {
  it("по умолчанию всегда Q4_K_M", () => {
    // Точка, где качество почти не отличается от полного, а размер вдвое меньше.
    expect(choose().kind).toBe("Q4_K_M");
    expect(choose().kind).toBe(DEFAULT);
  });

  it("Q2 и Q3 не предлагаются вовсе", () => {
    // Не компромисс, а поломка: модель путает факты и обрывает мысль.
    for (const kind of FORBIDDEN) {
      expect(level(kind)?.offered).toBe(false);
      expect(LEVELS.some((item) => item.kind === kind && item.offered)).toBe(false);
    }
  });

  it("потери названы тем, что человек увидит, а не процентами", () => {
    // Проценты никто не переводит в опыт.
    expect(level("Q4_K_M")?.loss).toContain("почти не отличается");
    expect(level("Q2_K")?.loss).toContain("глупеет");
    expect(level("Q3_K_M")?.loss).toContain("контекст");
  });
});

describe("Q8 — только по доказанной причине", () => {
  it("без замера и без запаса памяти — остаёмся на Q4", () => {
    // Иначе человек платит памятью за точность, которой не увидит.
    expect(upgrade(false, 100_000).kind).toBe("Q4_K_M");
    expect(upgrade(true, 1024).kind).toBe("Q4_K_M");
  });

  it("замер и запас есть — Q8 оправдан", () => {
    expect(upgrade(true, 8192).kind).toBe("Q8_0");
  });

  it("«может, будет лучше» — не причина", () => {
    // Именно это условие: замер на этой машине, а не паспорт.
    expect(upgrade(false, 8192).kind).toBe("Q4_K_M");
  });
});

describe("цена названа до загрузки", () => {
  it("размер растёт с битами на вес", () => {
    const q4 = sizeMb(7, "Q4_K_M");
    const q8 = sizeMb(7, "Q8_0");
    expect(q8).toBeGreaterThan(q4);
    // Q8 примерно вдвое больше — это и есть та цена.
    expect(q8 / q4).toBeGreaterThan(1.5);
  });

  it("7B в Q4 — около 4.4 ГБ, а не «сколько-то»", () => {
    const mb = sizeMb(7, "Q4_K_M");
    expect(mb).toBeGreaterThan(4000);
    expect(mb).toBeLessThan(4800);
  });

  it("сказано и название, и цена, и что это умолчание", () => {
    // Иначе человек ищет, где «включить лучше».
    const said = say("Q4_K_M", 7);
    expect(said).toContain("Q4_K_M");
    expect(said).toContain("ГБ");
    expect(said).toContain("по умолчанию");
  });

  it("про Q8 сказано, что точность доказана замером", () => {
    expect(say("Q8_0", 7)).toContain("доказано");
  });
});

describe("ответ на «а можно поменьше?»", () => {
  it("объясняет, что потеряется, а не говорит «нельзя»", () => {
    const said = whyNotSmaller();
    expect(said).toContain("поломка");
    expect(said).toContain("путает");
  });
});
