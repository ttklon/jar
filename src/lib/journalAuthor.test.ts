import { describe, expect, it } from "vitest";
import { byPerson, line, notWatching, scheduleWhileAway, type Ran } from "./journalAuthor";

/**
 * Шаг 414: журнал показывает, чей профиль выполнил дело.
 */

const ran = (over: Partial<Ran> = {}): Ran => ({ what: "почисти загрузки", asked: "Анна", did: "Анна", ...over });

describe("автор выполнения виден", () => {
  it("совпало — одно имя", () => {
    expect(line(ran())).toBe("почисти загрузки — Анна");
  });

  it("не совпало — оба имени и причина", () => {
    const got = line(ran({ did: "Сын", why: "расписание сработало" }));
    expect(got).toBe("почисти загрузки — попросила Анна, выполнил профиль Сын (расписание сработало)");
  });

  it("не выполнено — так и сказано", () => {
    expect(line(ran({ did: null, why: "профиль выключен" }))).toBe("почисти загрузки — попросила Анна, не выполнено: профиль выключен");
  });
});

describe("расписание и отсутствующий профиль", () => {
  it("опасное не выполняется от чужого имени", () => {
    const got = scheduleWhileAway("Анна", true);
    expect(got.runs).toBe(false);
    expect(got.said).toContain("от чужого имени опасное не выполняется");
  });

  it("безопасное — выполняется, и автор записывается честно", () => {
    const got = scheduleWhileAway("Анна", false);
    expect(got.runs).toBe(true);
    expect(got.said).toContain("чей это профиль");
  });
});

describe("сводка по людям", () => {
  it("по числу дел, а не по имени", () => {
    const got = byPerson([ran(), ran(), ran({ did: "Сын" })]);
    expect(got[0]).toEqual({ name: "Анна", count: 2 });
    expect(got[1]).toEqual({ name: "Сын", count: 1 });
  });

  it("не выполненное считается за попросившего", () => {
    expect(byPerson([ran({ did: null })])[0]!.name).toBe("Анна");
  });
});

describe("это не слежка", () => {
  it("три запрета, включая оценки", () => {
    const got = notWatching().join();
    expect(got).toContain("это не дело, а слежка");
    expect(got).toContain("а не характеристика человека");
  });
});
