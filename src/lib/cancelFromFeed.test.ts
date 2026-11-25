import { describe, expect, it } from "vitest";
import { action, afterCancel, notDo, sameBehaviour, type FeedItem } from "./cancelFromFeed";

/**
 * Шаг 368: отмена доступна из ленты, а не только внутри дела — меньше кликов.
 */

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: "1",
  what: "уборка загрузок",
  state: "running",
  cancellable: true,
  ...over,
});

describe("кнопка на строке ленты", () => {
  it("называется «Отменить», а не «×»", () => {
    const got = action(item());
    expect(got.show).toBe(true);
    expect(got.said).toContain("отменю");
    expect(got.said).not.toContain("×");
  });

  it("то же, что внутри дела", () => {
    expect(action(item()).said).toContain("то же, что кнопка внутри дела");
  });

  it("у завершённого кнопки нет: отменять нечего", () => {
    for (const state of ["done", "failed", "cancelled"] as const) {
      expect(action(item({ state })).show).toBe(false);
    }
  });

  it("нельзя отменить — кнопка остаётся и объясняет", () => {
    const got = action(item({ cancellable: false }));
    expect(got.show).toBe(true);
    expect(got.impossible).toBe(true);
    expect(got.said).toContain("остановлю на следующем");
  });

  it("ждущее дело тоже можно отменить", () => {
    expect(action(item({ state: "waiting" })).show).toBe(true);
  });
});

describe("после отмены видно, что нажатие сработало", () => {
  it("«отменено», а не пустая строка", () => {
    expect(afterCancel(item())).toBe("уборка загрузок: отменено — остальные шаги не выполнялись");
  });
});

describe("один код на два места", () => {
  it("одинаковое поведение — замечаний нет", () => {
    const same = action(item());
    expect(sameBehaviour(same, same)).toEqual([]);
  });

  it("расхождение ловится", () => {
    const feed = action(item());
    const inside = action(item({ state: "done" }));
    expect(sameBehaviour(feed, inside)[0]).toContain("должен быть один код");
  });
});

describe("чего кнопка не делает", () => {
  it("три запрета, включая «не убирать строку»", () => {
    const got = notDo().join();
    expect(got).toContain("не «×» без подписи");
    expect(got).toContain("не скрывать кнопку");
    expect(got).toContain("«отменено» — это результат");
  });
});
