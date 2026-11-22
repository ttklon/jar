// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_KEY, DRAFT_LIMIT, clearDraft, readDraft, saveDraft } from "./draft";
import type { StorageLike } from "./firstRun";

/** Хранилище в памяти: те же три операции, что у настоящего. */
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

describe("черновик фразы", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("набранное переживает закрытие окна", () => {
    // Шаг 26: фраза, которую человек не отправил, — не мусор.
    const storage = memoryStorage();
    expect(saveDraft("убери старые отчёты", storage)).toBe(true);

    // Другой «запуск»: читаем тем же хранилищем, но новый вызов.
    expect(readDraft(storage)).toBe("убери старые отчёты");
    expect(storage.data[DRAFT_KEY]).toBe("убери старые отчёты");
  });

  it("пустой черновик не хранится: это «ничего не набрано», а не фраза", () => {
    const storage = memoryStorage();
    saveDraft("было", storage);
    saveDraft("   ", storage);

    expect(readDraft(storage)).toBe("");
    expect(storage.data[DRAFT_KEY]).toBeUndefined();
  });

  it("отправленная фраза черновик не оставляет", () => {
    const storage = memoryStorage();
    saveDraft("почисти журнал", storage);
    clearDraft(storage);

    expect(readDraft(storage)).toBe("");
  });

  it("длинный черновик обрезается пределом, а не теряется целиком", () => {
    const storage = memoryStorage();
    const long = "а".repeat(DRAFT_LIMIT + 500);
    saveDraft(long, storage);

    expect(readDraft(storage)).toHaveLength(DRAFT_LIMIT);
  });

  it("сломанное хранилище не роняет экран — говорит «не сохранил»", () => {
    // Хранилище, которое врёт о готовности: запись бросает (приватный режим и пр.).
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

    expect(saveDraft("фраза", broken)).toBe(false);
    expect(readDraft(broken)).toBe("");
    // Уборка тоже не бросает: потерять экран из-за хранилища хуже, чем черновик.
    expect(() => clearDraft(broken)).not.toThrow();
  });

  it("без хранилища вовсе — пусто, а не падение", () => {
    expect(readDraft(null)).toBe("");
    expect(saveDraft("фраза", null)).toBe(false);
    expect(() => clearDraft(null)).not.toThrow();
  });

  it("читает настоящее хранилище браузера по умолчанию", () => {
    // Проверка, что аргумент по умолчанию — рабочее хранилище, а не заглушка:
    // без этого все проверки выше проходили бы на подставном, а экран молчал.
    expect(saveDraft("настоящая фраза")).toBe(true);
    expect(readDraft()).toBe("настоящая фраза");
    expect(localStorage.getItem(DRAFT_KEY)).toBe("настоящая фраза");
  });

  it("чужая запись длиннее предела не проходит в поле целиком", () => {
    const storage = memoryStorage({ [DRAFT_KEY]: "б".repeat(DRAFT_LIMIT + 10) });
    expect(readDraft(storage)).toHaveLength(DRAFT_LIMIT);
    expect(vi.isMockFunction(saveDraft)).toBe(false);
  });
});
