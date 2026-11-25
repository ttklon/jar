import { describe, expect, it } from "vitest";
import { MIN_WHY, drop, find, remind, review, type Attempt, type Entry } from "./triedLog";

/**
 * Шаг 294: ревью «что взяли и не взлетело» — записывать, чтобы не повторять.
 *
 * Без записи через полгода кто-то снова скажет «а давайте как в Notion».
 */

const DAY = 86_400_000;
const started = Date.UTC(2026, 0, 10);

const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  what: "живые блоки как в Notion",
  started,
  dropped: started + 12 * DAY,
  why: "блоки ломали поиск: половина памяти оказывалась вне текста",
  instead: "память одной строкой на факт",
  ...over,
});

const entry = (over: Partial<Entry> = {}): Entry => ({
  what: "живые блоки как в Notion",
  days: 12,
  why: "блоки ломали поиск: половина памяти оказывалась вне текста",
  instead: "память одной строкой на факт",
  ...over,
});

describe("запись делается при выбрасывании", () => {
  it("три части на месте — записано", () => {
    const got = drop(attempt());
    expect(got.ok).toBe(true);
    expect(got.entry?.days).toBe(12);
    expect(got.said).toContain("12 дней");
  });

  it("«не зашло» — это не причина", () => {
    const got = drop(attempt({ why: "не зашло" }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не отличить от новой идеи");
  });

  it("короткая причина тоже не проходит", () => {
    expect(drop(attempt({ why: "было плохо" })).ok).toBe(false);
  });

  it("без «что вместо» записывать некуда", () => {
    const got = drop(attempt({ instead: "  " }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("попробуют снова");
  });

  it("даты перепутаны — ловим, а не показываем минус", () => {
    const got = drop(attempt({ dropped: started - DAY }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("даты перепутаны");
  });

  it("порог причины назван числом", () => {
    expect(MIN_WHY).toBe(20);
  });
});

describe("журнал ищется до начала работы", () => {
  const entries = [entry(), entry({ what: "палитра в стиле Raycast", why: "поиск по картинкам не нужен", instead: "только текст", days: 4 })];

  it("поиск по причине, а не по дате", () => {
    expect(find(entries, "картинк").length).toBe(1);
    // «поиск» есть в обеих причинах — это факт, а не совпадение.
    expect(find(entries, "поиск").length).toBe(2);
  });

  it("пустой запрос не находит всё подряд", () => {
    expect(find(entries, "   ")).toEqual([]);
  });

  it("напоминание называет срок и причину", () => {
    const got = remind(entries, "живые блоки");
    expect(got).toContain("продержалось 12 дней");
    expect(got).toContain("вместо — память одной строкой");
  });

  it("чего не пробовали — молчание, а не выдумка", () => {
    expect(remind(entries, "голосовой ввод")).toBeNull();
  });
});

describe("ревью ищет общую причину", () => {
  it("пусто — так и говорим", () => {
    expect(review([]).said).toContain("или их не записывали");
  });

  it("большинство провалов в первый месяц — это факт о приёмах", () => {
    const got = review([entry({ days: 3 }), entry({ days: 8 }), entry({ days: 200 })]);
    expect(got.common).toContain("первые 30 дней");
  });

  it("если сроки разные — общей причины нет", () => {
    expect(review([entry({ days: 200 }), entry({ days: 90 })]).common).toBeNull();
  });
});
