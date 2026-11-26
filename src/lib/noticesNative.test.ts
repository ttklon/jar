import { describe, expect, it } from "vitest";
import { cases, notDo, repeat, send, urgent } from "./noticesNative";

/**
 * Шаг 454: уведомления — системные, скрываются вместе с «не беспокоить».
 */

describe("только в систему, ни одной своей всплывашки", () => {
  it("обычное уведомление уходит в систему", () => {
    const got = send("успех", "уборка загрузок", false);
    expect(got.toSystem).toBe(true);
    expect(got.bypass).toBe(false);
  });

  it("«не беспокоить» — не отправляем вовсе", () => {
    const got = send("успех", "уборка загрузок", true);
    expect(got.toSystem).toBe(false);
    expect(got.said).toContain("в окне и в трее");
  });

  it("вопрос при «не беспокоить» — тоже не всплывает", () => {
    expect(send("вопрос", "удалить 12 файлов?", true).toSystem).toBe(false);
  });

  it("ни одно уведомление не обходит режим", () => {
    for (const kind of ["успех", "ошибка", "вопрос", "пауза", "отмена"] as const) {
      expect(send(kind, "x", false).bypass).toBe(false);
      expect(send(kind, "x", true).bypass).toBe(false);
    }
  });
});

describe("повтор — это обход своими руками", () => {
  it("первое — отправляем", () => {
    expect(repeat(1).send).toBe(true);
  });

  it("второе — нет", () => {
    const got = repeat(2);
    expect(got.send).toBe(false);
    expect(got.said).toContain("обход «не беспокоить» своими руками");
  });
});

describe("срочность — только у вопроса", () => {
  it("вопрос срочен, ошибка — нет", () => {
    expect(urgent("вопрос")).toBe(true);
    expect(urgent("ошибка")).toBe(false);
    expect(urgent("успех")).toBe(false);
  });
});

describe("три способа обхода закрыты", () => {
  it("своя всплывашка, ложная срочность, повтор", () => {
    expect(cases().every((c) => !c.ok)).toBe(true);
    expect(notDo()).toHaveLength(3);
  });
});
