import { describe, expect, it } from "vitest";
import { check, hashWellFormed, line, match, uncheckable } from "./signature";

/**
 * Шаг 174: подпись и хеш внешних файлов — не запускать что попало.
 *
 * «Нет подписи» и «подпись не сходится» — разные факты, и склеивать их значит
 * прятать второй.
 */

const GOOD = "a".repeat(64);
const OTHER = "b".repeat(64);

describe("форма хеша важна", () => {
  it("64 шестнадцатеричных знака — годится", () => {
    expect(hashWellFormed(GOOD)).toBe(true);
    expect(hashWellFormed(GOOD.toUpperCase())).toBe(true);
  });

  it("обрезанный или чужой алфавит — нет: он «сойдётся» с многим", () => {
    expect(hashWellFormed("abc")).toBe(false);
    expect(hashWellFormed("z".repeat(64))).toBe(false);
  });
});

describe("сверка хеша", () => {
  it("совпало — сказано, чем именно", () => {
    const got = match({ actual: GOOD, expected: GOOD });
    expect(got.ok).toBe(true);
    expect(got.said).toBe("хеш совпал: aaaaaaaaaaaa…");
  });

  it("регистр не важен", () => {
    expect(match({ actual: GOOD.toUpperCase(), expected: GOOD }).ok).toBe(true);
  });

  it("не совпало — это «другой файл», а не «мелкая разница»", () => {
    const got = match({ actual: OTHER, expected: GOOD });
    expect(got.ok).toBe(false);
    expect(got.said).toContain("это другой файл");
  });

  it("хеш без эталона — число, а не проверка", () => {
    expect(match({ actual: GOOD, expected: null }).said).toContain("эталона нет");
  });

  it("испорченный эталон назван, а не проглочен", () => {
    expect(match({ actual: GOOD, expected: "abc" }).said).toContain("эталон испорчен");
  });

  it("файл не считали — сверять нечего", () => {
    expect(match({ actual: null, expected: GOOD }).said).toContain("не посчитан");
  });
});

describe("подпись не сходится — хуже, чем её нет", () => {
  it("испорченная подпись — стоп, без вопроса", () => {
    const got = check("broken", { actual: OTHER, expected: GOOD });
    expect(got.trust).toBe("no");
    expect(got.ask).toBe(false);
    expect(got.said).toContain("файл подменили после подписи");
  });

  it("нет подписи — «не проверено», а не «вирус»", () => {
    const got = check("none", { actual: null, expected: null });
    expect(got.trust).toBe("unknown");
    expect(got.said).toContain("это не «чисто», это «не проверено»");
  });

  it("подпись проверить не удалось — незнание не разрешение", () => {
    expect(check("unknown", { actual: null, expected: null }).said).toContain("незнание не разрешение");
  });
});

describe("хеш и подпись отвечают на разные вопросы", () => {
  it("хеш совпал, подписи нет — файл тот, автор неизвестен", () => {
    const got = check("none", { actual: GOOD, expected: GOOD });
    expect(got.trust).toBe("yes");
    expect(got.said).toContain("это про автора, а не про файл");
    // Решение остаётся человеку: «файл тот» не значит «автор известен».
    expect(got.ask).toBe(true);
  });

  it("подпись есть, эталона нет — автор виден, файл сверить не с чем", () => {
    const got = check("valid", { actual: null, expected: null });
    expect(got.trust).toBe("yes");
    expect(got.said).toContain("эталона хеша нет");
    expect(got.ask).toBe(false);
  });

  it("всё сходится — без вопроса", () => {
    const got = check("valid", { actual: GOOD, expected: GOOD });
    expect(got.trust).toBe("yes");
    expect(got.ask).toBe(false);
    expect(got.said).toContain("подпись сходится");
  });

  it("эталон есть, файл не тот — стоп, даже если подпись сходится", () => {
    const got = check("valid", { actual: OTHER, expected: GOOD });
    expect(got.trust).toBe("no");
    expect(got.ask).toBe(false);
  });
});

describe("строка для экрана", () => {
  it("проверено, не проверено и проверить нечем — разные первые слова", () => {
    expect(line("valid", { actual: GOOD, expected: GOOD })).toContain("проверено:");
    expect(line("broken", { actual: OTHER, expected: GOOD })).toContain("НЕ проверено:");
    expect(line("none", { actual: null, expected: null })).toContain("проверить нечем:");
  });

  it("невозможность проверки называется прямо, а не замалчивается", () => {
    expect(uncheckable("tool.exe")).toContain("это не проверка");
    expect(uncheckable("tool.exe")).toContain("по вашему слову");
  });
});
