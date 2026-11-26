import { describe, expect, it } from "vitest";
import { decide, keepsRunning, notDo, visibleWhileDnd, type Mode } from "./dndRespect";

/**
 * Шаг 445: уважать «не беспокоить» системы.
 */

const mode = (over: Partial<Mode> = {}): Mode => ({ dnd: false, byPerson: false, kind: "успех", ...over });

describe("DND выключено — как обычно", () => {
  it("уведомляем и выполняем", () => {
    const got = decide(mode());
    expect([got.notify, got.run]).toEqual([true, true]);
  });
});

describe("DND включено — уведомлений нет", () => {
  it("успех молчит", () => {
    expect(decide(mode({ dnd: true })).notify).toBe(false);
  });

  it("ошибка молчит, но дело видно в трее", () => {
    const got = decide(mode({ dnd: true, kind: "ошибка" }));
    expect(got.notify).toBe(false);
    expect(got.said).toContain("в трее и в окне");
  });

  it("вопрос не всплывает, но дело стоит", () => {
    const got = decide(mode({ dnd: true, kind: "вопрос" }));
    expect(got.notify).toBe(false);
    expect(got.run).toBe(false);
    expect(got.said).toContain("дело стоит и ждёт");
  });
});

describe("DND не выключает работу", () => {
  it("расписание идёт, и уведомление о нём — единственное", () => {
    const got = decide(mode({ dnd: true, kind: "расписание" }));
    expect(got.run).toBe(true);
    expect(got.notify).toBe(true);
  });

  it("человек нажал сам — выполняется молча", () => {
    const got = decide(mode({ dnd: true, byPerson: true }));
    expect(got.run).toBe(true);
    expect(got.notify).toBe(false);
  });

  it("три вещи продолжают работать", () => {
    expect(keepsRunning()).toHaveLength(3);
    expect(keepsRunning().join()).toContain("это просьба, а не шум");
  });
});

describe("что видно при DND", () => {
  it("трей и окно — не уведомление", () => {
    const got = visibleWhileDnd().join();
    expect(got).toContain("состояние в трее");
    expect(got).toContain("открытом окне");
  });
});

describe("три обхода, которые ломают доверие", () => {
  it("своя всплывашка, ложная срочность, молчание о вопросах", () => {
    const got = notDo().join();
    expect(got).toContain("это обход «не беспокоить»");
    expect(got).toContain("срочным его назначаем мы");
  });
});
