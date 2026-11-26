import { describe, expect, it } from "vitest";
import { checks, does, may, notDo } from "./noShellIntegration";

/**
 * Шаг 459: обновление контекстного меню и ярлыков не требуется для работы.
 */

describe("обновление трогает только своё", () => {
  it("своя папка и %APPDATA% — всегда можно", () => {
    expect(may("programFiles").ok).toBe(true);
    expect(may("appdata").ok).toBe(true);
  });

  it("три вещи, и больше ничего — достаточно для работы", () => {
    expect(does()).toHaveLength(3);
  });
});

describe("ярлыки — только по выбору", () => {
  it("не выбирали — не трогаем", () => {
    const got = may("shortcuts");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("мог их переименовать");
  });

  it("выбрали — можно, но существующий не переименовываем", () => {
    const got = may("shortcuts", ["shortcuts"]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("не переименовываем");
  });
});

describe("контекстное меню — по выбору и с выключателем", () => {
  it("не выбирали — не появляется", () => {
    expect(may("contextMenu").ok).toBe(false);
  });

  it("выбрали — можно убрать навсегда", () => {
    expect(may("contextMenu", ["contextMenu"]).said).toContain("убрать в настройках навсегда");
  });
});

describe("Проводник и связи файлов — никогда", () => {
  it("перезапуск Проводника недопустим", () => {
    const got = may("explorerRestart");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("посреди работы с файлами");
  });

  it("связи файлов — решение системы", () => {
    expect(may("fileAssoc").said).toContain("решение системы");
  });
});

describe("три проверки и три запрета", () => {
  it("связи файлов и Проводник не трогаются", () => {
    expect(checks()).toHaveLength(3);
    expect(notDo().join()).toContain("который убрали");
  });
});
