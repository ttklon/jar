import { beforeEach, describe, expect, it } from "vitest";
import {
  WELCOME_KEY,
  markWelcomeSeen,
  shouldShowWelcome,
  welcomeSeen,
  type StorageLike,
} from "./firstRun";

/**
 * «Один раз» — это правило с двумя ловушками: сломанное хранилище и запись, которая
 * не удалась. Обе проверяются здесь, без экрана.
 */

/** Хранилище в памяти: ровно то, что нужно модулю, и ничего лишнего. */
function memoryStorage(seed: Record<string, string> = {}): StorageLike & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/** Хранилище, которое обещает работать и отказывает: так бывает в приватном режиме. */
function brokenStorage(): StorageLike {
  const refuse = () => {
    throw new Error("хранилище недоступно");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

describe("первый запуск", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.();
  });

  it("на пустом хранилище знакомство показывается", () => {
    const storage = memoryStorage();

    expect(welcomeSeen(storage)).toBe(false);
    expect(shouldShowWelcome(storage)).toBe(true);
  });

  it("после отметки знакомство больше не показывается", () => {
    const storage = memoryStorage();

    expect(markWelcomeSeen(storage)).toBe(true);
    expect(storage.data.get(WELCOME_KEY)).toBe("1");
    expect(shouldShowWelcome(storage)).toBe(false);
  });

  it("битое хранилище не показывает знакомство каждый запуск и не падает", () => {
    // Запомнить ответ негде — значит, и возвращаться к экрану нечестно: он мешал бы работе.
    expect(welcomeSeen(brokenStorage())).toBe(true);
    expect(shouldShowWelcome(brokenStorage())).toBe(false);
    expect(markWelcomeSeen(brokenStorage())).toBe(false);
  });

  it("отсутствие хранилища — не ошибка, а честный ответ", () => {
    expect(welcomeSeen(null)).toBe(true);
    expect(markWelcomeSeen(null)).toBe(false);
  });

  it("пробный ключ не остаётся в хранилище", () => {
    const storage = memoryStorage();

    markWelcomeSeen(storage);

    expect([...storage.data.keys()]).toEqual([WELCOME_KEY]);
  });
});
