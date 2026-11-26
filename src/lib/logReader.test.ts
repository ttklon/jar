import { describe, expect, it } from "vitest";
import { dayKey, dayTitle, days, notShown, page, row, withoutFiles, type Item } from "./logReader";

/**
 * Шаг 433: журнал можно читать из приложения, без выхода в файлы.
 */

const now = new Date(2026, 10, 20, 15, 0).getTime();
const item = (over: Partial<Item> = {}): Item => ({ at: now, title: "почистил загрузки", level: "дело", ...over });

describe("по дням, а не сплошной лентой", () => {
  it("сегодня и вчера — по-русски", () => {
    const got = days([item(), item({ at: now - 86_400_000 })], now);
    expect(got.map((d) => d.title)).toEqual(["сегодня", "вчера"]);
  });

  it("дальше — дата словами", () => {
    expect(dayTitle(new Date(2026, 10, 18, 9, 0).getTime(), now)).toBe("18 ноября");
  });

  it("другой год — с годом", () => {
    expect(dayTitle(new Date(2025, 10, 18).getTime(), now)).toContain("2025");
  });

  it("день считается по местному времени", () => {
    expect(dayKey(new Date(2026, 10, 20, 0, 1).getTime())).toBe(dayKey(new Date(2026, 10, 20, 23, 59).getTime()));
  });

  it("внутри дня — новые сверху", () => {
    const got = days([item({ at: now - 1000 }), item({ at: now })], now)[0]!;
    expect(got.items[0]!.at).toBe(now);
  });
});

describe("старое — по кнопке, а не сразу", () => {
  it("показано 50 из 120", () => {
    const all = Array.from({ length: 120 }, (_, i) => item({ at: now - i * 1000 }));
    const got = page(all, 50);
    expect(got.items).toHaveLength(50);
    expect(got.more).toBe(70);
    expect(got.said).toContain("показано 50 из 120");
  });

  it("всё показано — так и сказано", () => {
    expect(page([item()], 50).said).toBe("показано всё: 1");
  });
});

describe("строка читается глазами", () => {
  it("время и что было", () => {
    expect(row(item())).toBe("15:00 почистил загрузки");
  });

  it("что не показываем — три запрета", () => {
    const got = notShown().join();
    expect(got).toContain("они в файле, а не на экране");
    expect(got).toContain("прячут дела");
  });

  it("без папки данных и блокнота", () => {
    expect(withoutFiles()).toContain("без разбора JSON");
  });
});
