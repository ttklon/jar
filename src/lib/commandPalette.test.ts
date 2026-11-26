import { describe, expect, it } from "vitest";
import { check, checks, find, KEYS, matches, notDo, onEnter, type Screen_ } from "./commandPalette";

/**
 * Шаг 194: командная палитра Ctrl+K (и Ctrl+Л).
 */

const screens = (): Screen_[] => [
  { name: "Настройки", tags: ["звук", "уведомления"] },
  { name: "Напоминания", tags: ["время"] },
  { name: "Настройки → Планировщик", tags: ["расписание"] },
  { name: "Журнал", tags: ["что было"] },
];

describe("любой экран по первым буквам", () => {
  it("по началу слова", () => {
    expect(find("жур", screens()).map((s) => s.name)).toEqual(["Журнал"]);
  });

  it("по инициалам слов", () => {
    expect(find("нп", screens()).map((s) => s.name)).toContain("Настройки → Планировщик");
  });

  it("по слову из признаков", () => {
    expect(find("звук", screens()).map((s) => s.name)).toEqual(["Настройки"]);
  });

  it("пустой запрос — все экраны", () => {
    expect(find("", screens())).toHaveLength(4);
  });

  it("где попало — не находит", () => {
    expect(matches("урн", "Журнал")).toBe(false);
  });

  it("два слова — оба должны быть", () => {
    expect(find("наст звук", screens()).map((s) => s.name)).toEqual(["Настройки"]);
  });

  it("название с запроса — первым", () => {
    expect(find("на", screens())[0]!.name).toBe("Настройки");
  });
});

describe("Enter ведёт в подсвеченное", () => {
  it("ведёт туда, что подсвечено", () => {
    const got = onEnter("жур", screens(), 0);
    expect(got.go).toBe("Журнал");
    expect(got.said).toBe("открываю «Журнал»");
  });

  it("подсветка за пределами — берётся последняя", () => {
    expect(onEnter("на", screens(), 99).go).toBe("Настройки → Планировщик");
  });

  it("пустой результат — никуда и честно", () => {
    const got = onEnter("щщ", screens(), 0);
    expect(got.go).toBeNull();
    expect(got.said).toContain("ничего нет — попробуйте другие буквы");
  });
});

describe("две раскладки — одно действие", () => {
  it("Ctrl+K и Ctrl+Л", () => {
    expect(KEYS).toEqual(["Ctrl+K", "Ctrl+Л"]);
  });

  it("дубль названия — Enter непредсказуем", () => {
    const got = check([{ name: "Журнал", tags: [] }, { name: "журнал", tags: [] }]);
    expect(got.join()).toContain("Enter поведёт непредсказуемо");
  });

  it("пустой список и экран без названия", () => {
    expect(check([]).join()).toContain("должна вести хоть куда-то");
    expect(check([{ name: "  ", tags: [] }]).join()).toContain("не найти и не объявить");
  });

  it("не требует помнить раскладку", () => {
    expect(notDo()[2]).toContain("Ctrl+Л");
    expect(checks()).toHaveLength(3);
  });
});
