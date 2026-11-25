import { describe, expect, it } from "vitest";
import { line, record, stats, tooManySkips, whyFromRuns, type Record_ } from "./skippedHonest";

/**
 * Шаг 326: пропуск дела, если условие не наступило — без «успеха» в журнале.
 *
 * «Работало 30 дней подряд» на деле может значить «не работало ни разу».
 */

const rec = (over: Partial<Record_> = {}): Record_ => ({
  what: "отчёт о диске",
  outcome: "done",
  why: "",
  at: 9 * 60,
  ...over,
});

describe("три исхода, а не два", () => {
  it("пропуск без причины не записывается", () => {
    const got = record("отчёт о диске", "skipped", "", 540);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("неотличимо от тишины");
  });

  it("ошибка без причины — тоже", () => {
    expect(record("уборка", "failed", "  ", 540).ok).toBe(false);
  });

  it("пропуск с причиной записывается", () => {
    const got = record("отчёт о диске", "skipped", "места было достаточно", 540);
    expect(got.ok).toBe(true);
    expect(got.said).toBe("отчёт о диске: не запускалось — места было достаточно");
  });

  it("успеху причина не нужна", () => {
    expect(record("уборка", "done", "", 540).ok).toBe(true);
  });
});

describe("пропуск не портит статистику", () => {
  it("процент считается от запусков, а не от дней", () => {
    const got = stats([rec(), rec(), rec({ outcome: "failed", why: "папка занята" }), rec({ outcome: "skipped", why: "мало файлов" })]);
    expect(got.tried).toBe(3);
    expect(got.said).toContain("удачных 2 (67 %)");
    expect(got.said).toContain("пропущено 1 — не входит в счёт");
  });

  it("только пропуски — так и говорим, а не «0 % успеха»", () => {
    const got = stats([rec({ outcome: "skipped", why: "мало файлов" }), rec({ outcome: "skipped", why: "мало файлов" })]);
    expect(got.said).toContain("ни одного запуска");
    expect(got.said).toContain("2 пропусков");
  });

  it("пусто — ноль без деления на ноль", () => {
    expect(stats([]).said).toContain("ни одного запуска");
  });

  it("причина названа: условие может не наступать неделями", () => {
    expect(whyFromRuns()).toContain("0 % у правила");
  });
});

describe("в журнале пропуск помечен словом, а не галочкой", () => {
  it("пропуск", () => {
    expect(line(rec({ outcome: "skipped", why: "мало файлов", at: 3 * 60 + 5 }))).toBe(
      "03:05 отчёт о диске: пропущено — мало файлов",
    );
  });

  it("сделано", () => {
    expect(line(rec({ at: 9 * 60 + 30 }))).toBe("09:30 отчёт о диске: сделано");
  });

  it("ошибка", () => {
    expect(line(rec({ outcome: "failed", why: "нет прав" }))).toContain("ошибка — нет прав");
  });
});

describe("слишком частые пропуски — вопрос к условию, а не к правилу", () => {
  it("пять пропусков подряд без единого запуска — сказать", () => {
    const got = tooManySkips(6, 0);
    expect(got).toContain("так ли оно задумано");
    expect(got).not.toContain("не работает");
  });

  it("были запуски — не придираемся", () => {
    expect(tooManySkips(10, 2)).toBeNull();
  });

  it("три пропуска — ещё рано", () => {
    expect(tooManySkips(3, 0)).toBeNull();
  });
});
