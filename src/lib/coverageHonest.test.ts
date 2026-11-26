import { describe, expect, it } from "vitest";
import { check, checks, FLOOR, notDo, summary, verdict, whereItWorks, type Cover } from "./coverageHonest";

/**
 * Шаг 487: отчёт о покрытии там, где он не врёт.
 */

const cover = (over: Partial<Cover> = {}): Cover => ({ path: "src/lib/x.ts", lines: 100, hit: 90, asserted: 85, importedByTest: true, ...over });

describe("три вида модулей", () => {
  it("есть утверждения — проверен", () => {
    expect(verdict(cover())).toBe("проверен");
  });

  it("исполняется, но без утверждений — «исполнен»", () => {
    expect(verdict(cover({ asserted: 0 }))).toBe("исполнен");
  });

  it("ни одной строки — не покрыт", () => {
    expect(verdict(cover({ hit: 0, asserted: 0 }))).toBe("не покрыт");
  });
});

describe("порог — по модулю, а не по проекту", () => {
  it("ниже порога — назван числом", () => {
    expect(check([cover({ path: "src/lib/bad.ts", hit: 20, asserted: 20 })]).join()).toContain("покрыто 20% (ниже 50%)");
  });

  it("исполнен без утверждений — это не проверка", () => {
    expect(check([cover({ asserted: 0 })]).join()).toContain("ни одного утверждения");
  });

  it("тест не импортирует — покрытие может быть случайным", () => {
    expect(check([cover({ importedByTest: false })]).join()).toContain("тест его не импортирует");
  });

  it("хороший модуль — без замечаний", () => {
    expect(check([cover()])).toEqual([]);
  });
});

describe("среднее не прячет худшего", () => {
  it("девять хороших и один нулевой — худший назван", () => {
    const good = Array.from({ length: 9 }, (_, i) => cover({ path: `src/lib/g${i}.ts` }));
    const got = summary([...good, cover({ path: "src/lib/zero.ts", hit: 0, asserted: 0 })]);
    expect(got.average).toBeGreaterThan(80);
    expect(got.worst).toBe("src/lib/zero.ts (0%)");
    expect(got.said).toContain("смотрите худший");
  });

  it("считает строки с утверждениями отдельно", () => {
    expect(summary([cover()]).said).toContain("Строк с утверждениями 85 из 90");
  });

  it("пустой список — не деление на ноль", () => {
    expect(summary([]).average).toBe(0);
  });

  it("порог — половина", () => {
    expect(FLOOR).toBe(0.5);
  });
});

describe("где процент значит и чего не делает", () => {
  it("три места, первое — по модулю", () => {
    const got = whereItWorks();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("по модулю");
  });

  it("не гонится за ста процентами", () => {
    expect(notDo()[0]).toContain("не гонится за 100%");
    expect(checks()).toHaveLength(3);
  });
});
