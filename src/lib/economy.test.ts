import { describe, expect, it } from "vitest";
import { cadence } from "./machineProfile";
import {
  ECONOMY_ANIMATION_MS,
  ECONOMY_CADENCE,
  NORMAL_ANIMATION_MS,
  describe as describeMode,
  look,
  parse,
  work,
  type Work,
} from "./economy";

/**
 * Шаг 232: режим «экономный» — реже замеры, меньше анимаций, **та же работа**.
 *
 * Дефект: частота замеров зависела только от **железа**. Человек на батарее не
 * мог ничего попросить, а человек на слабой машине не мог попросить чаще — хотя
 * ему прогресс важнее экономии. Экономия была приговором, а не выбором.
 */

const STRONG = cadence("strong");
const WEAK = cadence("weak");

describe("реже замеры, но не до «зависло»", () => {
  it("в экономном режиме опрос раз в 5 секунд", () => {
    expect(look("economy", STRONG).cadence.poll).toBe(5000);
    expect(look("economy", WEAK).cadence.poll).toBe(5000);
  });

  it("и это одинаково на любом железе: режим — выбор, а не приговор", () => {
    // На сильной машине человек тоже бывает на батарее.
    expect(look("economy", STRONG).cadence).toEqual(look("economy", WEAK).cadence);
  });

  it("чаще пяти секунд — предел: реже человек решит, что зависло", () => {
    expect(ECONOMY_CADENCE.poll).toBeLessThanOrEqual(5000);
    expect(ECONOMY_CADENCE.progress).toBeLessThanOrEqual(5000);
  });

  it("таймер разговора не тронут: он считает, а не измеряет", () => {
    // «Реже» сделало бы его врущим про длительность.
    expect(ECONOMY_CADENCE.clock).toBe(1000);
    expect(ECONOMY_CADENCE.clock).toBe(STRONG.clock);
  });

  it("в обычном режиме частота остаётся по железу", () => {
    expect(look("auto", STRONG).cadence).toEqual(STRONG);
    expect(look("auto", WEAK).cadence).toEqual(WEAK);
  });
});

describe("меньше анимаций — но они есть", () => {
  it("коротко, а не ноль", () => {
    // `0` выглядит заманчиво и читается как «интерфейс сломался»: исчезновение
    // всякого движения — не экономия, а сюрприз.
    expect(ECONOMY_ANIMATION_MS).toBeGreaterThan(0);
    expect(ECONOMY_ANIMATION_MS).toBeLessThan(NORMAL_ANIMATION_MS);
  });

  it("обычный режим анимации не укорачивает", () => {
    expect(look("auto", STRONG).animationMs).toBe(NORMAL_ANIMATION_MS);
  });
});

describe("работа та же — главное правило режима", () => {
  const actual: Work = {
    actions: 835,
    confirmFrom: "destructive",
    refusal: "деньги и учётные данные — только человек",
  };

  it("набор действий не зависит от режима", () => {
    expect(work(actual, "economy")).toEqual(work(actual, "auto"));
  });

  it("порог подтверждения не сдвигается", () => {
    // Экономить на безопасности — не экономия.
    expect(work(actual, "economy").confirmFrom).toBe("destructive");
    expect(work(actual, "economy").confirmFrom).toBe(work(actual, "auto").confirmFrom);
  });

  it("текст отказа не сокращается и не смягчается", () => {
    expect(work(actual, "economy").refusal).toBe(actual.refusal);
    expect(work(actual, "economy").refusal).toContain("только человек");
  });
});

describe("молчаливое изменение читается как сбой", () => {
  it("в экономном режиме есть фраза с числами", () => {
    const note = look("economy", STRONG).note ?? "";
    expect(note).toContain("5 секунд");
    expect(note).toContain("работа та же");
  });

  it("в обычном режиме говорить нечего", () => {
    expect(look("auto", STRONG).note).toBeNull();
  });

  it("режим назван и в журнале", () => {
    expect(describeMode("economy")).toContain("экономный");
    expect(describeMode("auto")).toContain("обычный");
  });
});

describe("включать экономию вместо человека нельзя", () => {
  it("незнакомое значение — `auto`, а не `economy`", () => {
    // Иначе испорченная настройка «экономит» за человека, и он не знает почему.
    expect(parse("economy")).toBe("economy");
    expect(parse(null)).toBe("auto");
    expect(parse("")).toBe("auto");
    expect(parse("чушь")).toBe("auto");
  });
});
