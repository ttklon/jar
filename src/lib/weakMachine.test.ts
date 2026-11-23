import { describe, expect, it } from "vitest";
import { forModel, grade, gpuUsable, say, type Profile } from "./machineProfile";
import { fits, pick, speedWord, STEPS, warning } from "./modelLadder";
import { choose } from "./modelRoles";

/**
 * Шаг 70: на профиле «слабая машина» выбирается 1.5B, не 7B.
 *
 * Это проверка **не правила, а обещания**: приложение не делает вид, что
 * справится. Слабая машина — это 4 ГБ памяти и два ядра, и на ней 7B либо не
 * загрузится, либо будет свопиться так, что человек уйдёт.
 */

/** Слабая машина: 4 ГБ, два ядра, без видеокарты, обычный диск. */
const weak: Profile = {
  cores: 2,
  ramMb: 4 * 1024,
  gpu: { found: false, vramMb: 0, name: null },
  disk: "hdd",
  at: 0,
};

/** Обычная машина: 16 ГБ, восемь ядер. */
const medium: Profile = {
  cores: 8,
  ramMb: 16 * 1024,
  gpu: { found: false, vramMb: 0, name: null },
  disk: "ssd",
  at: 0,
};

/** Сильная: 32 ГБ и видеокарта от 8 ГБ. */
const strong: Profile = {
  cores: 16,
  ramMb: 32 * 1024,
  gpu: { found: true, vramMb: 8192, name: "RTX 4060" },
  disk: "ssd",
  at: 0,
};

describe("слабая машина получает 1.5B, а не 7B", () => {
  it("класс назван слабым, а не «средним на всякий случай»", () => {
    expect(grade(weak)).toBe("weak");
    expect(gpuUsable(weak)).toBe(false);
  });

  it("память для модели — остаток после системы, и он честный", () => {
    // 4 ГБ минус гигабайт системе = 3 ГБ. Раньше правило отдавало 1 ГБ, и
    // приложение отказывалось работать там, где 1.5B живёт нормально.
    expect(forModel(weak)).toBe(3 * 1024);
  });

  it("из лестницы помещается ровно 1.5B", () => {
    // Не 7B: 7B требует 6.1 ГБ, а на машине всего 4.
    const fit = fits(forModel(weak));
    expect(fit.map((step) => step.name)).toEqual(["0.5B", "1.5B"]);
    expect(pick(forModel(weak))?.name).toBe("1.5B");
  });

  it("7B не предлагается даже «попробовать»", () => {
    // «Может, пойдёт» — это лотерея, и проигрыш человек спишет на приложение.
    expect(fits(forModel(weak)).some((step) => step.name === "7B")).toBe(false);
    expect(pick(forModel(weak))?.name).not.toBe("7B");
  });
});

describe("сильная машина не наказана за хорошее железо", () => {
  it("на 32 ГБ выбирается 7B", () => {
    expect(grade(strong)).toBe("strong");
    expect(pick(forModel(strong))?.name).toBe("7B");
  });

  it("обычная машина получает 7B, потому что влезает", () => {
    // 16 ГБ: 7 ГБ модели помещаются.
    expect(grade(medium)).toBe("medium");
    expect(pick(forModel(medium))?.name).toBe("7B");
  });
});

describe("приложение не делает вид, что справится", () => {
  it("на слабой машине сказано, что считать будет на процессоре", () => {
    // Голые цифры человек не переведёт в ожидание.
    expect(say(weak)).toContain("процессоре");
  });

  it("потери ступени названы заранее, а не после разочарования", () => {
    const step = pick(forModel(weak));
    expect(step).not.toBeNull();
    expect(warning(step!)).toContain(step!.loses);
  });

  it("скорость 1.5B на слабой машине не выдаётся за паспортную", () => {
    // Без замера подпись честно говорит «по паспорту».
    const step = STEPS[1]!;
    expect(speedWord({ step, measured: null, passport: 20 })).toContain("по паспорту");
  });

  it("«понять фразу» и на слабой машине — самая дешёвая", () => {
    // Разбор намерения не требует 7B ни на какой машине (шаг 66).
    const models = [
      { name: "0.5B", sizeMb: 400, code: false, embed: false },
      { name: "1.5B", sizeMb: 1100, code: false, embed: false },
      { name: "7B", sizeMb: 4600, code: true, embed: false },
    ];
    expect(choose("intent", models).model?.name).toBe("0.5B");
  });
});
