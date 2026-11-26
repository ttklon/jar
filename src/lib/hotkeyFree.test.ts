import { describe, expect, it } from "vitest";
import { byDefault, check, format, howChecked, notDo, SYSTEM, type Combo } from "./hotkeyFree";

/**
 * Шаг 446: горячие клавиши без конфликтов с системой, с проверкой занятости.
 */

const combo = (over: Partial<Combo> = {}): Combo => ({ mods: ["ctrl", "alt"], key: "space", ...over });

describe("модификаторы в одном порядке", () => {
  it("Ctrl+Shift+Z и Shift+Ctrl+Z — одно и то же", () => {
    expect(format({ mods: ["shift", "ctrl"], key: "z" })).toBe(format({ mods: ["ctrl", "shift"], key: "z" }));
  });

  it("порядок фиксированный", () => {
    expect(format({ mods: ["win", "shift", "alt", "ctrl"], key: "q" })).toBe("ctrl+alt+shift+win+q");
  });
});

describe("проверка до сохранения", () => {
  it("свободно — можно", () => {
    expect(check(combo()).ok).toBe(true);
  });

  it("занята другой программой — сказано, что будет", () => {
    const got = check(combo(), ["ctrl+alt+space"]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("решите, что приложение сломалось");
  });

  it("не проверить — не назначаем молча", () => {
    const got = check(combo(), [], false);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не назначаю молча");
  });
});

describe("системные сочетания не трогаем", () => {
  it("Ctrl+Alt+Delete", () => {
    expect(check({ mods: ["ctrl", "alt"], key: "delete" }).ok).toBe(false);
  });

  it("список системных назван", () => {
    expect(SYSTEM).toContain("win+l");
  });
});

describe("одна буква без модификатора не годится", () => {
  it("сработала бы при наборе текста", () => {
    const got = check({ mods: [], key: "z" });
    expect(got.ok).toBe(false);
    expect(got.said).toContain("при наборе текста");
  });

  it("с модификатором — нормально", () => {
    expect(check({ mods: ["ctrl"], key: "z" }).ok).toBe(true);
  });
});

describe("по умолчанию — два модификатора", () => {
  it("случайно не нажмётся", () => {
    expect(byDefault().mods.length).toBe(2);
  });

  it("проверка занятости описана, запреты названы", () => {
    expect(howChecked()).toHaveLength(3);
    expect(notDo().join()).toContain("не срабатывает дважды");
  });
});
