import { describe, expect, it } from "vitest";
import { DEFAULT_CHOICE, parseChoice, prefersDark, resolveTheme } from "./theme";

describe("тема окна", () => {
  it("«как в системе» следует системе, а явный выбор — сильнее системы", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    // Система светлая, а человек выбрал тёмную — побеждает человек.
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("умолчание не переключает окно у тех, кто уже пользовался приложением", () => {
    // Раньше тема была зашита тёмной. Смена умолчания на «как в системе» показала бы
    // этим людям другое окно без их согласия.
    expect(DEFAULT_CHOICE).toBe("dark");
  });

  it("испорченное значение не ломает запуск", () => {
    expect(parseChoice(null)).toBeNull();
    expect(parseChoice("")).toBeNull();
    expect(parseChoice("тёмная")).toBeNull();
    expect(parseChoice("system")).toBe("system");
  });

  it("если движок не умеет рассказать о системе — не падаем", () => {
    expect(prefersDark(() => true)).toBe(true);
    expect(prefersDark(() => false)).toBe(false);
    expect(
      prefersDark(() => {
        throw new Error("matchMedia нет");
      }),
    ).toBe(true);
  });
});
