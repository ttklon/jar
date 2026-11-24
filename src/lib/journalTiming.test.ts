import { describe, expect, it } from "vitest";
import { duration, late, say, slowest, SLOW_MS, text, within, type Entry } from "./journalTiming";

/**
 * Шаг 122: замер в журнале рядом с делом.
 *
 * Замер жил отдельно: «отвечает 4 секунды» — средняя, и по ней не видно, что
 * распознавание объёма занимает 9 секунд, а разговор — одну.
 */
const entries: Entry[] = [
  { heard: "открой калькулятор", did: "открыл", ms: 400 },
  { heard: "переименуй фото", did: "переименовал 12", ms: 2400 },
  { heard: "сколько места", did: "посчитал", ms: null },
];

describe("замер лежит рядом с делом, а не отдельно", () => {
  it("сначала дело, потом число", () => {
    // Число — уточнение, а не заголовок строки.
    expect(text(entries[0]!)).toBe("«открой калькулятор» → открыл · 400 мс");
  });

  it("секунды читаются как секунды, а не как 2400 мс", () => {
    expect(text(entries[1]!)).toContain("2,4 с");
  });

  it("замера нет — «не замерено», а не «0 мс»", () => {
    // Ноль выглядит как мгновенно.
    expect(text(entries[2]!)).toContain("не замерено");
    expect(within(entries[2]!)).toBeNull();
  });
});

describe("медленное помечено, а не только замерено", () => {
  it("дольше бюджета — помечено числом", () => {
    expect(text(entries[1]!)).toContain("дольше 1,5 с");
    expect(text(entries[0]!)).not.toContain("дольше");
  });

  it("бюджет по умолчанию назван", () => {
    expect(SLOW_MS).toBe(1500);
  });

  it("доля нарушений — числом, а не «в основном быстро»", () => {
    expect(late(entries)).toEqual({ count: 1, total: 2, share: 0.5 });
  });
});

describe("самое медленное названо — это ответ, а не таблица", () => {
  it("самая медленная строка с фразой", () => {
    expect(slowest(entries)?.heard).toBe("переименуй фото");
  });

  it("итог говорит и сколько, и что именно", () => {
    const said = say(entries);
    expect(said).toContain("не уложилось в 1,5 с: 1 из 2");
    expect(said).toContain("медленнее всего: «переименуй фото» — 2,4 с");
  });

  it("среднее не показывается вместо хвоста", () => {
    // Одно дело из десяти в 30 секунд при среднем 3,4 делало бы «нормально» ложью.
    const withTail: Entry[] = [...Array.from({ length: 9 }, () => ({ heard: "x", did: "y", ms: 100 })), { heard: "z", did: "w", ms: 30000 }];
    expect(say(withTail)).toContain("«z»");
  });

  it("замеров нет — так и сказано", () => {
    expect(say([entries[2]!])).toContain("замеров нет");
  });
});

describe("формат числа — по-человечески", () => {
  it("до секунды — миллисекунды", () => {
    expect(duration(12)).toBe("12 мс");
  });

  it("больше секунды — секунды с одним знаком", () => {
    expect(duration(1234)).toBe("1,2 с");
  });

  it("нет замера — не ноль", () => {
    expect(duration(null)).toBe("не замерено");
  });
});
