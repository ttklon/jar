import { describe, expect, it } from "vitest";
import { apply, gaps, parse, say, type Context } from "./contextKeep";

/**
 * Шаг 96: хранить последнюю фразу и контекст для «а теперь то же с другой папкой».
 *
 * «То же» понимается как вся прошлая фраза, включая путь, — и копирует не туда.
 */
const context = (over: Partial<Context> = {}): Context => ({
  verb: "скопируй",
  object: "отчёт",
  params: { path: "D:\\Backup", period: "март" },
  said: "скопируй отчёт за март в D:\\Backup",
  dangerous: false,
  ...over,
});

describe("заменяется только названное", () => {
  it("«с другой папкой» заменяет путь, но не период", () => {
    // Иначе копирует в тот же D:\Backup — то есть не то.
    const got = parse("а теперь то же с другой папкой D:\\Work", context());
    expect(got.ok).toBe(true);
    const next = apply(context(), got);
    expect(next.params.path).toBe("D:\\Work");
    expect(next.params.period).toBe("март");
    expect(next.verb).toBe("скопируй");
  });

  it("«за другой месяц» заменяет период, путь остаётся", () => {
    const got = parse("то же за другой месяц апрель", context());
    const next = apply(context(), got);
    expect(next.params.period).toMatch(/апрел/);
    expect(next.params.path).toBe("D:\\Backup");
  });

  it("прошлое не мутируется: «то же» дважды — от прошлого, а не от прошлой замены", () => {
    const base = context();
    const first = apply(base, parse("то же с другой папкой D:\\A", base));
    expect(base.params.path).toBe("D:\\Backup");
    expect(first.params.path).toBe("D:\\A");
  });
});

describe("нет контекста — «то же» не угадывается", () => {
  it("прошлой фразы нет — сказать прямо", () => {
    const got = parse("то же с другой папкой", null);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("прошлой фразы нет");
  });

  it("не «то же» — новая задача, контекст не нужен", () => {
    expect(parse("скопируй отчёт", context()).ok).toBe(false);
  });
});

describe("заменять нечего — это не «то же»", () => {
  it("параметра в прошлой фразе не было — не приклеивать", () => {
    // Молча добавить параметр значит придумать.
    const got = parse("то же за другой месяц апрель", context({ params: { path: "D:\\A" } }));
    expect(got.ok).toBe(false);
    expect(got.why).toContain("не было");
  });

  it("«с другой папкой» без названия папки — вопрос «какой?»", () => {
    // Придумать путь нельзя.
    const got = parse("то же с другой папкой", context());
    expect(gaps(got)).toContain("path");
    expect(got.swaps[0]?.value).toBe("");
  });
});

describe("опасность наследуется", () => {
  it("«то же» не делает опасное безопасным", () => {
    const got = parse("то же с другой папкой D:\\B", context({ dangerous: true }));
    const next = apply(context({ dangerous: true }), got);
    expect(next.dangerous).toBe(true);
    expect(say(context({ dangerous: true }), got)).toContain("необратимо");
  });

  it("без изменений «то же» повторяет прошлое", () => {
    const got = parse("сделай то же", context());
    expect(say(context(), got)).toContain("скопируй отчёт за март");
  });
});

describe("сказано, что осталось и что заменилось", () => {
  it("видно и прошлую фразу, и замену", () => {
    // Иначе человек не видит, что именно повторится.
    const said = say(context(), parse("то же с другой папкой D:\\Work", context()));
    expect(said).toContain("скопируй отчёт за март");
    expect(said).toContain("path = D:\\Work");
  });
});
