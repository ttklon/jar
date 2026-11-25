import { describe, expect, it } from "vitest";
import { conflict, LIMIT_BYTES, notDo, read } from "./importChecks";

/**
 * Шаг 416: импорт проверяет формат и не перезаписывает молча.
 */

const good = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({ "что это": "профиль ZShelper", "версия": 1, "имя": "Анна", "факты": ["аллергия на кошек"], "разрешения": ["удаление — Загрузки"], ...over });

describe("формат проверяется по шагам, и каждый отказ называет причину", () => {
  it("правильный файл — читается", () => {
    const got = read(good());
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.got.name).toBe("Анна");
  });

  it("не JSON — «возможно, обрезан»", () => {
    const got = read("{обрезано");
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.said).toContain("обрезан");
  });

  it("нет версии — не файл профиля", () => {
    const got = read(JSON.stringify({ "имя": "Анна" }));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.said).toContain("нет версии формата");
  });

  it("файл из будущего — не принимаем", () => {
    const got = read(good({ "версия": 2 }));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.said).toContain("от новой версии");
  });

  it("без имени — непонятно, чья память", () => {
    expect(read(good({ "имя": "   " })).ok).toBe(false);
  });

  it("слишком большой — не профиль", () => {
    expect(read(" ".repeat(LIMIT_BYTES + 1)).ok).toBe(false);
  });
});

describe("плохие записи отбрасываются, и это сказано", () => {
  it("не текст среди фактов", () => {
    const got = read(good({ "факты": ["нормальный", 42, null] }));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.got.facts).toEqual(["нормальный"]);
      expect(got.dropped).toHaveLength(2);
      expect(got.said).toContain("2 записей отброшено");
    }
  });

  it("английские ключи тоже читаются", () => {
    const got = read(JSON.stringify({ version: 1, name: "Анна", facts: ["a"], grants: [] }));
    expect(got.ok).toBe(true);
  });
});

describe("такой человек уже есть — решает человек", () => {
  it("три варианта и остановка", () => {
    const got = conflict("Анна");
    expect(got.options).toHaveLength(3);
    expect(got.said).toContain("Импорт остановлен");
    expect(got.said).toContain("второй человек с тем же именем");
  });

  it("три запрета, первый — про перезапись", () => {
    expect(notDo()[0]).toContain("два «Анна» — это два человека");
  });
});
