import { describe, expect, it } from "vitest";
import { DEFAULT_SCREEN, LAST_SCREEN_KEY, readScreen, rememberable, saveScreen } from "./lastScreen";

/**
 * Шаг 191: приложение открывается там, где человек работал.
 *
 * Половина проверок — про то, чего **не** должно быть в хранилище. Запомнить
 * легко; запомнить так, чтобы второй запуск открылся в рабочем месте, а не в
 * пустоте и не в знакомстве, — вот где ошибаются.
 */
const SCREENS = ["voice", "overview", "catalog", "ask", "hands", "flows", "apps", "models", "journal", "settings"];

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("последнее место работы", () => {
  it("сохранённый экран возвращается", () => {
    const store = storage({ [LAST_SCREEN_KEY]: "journal" });
    expect(readScreen(store, SCREENS)).toBe("journal");
  });

  it("ничего не сохранено — открывается разговор", () => {
    expect(readScreen(storage(), SCREENS)).toBe(DEFAULT_SCREEN);
    // И когда хранилища нет вовсе: браузер без `localStorage` — не повод падать.
    expect(readScreen(undefined, SCREENS)).toBe(DEFAULT_SCREEN);
  });

  it("чужое имя — не место, а пустота", () => {
    // Экран из следующей версии, опечатка, чужой ключ: показать его значило бы
    // открыть пустоту. «Голос» честнее.
    expect(readScreen(storage({ [LAST_SCREEN_KEY]: "нет-такого" }), SCREENS)).toBe(DEFAULT_SCREEN);
    expect(readScreen(storage({ [LAST_SCREEN_KEY]: "" }), SCREENS)).toBe(DEFAULT_SCREEN);
  });

  it("знакомство не запоминается", () => {
    // Иначе второй запуск открылся бы там, откуда человек ушёл, — а он ушёл с
    // знакомства и работать собирался в другом месте.
    expect(rememberable("welcome")).toBe(false);
    const store = storage();
    saveScreen(store, "welcome");
    expect(store.data.has(LAST_SCREEN_KEY)).toBe(false);
    // А рабочий экран — запоминается.
    saveScreen(store, "models");
    expect(store.data.get(LAST_SCREEN_KEY)).toBe("models");
  });

  it("хранилище, которое бросает, не роняет приложение", () => {
    // Приватный режим и запреты на хранилище — реальность, а не выдумка.
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(readScreen(broken, SCREENS)).toBe(DEFAULT_SCREEN);
    expect(() => saveScreen(broken, "overview")).not.toThrow();
  });
});
