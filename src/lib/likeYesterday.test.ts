import { describe, expect, it } from "vitest";
import { find, nothing, plan, sayAge, stale, when, type Done } from "./likeYesterday";

/**
 * Шаг 85: «сделай как вчера» должно найти вчерашнее.
 *
 * Память — это не только факты, но и способы: хранится сделанное, а не фраза.
 */
const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-20T09:00:00").getTime();
const todayStart = new Date("2026-11-20T00:00:00").getTime();

const done = (dayStart: number, said: string, steps = ["files-010"], over: Partial<Done> = {}): Done => ({
  dayStart,
  steps,
  params: { period: "март" },
  said,
  ...over,
});

describe("«как вчера» — конкретный день, а не «недавно»", () => {
  it("вчерашнее находится", () => {
    const got = find([done(todayStart - DAY, "сделай отчёт за март")], when("сделай как вчера") ?? "last", todayStart);
    expect(got.done?.said).toContain("март");
    expect(got.candidates).toBe(1);
  });

  it("сегодняшнее не считается вчерашним", () => {
    // Разница между «последнее» и «тогда» — это разница между повтором и ошибкой.
    const got = find([done(todayStart + 1000, "отчёт")], "yesterday", todayStart);
    expect(got.done).toBeNull();
    expect(got.why).toContain("вчера ничего");
  });

  it("«как обычно» берёт последнее", () => {
    const got = find(
      [done(todayStart - 5 * DAY, "старое"), done(todayStart - 1 * DAY, "недавнее")],
      when("сделай как обычно") ?? "last",
      todayStart,
    );
    expect(got.done?.said).toBe("недавнее");
  });

  it("несколько дел вчера — спросить, а не угадать", () => {
    const got = find(
      [done(todayStart - 1000, "утро"), done(todayStart - 2000, "вечер")],
      "yesterday",
      todayStart,
    );
    expect(got.done).toBeNull();
    expect(got.candidates).toBe(2);
    expect(got.why).toContain("какое");
  });
});

describe("хранится способ, а не фраза", () => {
  it("показываются шаги и параметры", () => {
    // Текст «сделай отчёт за март» сам по себе ничего не значит — значит план.
    const got = find([done(todayStart - DAY, "сделай отчёт")], "yesterday", todayStart);
    const lines = plan(got);
    expect(lines.join(" ")).toContain("files-010");
    expect(lines.join(" ")).toContain("period = март");
  });

  it("видно, что было сказано тогда", () => {
    // Чтобы человек проверил, что взято именно то.
    expect(plan(find([done(todayStart - DAY, "сделай отчёт за март")], "yesterday", todayStart))[0]).toContain(
      "сделай отчёт за март",
    );
  });
});

describe("вчерашнее может быть устаревшим", () => {
  it("сказано, если данные не свежие", () => {
    // «Как вчера» с сегодняшним числом — не повтор вчерашнего.
    const got = find([done(todayStart - DAY, "отчёт")], "yesterday", todayStart);
    expect(stale(got, now)).toBe(true);
    expect(sayAge(got, now)).toContain("свежие данные");
  });

  it("сегодняшнее не устарело", () => {
    const got = find([done(todayStart + 1000, "отчёт")], "today", todayStart);
    expect(stale(got, now)).toBe(false);
    expect(sayAge(got, now)).toBeNull();
  });
});

describe("не нашлось — сказать, а не сделать похожее", () => {
  it("«вчера ничего не делалось» — честно", () => {
    // Честное «не нашёл» дешевле неверного повтора.
    const got = find([], "yesterday", todayStart);
    expect(got.done).toBeNull();
    expect(nothing("yesterday")).toContain("повторять нечего");
    expect(nothing("yesterday")).toContain("в следующий раз");
  });

  it("«как вчера» распознаётся как вчера, а не как «недавно»", () => {
    expect(when("сделай как вчера")).toBe("yesterday");
    expect(when("сделай как обычно")).toBe("last");
    expect(when("сделай отчёт")).toBeNull();
  });

  it("«в пятницу» — названный день, а не «как вчера»", () => {
    const got = find([done(todayStart - DAY, "пятница")], "named", todayStart);
    expect(got.done?.said).toBe("пятница");
  });
});
