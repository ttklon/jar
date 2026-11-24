import { describe, expect, it } from "vitest";
import { compared, line, reconciles, restored, slow, slowest, stored, sum, type Report } from "./deedTiming";

/**
 * Шаг 135: замер каждого дела и хранение рядом с отчётом.
 *
 * В отчёте у шага не было времени: «шаг 2 не выполнен» — и не видно, упал он сразу или
 * висел 20 секунд.
 */
const report: Report = {
  totalMs: 6000,
  rows: [
    { position: 1, what: "проверить место", ms: 400 },
    { position: 2, what: "сжать фото", ms: 2000 },
  ],
};

describe("замер — поле строки отчёта", () => {
  it("число стоит рядом с делом, а не отдельно", () => {
    expect(line(report.rows[1]!)).toBe("2. сжать фото · 2000 мс");
  });

  it("незамеренное — «не замерено», а не «0 мс»", () => {
    // Ноль выглядит как мгновенно.
    expect(line({ position: 3, what: "ждали очередь", ms: null })).toContain("не замерено");
  });
});

describe("сумма сходится с целым или расхождение названо", () => {
  it("сходится — так и сказано", () => {
    const got = reconciles({ totalMs: 2450, rows: report.rows });
    expect(got.ok).toBe(true);
    expect(got.said).toContain("сходится");
  });

  it("расхождение названо, а не спрятано: где остальное время", () => {
    const got = reconciles(report);
    expect(got.ok).toBe(false);
    expect(got.gap).toBe(3600);
    expect(got.said).toContain("3600 мс ушло не на шаги");
  });

  it("незамеренный шаг не считается нулём", () => {
    const got = reconciles({ totalMs: 6000, rows: [...report.rows, { position: 3, what: "ожидание", ms: null }] });
    expect(got.unknown).toBe(1);
    expect(got.said).toContain("шагов без замера: 1");
  });

  it("сумма больше целого — замер неверен, и это сказано", () => {
    expect(reconciles({ totalMs: 100, rows: report.rows }).said).toContain("замер неверен");
  });
});

describe("самое медленное названо с долей", () => {
  it("ответ на «что чинить»", () => {
    const got = slowest(report);
    expect(got.row?.what).toBe("сжать фото");
    expect(got.said).toContain("медленнее всего: «сжать фото»");
  });

  it("без замеров — назвать нечего, и это сказано", () => {
    expect(slowest({ totalMs: 0, rows: [] }).said).toBe("замеров нет — назвать нечего");
  });
});

describe("замер переживает закрытие окна", () => {
  it("отчёт хранится вместе с числами", () => {
    const kept = restored(stored(report));
    expect(kept.totalMs).toBe(6000);
    expect(kept.rows[1]?.ms).toBe(2000);
  });

  it("пустое хранилище — честно без чисел", () => {
    expect(restored(null)).toEqual({ totalMs: 0, rows: [] });
  });

  it("сравнение с прошлым — числом, а не «стало быстрее»", () => {
    const before = restored({ totalMs: 9000, rows: [] });
    expect(compared(report, before)).toBe("быстрее на 3000 мс: 6000 против 9000");
  });

  it("сравнивать не с чем — так и сказано", () => {
    expect(compared(report, null)).toContain("сравнивать не с чем");
  });
});

describe("что медленно — списком", () => {
  it("по убыванию, только то, что дольше порога", () => {
    const rows = slow(report.rows, 500);
    expect(rows.map((row) => row.what)).toEqual(["сжать фото"]);
  });

  it("сумма — числом и без незамеренных", () => {
    expect(sum(report.rows)).toEqual({ ms: 2400, unknown: 0 });
  });
});
