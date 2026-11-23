import { describe, expect, it } from "vitest";
import { assumed, best, howKnown, offered, outcome, say, type Cpu } from "./cpuFeatures";

/**
 * Шаг 78: проверка совместимости с железом (AVX2/AVX512/GPU).
 *
 * Тихая деградация худшая из всех: модель работает втрое медленнее, человек
 * думает «эта модель медленная» и выбирает меньшую — а дело было не в модели.
 */
const cpu = (over: Partial<Cpu> = {}): Cpu => ({ avx2: true, avx512: false, gpu: false, ...over });

describe("без AVX2 медленно, но работает", () => {
  it("AVX2 есть — быстро", () => {
    expect(outcome(cpu(), "avx2")).toBe("fast");
  });

  it("AVX2 нет — медленно, а не отказ", () => {
    // Движок откатывается на скалярный код: работает, но втрое медленнее.
    expect(outcome(cpu({ avx2: false }), "avx2")).toBe("slow");
    expect(offered(cpu({ avx2: false }), "avx2")).toBe(true);
  });

  it("сказано, чего ждать, а не название инструкции", () => {
    const said = say(cpu({ avx2: false }), "avx2");
    expect(said).toContain("втрое медленнее");
    expect(said).toContain("работает");
  });
});

describe("AVX512 без него — падение, а не «медленнее»", () => {
  it("требует AVX512, его нет — запускать нельзя", () => {
    // Предложить то, что падает, значит устроить поломку на ровном месте.
    expect(outcome(cpu({ avx512: false }), "avx512")).toBe("crash");
    expect(offered(cpu({ avx512: false }), "avx512")).toBe(false);
  });

  it("падение объяснено причиной", () => {
    expect(say(cpu(), "avx512")).toContain("AVX512");
    expect(say(cpu(), "avx512")).toContain("падение");
  });

  it("есть AVX512 — быстро", () => {
    expect(outcome(cpu({ avx512: true }), "avx512")).toBe("fast");
  });
});

describe("видеокарта — отдельная проверка", () => {
  it("без видеокарты считаем на процессоре, и это не сбой", () => {
    expect(outcome(cpu({ gpu: false }), "gpu")).toBe("slow");
    expect(offered(cpu({ gpu: false }), "gpu")).toBe(true);
    expect(say(cpu({ gpu: false }), "gpu")).toContain("процессоре");
  });

  it("с видеокартой — на ней", () => {
    expect(outcome(cpu({ gpu: true }), "gpu")).toBe("fast");
    expect(say(cpu({ gpu: true }), "gpu")).toContain("видеокарта");
  });
});

describe("выбор безопасной сборки", () => {
  it("берётся лучшая из работающих, а не самая быстрая вообще", () => {
    // Не давать медленное, когда есть быстрое; и не давать падающее.
    expect(best(cpu({ avx512: true }))).toBe("avx512");
    expect(best(cpu({ avx2: true }))).toBe("avx2");
    expect(best(cpu({ avx2: false }))).toBe("plain");
  });

  it("plain работает везде", () => {
    expect(outcome(cpu({ avx2: false, avx512: false }), "plain")).toBe("fast");
  });
});

describe("неизвестное не выдаётся за известное", () => {
  it("в браузере инструкций не видно — так и сказано", () => {
    expect(howKnown(false)).toContain("не виден");
    expect(howKnown(true)).toContain("прочитан");
  });

  it("по умолчанию — безопасно: AVX2 есть, AVX512 нет", () => {
    // Лучше медленнее, чем падение.
    expect(assumed()).toEqual({ avx2: true, avx512: false, gpu: false });
    expect(offered(assumed(), "avx512")).toBe(false);
    expect(offered(assumed(), "avx2")).toBe(true);
  });
});
