import { describe, expect, it } from "vitest";
import { allowedWhy, checks, gaps, notDo, testsCovered, type Scope } from "./typesAllFiles";

/**
 * Шаг 485: проверка линз и типов на всех файлах, включая тесты.
 */

const scope = (over: Partial<Scope> = {}): Scope => ({
  all: ["src/lib/x.ts", "src/lib/x.test.ts"],
  included: ["src/lib/x.ts", "src/lib/x.test.ts"],
  excluded: [],
  ...over,
});

describe("файл вне проверки — назван", () => {
  it("всё включено — дыр нет", () => {
    expect(gaps(scope())).toEqual([]);
  });

  it("не включён и не исключён — назван", () => {
    expect(gaps(scope({ included: ["src/lib/x.ts"] })).join()).toContain("не включён в проверку типов");
  });

  it("исключён с причиной — законно", () => {
    expect(gaps(scope({ included: ["src/lib/x.ts"], excluded: [{ path: "src/lib/x.test.ts", why: "намеренно сломанный пример для теста" }] }))).toEqual([]);
  });

  it("исключён без причины — не законно", () => {
    const got = gaps(scope({ included: ["src/lib/x.ts"], excluded: [{ path: "src/lib/x.test.ts", why: "временно" }] }));
    expect(got[0]).toContain("исключён без причины");
  });
});

describe("тесты — не исключение", () => {
  it("все тесты в проверке — ок", () => {
    const got = testsCovered(scope());
    expect(got.ok).toBe(true);
    expect(got.said).toContain("все в проверке типов");
  });

  it("тест вне — назван числом и предупреждением", () => {
    const got = testsCovered(scope({ included: ["src/lib/x.ts"] }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("тестов вне проверки типов: 1");
    expect(got.said).toContain("типы не проверяет");
  });

  it("длинный список обрезается тремя", () => {
    const all = Array.from({ length: 5 }, (_, i) => `src/lib/t${i}.test.ts`);
    const got = testsCovered({ all, included: [], excluded: [] });
    expect(got.said).toContain("5 (");
    expect(got.said).toContain("…");
  });
});

describe("причины исключений", () => {
  it("три допустимые, и «временно» среди них нет", () => {
    const got = allowedWhy();
    expect(got).toHaveLength(3);
    expect(got.join()).not.toContain("временно");
  });

  it("vitest типы не проверяет — это записано", () => {
    expect(notDo()[2]).toContain("он их не проверяет");
    expect(checks()).toHaveLength(3);
  });
});
