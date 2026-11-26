import { describe, expect, it } from "vitest";
import { closeEnough, filterCommands, fold, type Command } from "./commands";

const COMMANDS: Command[] = [
  { id: "voice", label: "Голос", keywords: ["микрофон", "голосовой ввод"] },
  { id: "hands", label: "Руки", keywords: ["tools"] },
  { id: "settings", label: "Настройки", keywords: ["settings", "тема"] },
  { id: "journal", label: "История", keywords: ["журнал", "logs"] },
];

describe("командная палитра", () => {
  it("пустой запрос показывает всё: палитра открывается как оглавление", () => {
    expect(filterCommands(COMMANDS, "")).toHaveLength(4);
    expect(filterCommands(COMMANDS, "   ")).toHaveLength(4);
  });

  it("находит по первым буквам и без учёта регистра", () => {
    expect(filterCommands(COMMANDS, "нас").map((c) => c.id)).toEqual(["settings"]);
    expect(filterCommands(COMMANDS, "ИСТ").map((c) => c.id)).toEqual(["journal"]);
  });

  it("русская раскладка не мешает: «ё» и «е» — одна буква", () => {
    expect(fold("Настройки")).toBe("настройки");
    expect(fold("Ещё")).toBe("еще");
    expect(fold("еще")).toBe("еще");
  });

  it("находит по синониму, а не только по подписи", () => {
    expect(filterCommands(COMMANDS, "микрофон").map((c) => c.id)).toEqual(["voice"]);
    expect(filterCommands(COMMANDS, "logs").map((c) => c.id)).toEqual(["journal"]);
    expect(filterCommands(COMMANDS, "тема").map((c) => c.id)).toEqual(["settings"]);
  });

  it("не находит ничего — возвращает пусто, а не всё подряд", () => {
    // «Ничего не найдено» — это ответ. Показывать весь список было бы обманом.
    expect(filterCommands(COMMANDS, "квантовая телепортация")).toEqual([]);
  });
});

/**
 * Палитра на бегу: опечатка в одну букву и порядок «точное раньше похожего».
 *
 * Человек набирает одной рукой и ошибается; палитра, которая на «журнла» говорит
 * «ничего нет», заставляет его стереть и набрать заново. И наоборот: точное
 * совпадение должно быть первой строкой, иначе Enter уводит не туда.
 */
describe("опечатка и порядок", () => {
  const list = [
    { id: "licenses", label: "Лицензии", keywords: ["лицензии"] },
    { id: "journal", label: "Журнал", keywords: ["журнал", "история"] },
    { id: "settings", label: "Настройки", keywords: ["настройки"] },
  ];

  it("точное совпадение — первой строкой", () => {
    expect(filterCommands(list, "журнал")[0]!.id).toBe("journal");
  });

  it("опечатка «журнла» всё равно находит журнал", () => {
    expect(filterCommands(list, "журнла").map((c) => c.id)).toContain("journal");
  });

  it("на трёх буквах «почти» не включается: иначе находится всё", () => {
    expect(filterCommands(list, "жур")).toHaveLength(1);
    expect(closeEnough("журнал", "жур")).toBe(false);
  });

  it("«ё» и «е» — одно и то же", () => {
    expect(filterCommands([{ id: "x", label: "Настройки ё" }], "е")).toHaveLength(1);
  });
});
