import { describe, expect, it } from "vitest";
import { ALL, apply, caption, dayOf, nameOf, notDo, type Filter, type Row } from "./feedFilters";

/**
 * Шаг 372: фильтры — сегодня, вчера, только ошибки, только опасные.
 */

const now = new Date(2026, 10, 20, 15, 0).getTime();
const row = (over: Partial<Row> = {}): Row => ({ id: "1", at: now, state: "done", risk: "safe", ...over });
const filter = (over: Partial<Filter> = {}): Filter => ({ ...ALL, ...over });

describe("четыре вопроса", () => {
  const rows = [
    row({ id: "t1" }),
    row({ id: "t2", state: "failed" }),
    row({ id: "y1", at: now - 86_400_000 }),
    row({ id: "y2", at: now - 86_400_000, risk: "dangerous" }),
    row({ id: "old", at: now - 5 * 86_400_000 }),
  ];

  it("сегодня", () => {
    expect(apply(rows, filter({ when: "today" }), now).map((r) => r.id)).toEqual(["t1", "t2"]);
  });

  it("вчера", () => {
    expect(apply(rows, filter({ when: "yesterday" }), now).map((r) => r.id)).toEqual(["y1", "y2"]);
  });

  it("только ошибки", () => {
    expect(apply(rows, filter({ only: "failed" }), now).map((r) => r.id)).toEqual(["t2"]);
  });

  it("только опасные", () => {
    expect(apply(rows, filter({ only: "dangerous" }), now).map((r) => r.id)).toEqual(["y2"]);
  });
});

describe("фильтры складываются", () => {
  const rows = [row({ id: "a", state: "failed" }), row({ id: "b", at: now - 86_400_000, state: "failed" })];

  it("«вчера + ошибки» — законный вопрос", () => {
    expect(apply(rows, { when: "yesterday", only: "failed" }, now).map((r) => r.id)).toEqual(["b"]);
  });

  it("имя фильтра складывается словами", () => {
    expect(nameOf({ when: "yesterday", only: "failed" })).toBe("вчера, ошибки");
  });

  it("день считается по местному дню", () => {
    expect(dayOf(now)).toBe(dayOf(new Date(2026, 10, 20, 1, 0).getTime()));
    expect(dayOf(now)).not.toBe(dayOf(now - 86_400_000));
  });
});

describe("пустой результат говорит, что был фильтр", () => {
  it("по фильтру ничего — не «дел нет»", () => {
    const got = caption(0, 10, filter({ only: "failed" }));
    expect(got).toContain("по фильтру «только ошибки» ничего");
    expect(got).toContain("всего дел 10");
  });

  it("дел нет вовсе — подсказка", () => {
    expect(caption(0, 0, ALL)).toContain("скажите первое дело");
  });

  it("без фильтра — просто счёт", () => {
    expect(caption(10, 10, ALL)).toBe("всего 10");
  });

  it("с фильтром — сколько из скольких", () => {
    expect(caption(3, 10, filter({ when: "today" }))).toBe("сегодня: 3 из 10");
  });
});

describe("чего фильтры не делают", () => {
  it("три запрета, включая сброс после перезапуска", () => {
    const got = notDo().join();
    expect(got).toContain("это выбор, а не сокрытие");
    expect(got).toContain("фильтры сужают, а не ищут");
    expect(got).toContain("не сбрасываются молча");
  });
});
