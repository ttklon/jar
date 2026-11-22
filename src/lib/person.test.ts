// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ASKED_KEY,
  NAME_KEY,
  NAME_LIMIT,
  address,
  cleanName,
  readName,
  saveName,
  shouldAskName,
} from "./person";
import type { StorageLike } from "./firstRun";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? (data[key] as string) : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe("как человека звать", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("спрашивает один раз и запоминает ответ", () => {
    // Шаг 37: первый запуск задаёт ровно этот вопрос.
    const storage = memoryStorage();
    expect(shouldAskName(storage)).toBe(true);

    expect(saveName("  Аня  ", storage)).toBe(true);
    expect(readName(storage)).toBe("Аня");
    // Второй запуск вопрос не повторяет (шаг 39).
    expect(shouldAskName(storage)).toBe(false);
  });

  it("отказ — законный ответ, и вопрос не возвращается (шаг 38)", () => {
    const storage = memoryStorage();
    saveName("", storage);

    expect(readName(storage)).toBe("");
    // Главное: «не назвался» и «не спрашивали» — разные вещи. Иначе человек,
    // отказавшийся один раз, получал бы анкету при каждом запуске.
    expect(shouldAskName(storage)).toBe(false);
  });

  it("пробелы по краям и внутри не делают из одного имени два", () => {
    expect(cleanName("  Аня   Иванова ")).toBe("Аня Иванова");
    const storage = memoryStorage();
    saveName("Аня  Иванова", storage);
    expect(readName(storage)).toBe("Аня Иванова");
  });

  it("слишком длинное имя обрезается, а не ломает обращение", () => {
    const storage = memoryStorage();
    saveName("я".repeat(NAME_LIMIT + 20), storage);
    expect(readName(storage)).toHaveLength(NAME_LIMIT);
  });

  it("сломанное хранилище — «не спрашивать», а не анкета каждый раз", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("нет доступа");
      },
      setItem: () => {
        throw new Error("нет доступа");
      },
      removeItem: () => {
        throw new Error("нет доступа");
      },
    };

    expect(saveName("Аня", broken)).toBe(false);
    expect(readName(broken)).toBe("");
    expect(shouldAskName(broken)).toBe(false);
  });

  it("читает настоящее хранилище по умолчанию", () => {
    expect(saveName("Аня")).toBe(true);
    expect(readName()).toBe("Аня");
    expect(localStorage.getItem(NAME_KEY)).toBe("Аня");
    expect(localStorage.getItem(ASKED_KEY)).toBe("1");
  });

  it("без имени обращение безлично, но не «пользователь»", () => {
    expect(address("")).toBe("");
    expect(address("Аня")).toBe("Аня");
  });
});
