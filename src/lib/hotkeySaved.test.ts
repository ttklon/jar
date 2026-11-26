import { describe, expect, it } from "vitest";
import { assign, cases, current, notDo, shown, suggest, whenUnknown } from "./hotkeySaved";
import { format, type Combo } from "./hotkeyFree";

/**
 * Шаг 452: проверка занятости горячей клавиши до сохранения.
 */

const want: Combo = { mods: ["ctrl", "shift"], key: "t" };
const currentCombo: Combo = { mods: ["ctrl", "alt"], key: "space" };

describe("свободна — сохраняется", () => {
  it("сказано, что сохранил", () => {
    const got = assign(want, currentCombo, []);
    expect(got.saved).toBe(true);
    expect(got.active).toEqual(want);
    expect(got.said).toContain("сохранил");
  });
});

describe("занята — не сохраняется, прежняя остаётся", () => {
  it("прежняя клавиша действует", () => {
    const got = assign(want, currentCombo, ["ctrl+shift+t"]);
    expect(got.saved).toBe(false);
    expect(got.active).toEqual(currentCombo);
    expect(got.said).toContain("Прежняя клавиша осталась");
  });

  it("системная — тоже отказ", () => {
    expect(assign({ mods: ["win"], key: "l" }, currentCombo, []).saved).toBe(false);
  });

  it("не проверить — не сохраняем молча", () => {
    const got = assign(want, currentCombo, [], false);
    expect(got.saved).toBe(false);
    expect(got.said).toContain("не назначаю молча");
  });
});

describe("при отказе предлагается конкретная свободная", () => {
  it("первая свободная из трёх", () => {
    const got = suggest(["ctrl+alt+space"]);
    expect(got.combo).not.toBeNull();
    expect(got.said).toContain("из трёх проверенных");
    expect(format(got.combo!)).toBe("ctrl+shift+space");
  });

  it("все заняты — честное «назначьте свою»", () => {
    const got = suggest(["ctrl+alt+space", "ctrl+shift+space", "ctrl+alt+z"]);
    expect(got.combo).toBeNull();
    expect(got.said).toContain("назначьте свою");
  });
});

describe("экран настроек", () => {
  it("действующая клавиша видна всегда", () => {
    expect(shown(current())).toContain("Ctrl+Alt+Space");
  });

  it("не проверить — вопрос, а не молчаливое сохранение", () => {
    expect(whenUnknown(want)).toContain("Сохранить с риском");
  });

  it("три исхода названы", () => {
    expect(cases()).toHaveLength(3);
  });

  it("три дефекта запрещены", () => {
    const got = notDo().join();
    expect(got).toContain("прежняя клавиша остаётся");
    expect(got).toContain("предлагается конкретная свободная");
  });
});
