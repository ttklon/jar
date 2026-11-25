import { describe, expect, it } from "vitest";
import { SUBJECTS, due, mark, nextReview, overdueDays, plan } from "./quarterly";

/**
 * Шаг 300: пересматривать таблицу раз в квартал — мир меняется.
 *
 * «У них этого нет» через полгода перестаёт быть правдой, а «нам это не нужно» — тоже.
 */

const FEB = Date.UTC(2026, 1, 15);
const APR = Date.UTC(2026, 3, 15);

describe("квартал — по календарю, а не 90 дней", () => {
  it("15 февраля → 1 апреля, а не 16 мая", () => {
    // «Через 90 дней» от 15 февраля — это уже следующий квартал.
    expect(new Date(nextReview(FEB)).toISOString().slice(0, 10)).toBe("2026-04-01");
  });

  it("декабрь → 1 января следующего года", () => {
    expect(new Date(nextReview(Date.UTC(2026, 11, 20))).toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("31 марта — пересмотр 1 апреля, и ровно 1 апреля уже пора", () => {
    const mar31 = Date.UTC(2026, 2, 31);
    expect(due(mar31, Date.UTC(2026, 2, 31))).toBe(false);
    expect(due(mar31, Date.UTC(2026, 3, 1))).toBe(true);
  });
});

describe("пора — значит, список с причиной", () => {
  it("срок наступил — пора", () => {
    expect(due(FEB, APR)).toBe(true);
  });

  it("ещё не наступил — не пора", () => {
    expect(due(FEB, FEB)).toBe(false);
  });

  it("план называет, что именно проверить", () => {
    const got = plan(FEB);
    expect(got.items.length).toBe(SUBJECTS.length);
    expect(got.items[0]).toContain("конкуренты выпускают");
  });

  it("лицензии тоже пересматриваются: автор может сменить", () => {
    expect(SUBJECTS.map((subject) => subject.what)).toContain("лицензии взятых компонентов");
  });

  it("просрочка в днях, без отрицательных чисел", () => {
    expect(overdueDays(FEB, APR)).toBe(14);
    expect(overdueDays(FEB, FEB)).toBe(0);
  });
});

describe("отметка отдельно от создания", () => {
  it("«ничего» — тоже ответ", () => {
    const got = mark(
      [
        { what: "таблица заимствований", at: APR, changed: "ничего" },
        { what: "лицензии", at: APR, changed: "apache → mit у одной зависимости" },
      ],
      APR,
    );
    expect(got.said).toContain("изменилось 1 из 2");
    expect(got.unchanged).toEqual(["таблица заимствований"]);
  });

  it("пустой пересмотр — не пересмотр", () => {
    expect(mark([], APR).said).toContain("из 0");
  });
});
