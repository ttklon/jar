import { describe, expect, it } from "vitest";
import { grade, type Profile } from "./machineProfile";
import {
  COMFORT,
  MINIMUM,
  canStart,
  headline,
  judge,
  lost,
  needsWindow,
} from "./requirements";

/**
 * Шаг 231: минимальные требования и окно «машина слабее — вот что будет иначе».
 *
 * Дефект: класс машины (`grade`) вычислялся и использовался — но **только** для
 * частоты замеров. Человеку про его машину не говорили ничего: ни что она
 * слабая, ни что будет иначе, ни что ниже минимума работать не обещано. Он
 * узнавал это первой неудачей.
 */

function machine(ramGb: number, cores: number, vramMb = 0, disk: "ssd" | "hdd" | "unknown" = "ssd"): Profile {
  return {
    cores,
    ramMb: ramGb * 1024,
    disk,
    gpu: { found: vramMb > 0, name: vramMb > 0 ? "видеокарта" : null, vramMb },
  } as Profile;
}

describe("минимум назван числами и это порог запуска", () => {
  it("минимум — 4 ГБ и 2 ядра, а не «примерно»", () => {
    expect(MINIMUM.ramMb).toBe(4 * 1024);
    expect(MINIMUM.cores).toBe(2);
  });

  it("комфорт выше минимума: между ними — работа с оговорками", () => {
    // Если пороги совпадают, то «слабее рекомендуемой» не существует: любая
    // машина либо годится, либо нет.
    expect(COMFORT.ramMb).toBeGreaterThan(MINIMUM.ramMb);
    expect(COMFORT.cores).toBeGreaterThan(MINIMUM.cores);
  });

  it("ниже минимума — отказ с причиной и честным «почему заранее»", () => {
    const verdict = judge(machine(2, 1));
    expect(verdict.state).toBe("below");
    if (verdict.state === "below") {
      expect(verdict.why).toContain("4 ГБ");
      expect(verdict.why).toContain("2 ядер");
      // «Зависание хуже отказа» — это и есть причина сказать заранее.
      expect(verdict.what).toContain("зависанием");
    }
    expect(canStart(verdict)).toBe(false);
  });

  it("ровно на минимуме — уже работаем", () => {
    // Порог — «не меньше», а не «больше»: иначе машина точно на границе
    // получает отказ, которого не заслуживает.
    expect(canStart(judge(machine(4, 2)))).toBe(true);
  });
});

describe("между минимумом и комфортом — «работать будет, но иначе»", () => {
  it("8 ГБ и 4 ядра — не отказ, а список следствий", () => {
    const verdict = judge(machine(8, 4));
    expect(verdict.state).toBe("reduced");
    if (verdict.state === "reduced") {
      expect(verdict.lost.length).toBeGreaterThan(0);
      expect(verdict.why).toContain("работать будет");
    }
    expect(canStart(verdict)).toBe(true);
  });

  it("следствия — про ожидание, а не про числа", () => {
    // «8 ГБ» человек не переводит в ожидание; «ответы будут короче» — переводит.
    const items = lost(machine(6, 4)).join(" ");
    expect(items).toContain("ответы будут короче");
    expect(items).toContain("медленнее");
  });

  it("без видеокарты сказано, что это медленнее, **но работает**", () => {
    // Иначе «без видеокарты» читается как «не будет работать».
    const items = lost(machine(8, 4)).join(" ");
    expect(items).toContain("но работает");
  });

  it("медленный диск назван следствием: первый запуск дольше", () => {
    expect(lost(machine(8, 4, 0, "hdd")).join(" ")).toContain("первый запуск дольше");
  });
});

describe("на сильной машине окна нет", () => {
  it("32 ГБ, 16 ядер, видеокарта — всё как обещано", () => {
    const verdict = judge(machine(32, 16, 8192));
    expect(verdict.state).toBe("fine");
    expect(needsWindow(verdict)).toBe(false);
    expect(headline(verdict)).toBe("Машина подходит.");
  });

  it("предупреждение там, где всё в порядке, — шум, и его перестают читать", () => {
    expect(needsWindow(judge(machine(8, 4)))).toBe(true);
    expect(needsWindow(judge(machine(2, 1)))).toBe(true);
  });
});

describe("две правды об одном не расходятся", () => {
  it("«слабая» по `grade` не бывает «fine» по `judge`", () => {
    // Один модуль говорит «слабая», другой — «всё как обещано»: человек верит
    // тому, что увидел первым, и это дефект, а не мелочь.
    for (const profile of [machine(4, 2), machine(8, 4), machine(16, 8), machine(32, 16, 8192)]) {
      if (grade(profile) === "weak") {
        expect(judge(profile).state).not.toBe("fine");
      }
    }
  });

  it("заголовок у каждого состояния свой, а не один на всех", () => {
    const heads = new Set([
      headline(judge(machine(32, 16, 8192))),
      headline(judge(machine(8, 4))),
      headline(judge(machine(2, 1))),
    ]);
    expect(heads.size).toBe(3);
  });
});
