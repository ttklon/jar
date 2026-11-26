import { describe, expect, it } from "vitest";
import { inWindowInstead, notice, notDo, systemDoes, whenBlocked, type Kind } from "./systemNotices";

/**
 * Шаг 442: уведомления Windows вместо собственных всплывашек.
 */

describe("всё идёт через систему", () => {
  it("ни одного своего окна", () => {
    for (const kind of ["успех", "ошибка", "вопрос", "пауза", "отмена"] as Kind[]) {
      expect(notice(kind, "детали").system).toBe(true);
    }
  });

  it("заголовок — что случилось, а не название программы", () => {
    expect(notice("успех", "уборка загрузок").title).toBe("Готово");
    expect(notice("ошибка", "диск занят").title).toBe("Не получилось");
  });

  it("вопрос — единственное срочное", () => {
    expect(notice("вопрос", "удалить 12 файлов?").urgent).toBe(true);
    expect(notice("успех", "x").urgent).toBe(false);
  });

  it("у каждого — действие по нажатию", () => {
    expect(notice("отмена", "остановили").action).toContain("открыть");
  });
});

describe("запрещено системой — не показываем своё", () => {
  it("вопрос остаётся в окне и трее", () => {
    expect(whenBlocked("вопрос")).toContain("дело не начнётся без ответа");
  });

  it("остальное — тоже без потерь", () => {
    expect(whenBlocked("успех")).toContain("ничего не потеряется");
  });
});

describe("что система делает лучше нас", () => {
  it("четыре причины, включая «Не беспокоить»", () => {
    expect(systemDoes()).toHaveLength(4);
    expect(systemDoes()[1]).toContain("Не беспокоить");
  });

  it("окно в фокусе — уведомление не дублируем", () => {
    expect(inWindowInstead(true)).toBe(true);
    expect(inWindowInstead(false)).toBe(false);
  });

  it("три запрета — про шум", () => {
    const got = notDo().join();
    expect(got).toContain("уведомление о каждом деле — это шум");
  });
});
