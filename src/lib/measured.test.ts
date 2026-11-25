import { describe, expect, it } from "vitest";
import { OVERHEAD_MB, fitsHere, line, need, nothingFits, offered, speed, type Item } from "./measured";

/**
 * Шаг 287: Jan/LM Studio — каталог моделей и честные требования по железу.
 *
 * Взято: требования для **этой** машины. Не взято: «рекомендуется 16 ГБ»,
 * звёздочки, «поддерживает до…».
 */

const item = (over: Partial<Item> = {}): Item => ({
  id: "llama3-3b",
  name: "Llama 3 3B",
  diskMb: 2000,
  needMb: 0,
  license: "свободная",
  ...over,
});

describe("требование считается, а не рекомендуется", () => {
  it("нужна не только модель: есть накладные", () => {
    // Файл на диске сжат, а в памяти веса распаковываются и рядом живёт контекст.
    expect(need(item())).toBeGreaterThan(item().diskMb + OVERHEAD_MB - 1);
    expect(need(item())).toBe(Math.round(2000 * 1.1) + OVERHEAD_MB);
  });

  it("не влезает — сказано, сколько не хватает", () => {
    const got = fitsHere(item({ diskMb: 8000 }), 4000);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не хватает");
  });

  it("влезет — сказано, сколько останется", () => {
    expect(fitsHere(item(), 16000).said).toContain("останется");
  });

  it("влезет без запаса — не «влезет»", () => {
    // Система начнёт свопиться, и человек получит не модель, а зависание.
    const free = need(item()) + 200;
    const got = fitsHere(item(), free);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("без запаса");
  });
});

describe("скорость — замером, а не паспортом", () => {
  it("нет замера — «не мерили», а не «быстро»", () => {
    expect(speed(item())).toBe("не мерили на этой машине");
  });

  it("быстрая, средняя и медленная названы по-разному", () => {
    expect(speed(item({ measured: { tokensPerSecond: 30, at: 0 } }))).toContain("быстрее");
    expect(speed(item({ measured: { tokensPerSecond: 10, at: 0 } }))).toContain("как речь");
    expect(speed(item({ measured: { tokensPerSecond: 1, at: 0 } }))).toContain("слишком медленно");
  });
});

describe("каталог отсортирован для этой машины", () => {
  it("влезающие раньше невлезающих", () => {
    const big = item({ id: "big", diskMb: 30000 });
    const small = item({ id: "small", diskMb: 1000 });
    expect(offered([big, small], 8000).map((entry) => entry.id)).toEqual(["small", "big"]);
  });

  it("внутри влезающих — по скорости замера", () => {
    const slow = item({ id: "slow", diskMb: 500, measured: { tokensPerSecond: 5, at: 0 } });
    const fast = item({ id: "fast", diskMb: 1500, measured: { tokensPerSecond: 25, at: 0 } });
    expect(offered([slow, fast], 16000).map((entry) => entry.id)).toEqual(["fast", "slow"]);
  });

  it("без замера — по размеру: маленькая полезнее большой", () => {
    const big = item({ id: "big", diskMb: 9000 });
    const small = item({ id: "small", diskMb: 900 });
    expect(offered([big, small], 32000).map((entry) => entry.id)).toEqual(["small", "big"]);
  });
});

describe("строка каталога отвечает на вопрос целиком", () => {
  it("диск, память, скорость и вывод", () => {
    const got = line(item(), 16000);
    expect(got).toContain("диск");
    expect(got).toContain("память");
    expect(got).toContain("не мерили");
    expect(got).toContain("влезет");
  });

  it("ничего не влезает — сказано, что делать", () => {
    expect(nothingFits(2000)).toContain("закройте лишние программы");
  });
});
