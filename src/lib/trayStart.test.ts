import { describe, expect, it } from "vitest";
import { cases, HINT_MS, hintText, notDo, start } from "./trayStart";

/**
 * Шаг 453: тихий старт в трее, без окна, по выбору.
 */

describe("тихо только при входе в Windows", () => {
  it("автозапуск с настройкой «в трее» — окна нет", () => {
    const got = start("autostart", true);
    expect(got.window).toBe(false);
    expect(got.hint).toBe(true);
  });

  it("автозапуск без настройки — окно есть", () => {
    expect(start("autostart", false).window).toBe(true);
  });

  it("ярлык — окно всегда, иначе «программа не работает»", () => {
    const got = start("shortcut", true);
    expect(got.window).toBe(true);
    expect(got.said).toContain("ничего не произошло");
  });

  it("второй запуск — окно, а не второй экземпляр", () => {
    expect(start("secondRun", true).said).toContain("вместо второго экземпляра");
  });

  it("после обновления — окно, чтобы сказать, что изменилось", () => {
    expect(start("update", true).window).toBe(true);
  });

  it("первый запуск — окно всегда, даже при автозапуске", () => {
    expect(start("autostart", true, true).window).toBe(true);
  });
});

describe("подсказка при тихом старте", () => {
  it("говорит, куда делась программа", () => {
    expect(hintText()).toContain("в трее");
  });

  it("закрывается сама через пять секунд", () => {
    expect(HINT_MS).toBe(5000);
  });
});

describe("четыре способа запуска и три дефекта", () => {
  it("у каждого своё решение", () => {
    const got = cases();
    expect(got).toHaveLength(4);
    expect(got[0]!.window).toBe(false);
    expect(got.slice(1).every((c) => c.window)).toBe(true);
  });

  it("не прячет при ярлыке, не молчит после обновления, не висит", () => {
    const got = notDo().join();
    expect(got).toContain("нажал и ждёт окно");
    expect(got).toContain("через пять секунд");
  });
});
