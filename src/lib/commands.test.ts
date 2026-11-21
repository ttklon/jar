import { describe, expect, it } from "vitest";
import { filterCommands, fold, type Command } from "./commands";

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
