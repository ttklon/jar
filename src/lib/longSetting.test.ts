import { describe, expect, it } from "vitest";
import { DEFAULT_S, effective, hint, load, MAX_S, MIN_S, ms, read, save, suggest } from "./longSetting";

/**
 * Шаг 139: порог «слишком долго» настраивается человеком.
 *
 * На слабой машине зашитые 4 с превращали норму в «это зависло».
 */
const previous = { seconds: 4, origin: "chosen" as const };

describe("порог задаёт человек", () => {
  it("выбранное значение действует", () => {
    const got = read("12", previous);
    expect(got.setting).toEqual({ seconds: 12, origin: "chosen" });
    expect(got.said).toContain("порог 12 с");
  });

  it("по умолчанию — названное число, а не «сколько-то»", () => {
    expect(load(null).said).toBe(`порог по умолчанию: ${DEFAULT_S} с`);
  });

  it("поле объясняет единицу и смысл", () => {
    expect(hint()).toContain(`${MIN_S}–${MAX_S} с`);
    expect(hint()).toContain("спрошу, ждать ли");
  });
});

describe("границы названы, а не спрятаны", () => {
  it("меньше минуты-порога нельзя — вопросы на ровном месте", () => {
    const got = read("0", previous);
    expect(got.setting.seconds).toBe(MIN_S);
    expect(got.said).toContain(`меньше ${MIN_S} с нельзя`);
  });

  it("больше — вечный спиннер, и так и сказано", () => {
    const got = read("600", previous);
    expect(got.setting.seconds).toBe(MAX_S);
    expect(got.said).toContain("«долго» не наступит никогда");
  });
});

describe("кривое значение не ломает порог", () => {
  it("«abc» — оставляем прежнее, и говорим почему", () => {
    const got = read("abc", previous);
    expect(got.setting).toBe(previous);
    expect(got.said).toContain("не число");
  });

  it("пусто — тоже прежнее, а не сброс на умолчание", () => {
    expect(read("  ", previous).setting).toBe(previous);
  });

  it("запятая вместо точки понимается", () => {
    expect(read("7,5", previous).setting.seconds).toBe(7.5);
  });
});

describe("сохранение и чтение", () => {
  it("сохраняется одним числом и читается обратно", () => {
    const setting = read("9", previous).setting;
    expect(load(save(setting)).setting.seconds).toBe(9);
  });

  it("мусор в хранилище — по умолчанию, с объяснением", () => {
    expect(load("не число").said).toContain("оставляю");
  });
});

describe("порог действует так, как сказано", () => {
  it("меньше порога — не спрашиваем", () => {
    expect(effective({ seconds: 10, origin: "chosen" }, 4000).ask).toBe(false);
  });

  it("больше — «ждать?» с числом", () => {
    const got = effective({ seconds: 10, origin: "chosen" }, 12_000);
    expect(got.ask).toBe(true);
    expect(got.said).toContain("дольше 10 с");
  });

  it("порог в проверке — миллисекунды, а человек видит секунды", () => {
    expect(ms({ seconds: 7, origin: "chosen" })).toBe(7000);
  });
});

describe("слабая машина — предложение, а не решение", () => {
  it("предлагает порог по факту, а не решает за человека", () => {
    expect(suggest(true, 8000)).toContain("поставить порог 9 с?");
  });

  it("сильная машина — ничего не предлагаем", () => {
    expect(suggest(false, 8000)).toBe("");
  });
});
