import { describe, expect, it } from "vitest";
import { blame, neverSay, say, type Fault } from "./modelVsMine";

/**
 * Шаг 426: ошибки модели не выглядят как «ты не понял».
 */

describe("у каждого отказа своё имя, и оно говорит, чья беда", () => {
  it("таймаут — моя ошибка, фразу стоит повторить", () => {
    const got = say("timeout");
    expect(got.whose).toBe("моя");
    expect(got.text).toContain("это моя ошибка");
    expect(got.repeatSame).toBe(true);
  });

  it("битый ответ — тоже моя, и повтор помогает", () => {
    expect(say("broken").text).toContain("мой ответ сломался");
    expect(say("broken").repeatSame).toBe(true);
  });

  it("не понял — обоюдная, ту же фразу повторять бессмысленно", () => {
    const got = say("unclear");
    expect(got.whose).toBe("обоюдная");
    expect(got.repeatSame).toBe(false);
    expect(got.next).toContain("скажите иначе");
  });

  it("отказано политикой — это не ошибка, это решение", () => {
    const got = say("refused");
    expect(got.whose).toBe("никого");
    expect(got.text).toContain("этого не сделаю");
  });

  it("нет модели — моя, и сказано, что проверить", () => {
    expect(say("offline").next).toContain("модель скачана");
  });
});

describe("для журнала ошибка модели не считается ошибкой человека", () => {
  it("таймаут — модель", () => {
    expect(blame("timeout")).toBe("модель");
  });

  it("не понял — человек (для статистики формулировок)", () => {
    expect(blame("unclear")).toBe("человек");
  });

  it("отказ политики — ничья", () => {
    expect(blame("refused")).toBe("ничья");
  });
});

describe("чего нельзя говорить", () => {
  it("пять фраз, и первая — «не понял» при таймауте", () => {
    const got = neverSay();
    expect(got).toHaveLength(5);
    expect(got[0]).toContain("переделывать правильную фразу");
  });
});

describe("все отказы покрыты", () => {
  it("на каждый есть ответ без undefined", () => {
    for (const fault of ["timeout", "broken", "unclear", "refused", "offline"] as Fault[]) {
      const got = say(fault);
      expect(got.text.length).toBeGreaterThan(5);
      expect(got.next.length).toBeGreaterThan(5);
    }
  });
});
