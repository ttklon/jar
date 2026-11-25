import { describe, expect, it } from "vitest";
import { afterSwitch, enter, kept, notDo, type Who } from "./midDeedRights";

/**
 * Шаг 419: смена человека посреди дела не меняет права исполнения.
 */

const anna: Who = { name: "Анна", allowed: ["delete", "send"] };
const son: Who = { name: "Сын", allowed: ["send"] };

describe("права фиксируются на входе", () => {
  it("копия, а не ссылка", () => {
    const got = enter(anna, "delete");
    expect(got.running.fixed).toEqual(["delete", "send"]);
    expect(got.said).toContain("до конца оно не изменится");
  });

  it("чтение не требует разрешения", () => {
    expect(enter(anna, "read").said).toContain("разрешения не требует");
  });
});

describe("смена не расширяет прав", () => {
  it("новый человек не получает прав поверх прежних", () => {
    const running = enter(anna, "delete").running;
    const got = afterSwitch(running, { name: "Сын", allowed: ["delete", "send", "pay"] }, "send");
    expect(got.ok).toBe(true);
    // Пересечение: у обоих есть delete и send, а pay — только у нового, и он его не получает.
    expect(got.fixed).toEqual(["delete", "send"]);
    expect(got.fixed).not.toContain("pay");
    expect(got.said).toContain("не получил прав, которых у него не было");
  });

  it("сужение — дело останавливается честно", () => {
    const running = enter(anna, "delete").running;
    const got = afterSwitch(running, son, "delete");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("Верните «Анна»");
  });

  it("чтение продолжается всегда", () => {
    const running = enter(anna, "delete").running;
    expect(afterSwitch(running, son, "read").ok).toBe(true);
  });
});

describe("выполненное остаётся за прежним", () => {
  it("шаги не переписываются", () => {
    expect(kept(3)).toContain("выполнены по согласию прежнего человека");
  });

  it("ничего не выполнено — так и сказано", () => {
    expect(kept(0)).toBe("выполненных шагов нет");
  });

  it("три запрета про расширение прав", () => {
    expect(notDo().join()).toContain("только пересечение");
  });
});
