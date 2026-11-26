import { describe, expect, it } from "vitest";
import { check, checks, days, MAX_DAYS, notDo, summary, type Skip } from "./noSkippedTests";

/**
 * Шаг 486: запрет на «зелёный CI» ценой выключенного теста.
 */

const skip = (over: Partial<Skip> = {}): Skip => ({ test: "удаляет файлы", how: "skip", why: "ждёт починки шага 344", until: "2026-11-25", ...over });
const TODAY = "2026-11-20";

describe("пропуск — разрешение с причиной и сроком", () => {
  it("правильный пропуск проходит", () => {
    expect(check(skip(), TODAY)).toEqual([]);
  });

  it("бессрочный — выключение", () => {
    expect(check(skip({ until: null }), TODAY).join()).toContain("бессрочный");
  });

  it("причина из трёх букв — не причина", () => {
    expect(check(skip({ why: "flaky" }), TODAY).join()).toContain("ничего не объясняет");
  });

  it("просроченный валит сборку", () => {
    expect(check(skip({ until: "2026-11-19" }), TODAY).join()).toContain("тест обязан вернуться");
  });

  it("дальше четырнадцати дней — уже выключение", () => {
    expect(check(skip({ until: "2027-01-01" }), TODAY).join()).toContain("это уже выключение");
  });

  it("ровно на границе — можно", () => {
    const until = new Date(Date.parse(`${TODAY}T00:00:00Z`) + MAX_DAYS * 86_400_000).toISOString().slice(0, 10);
    expect(check(skip({ until }), TODAY)).toEqual([]);
  });
});

describe("only запрещён целиком", () => {
  it("`only` — поломка прогона, а не пропуск", () => {
    expect(check(skip({ how: "only" }), TODAY).join()).toContain("выключает остальные тесты");
  });

  it("`todo` разрешён, если со сроком", () => {
    expect(check(skip({ how: "todo" }), TODAY)).toEqual([]);
  });
});

describe("сводка", () => {
  it("без пропусков — «все тесты работают»", () => {
    expect(summary([], TODAY).said).toContain("все тесты работают");
  });

  it("со сроками — число и самый дальний", () => {
    const got = summary([skip(), skip({ test: "b", until: "2026-11-28" })], TODAY);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("пропусков 2");
    expect(got.said).toContain("самый дальний 2026-11-28");
  });

  it("проблема любого пропуска — красный", () => {
    expect(summary([skip({ until: null })], TODAY).ok).toBe(false);
  });

  it("плохая дата — замечание, а не тихий пропуск", () => {
    expect(check(skip({ until: "25.11" }), TODAY).join()).toContain("не дата");
    expect(days("2026-11-25")).not.toBeNull();
  });
});

describe("чего пропуск не делает", () => {
  it("не ради зелёного прогона", () => {
    expect(notDo()[0]).toContain("ради зелёного прогона");
    expect(checks()).toHaveLength(3);
  });
});
