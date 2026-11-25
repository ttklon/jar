import { describe, expect, it } from "vitest";
import { about, entry, line, notLogged, outcomeWord, recent, type Entry } from "./whoAsked";

/**
 * Шаг 404: журнал — кто что попросил. Без слежки, но с честной записью.
 */

const at = new Date(2026, 10, 20, 9, 12).getTime();
const e = (over: Partial<Entry> = {}): Entry => ({
  at, who: "Анна", said: "почисти загрузки", outcome: "done", ...over,
});

describe("одна строка на просьбу", () => {
  it("пустая просьба не пишется", () => {
    expect(entry("Анна", "   ", "done")).toBeNull();
  });

  it("без имени — «неизвестно кто», а не пусто", () => {
    expect(entry("", "проверь диск", "done")?.who).toBe("неизвестно кто");
  });

  it("строка по-русски с местным временем", () => {
    expect(line(e())).toBe("Анна, 09:12 — почисти загрузки → сделано");
  });

  it("отказ называет причину", () => {
    expect(line(e({ outcome: "refused", why: "гостю нельзя" }))).toBe("Анна, 09:12 — почисти загрузки → отказано: гостю нельзя");
  });

  it("итоги словами", () => {
    expect(outcomeWord("failed")).toBe("не получилось");
    expect(outcomeWord("cancelled")).toBe("отменено");
  });
});

describe("про человека — отчёт, а не оценка", () => {
  const entries = [e(), e({ outcome: "failed" }), e({ who: "Сын" }), e({ outcome: "cancelled" })];

  it("счёт по его просьбам", () => {
    const got = about(entries, "Анна");
    expect(got.total).toBe(3);
    expect(got.done).toBe(1);
    expect(got.failed).toBe(1);
  });

  it("нет записей — так и сказано", () => {
    expect(about(entries, "Гость").said).toBe("Гость: записей нет");
  });

  it("склонение просьб", () => {
    expect(about(entries, "Анна").said).toContain("3 просьбы");
  });
});

describe("новые сверху, обрезка по числу строк", () => {
  it("свежие первыми", () => {
    const got = recent([e({ at: 1 }), e({ at: 3 }), e({ at: 2 })], 2);
    expect(got.map((x) => x.at)).toEqual([3, 2]);
  });
});

describe("граница между записью и слежкой", () => {
  it("четыре запрета, включая стёртую фразу", () => {
    const got = notLogged().join();
    expect(got).toContain("набранная и удалённая фраза");
    expect(got).toContain("только имена и числа");
    expect(got).toContain("секреты");
  });
});
