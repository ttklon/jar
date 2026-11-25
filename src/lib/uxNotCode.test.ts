import { describe, expect, it } from "vitest";
import { DEP_BUDGET, forUser, summary, take, type Item } from "./uxNotCode";

/**
 * Шаг 293: брать приём, а не код, когда код тянет лишнее.
 *
 * Правило узкое: приём можно взять отдельно, а код тянет десяток зависимостей —
 * берём приём. Считается, а не решается на вкус.
 */

const item = (over: Partial<Item> = {}): Item => ({
  id: "palette",
  what: "одно поле как вход",
  codeDeps: 1,
  codeKb: 40,
  ideaCovers: true,
  ...over,
});

describe("дешёвый код берём кодом", () => {
  it("одна зависимость — дешевле взять, чем писать", () => {
    const got = take(item());
    expect(got.code).toBe(true);
    expect(got.why).toContain("дешевле взять его");
  });

  it("в причине есть число, а не «так лучше»", () => {
    expect(take(item()).why).toContain("1 зависимость, 40 КБ");
  });
});

describe("дорогой код заменяем приёмом", () => {
  it("больше трёх зависимостей и приём описан словами — берём приём", () => {
    const got = take(item({ codeDeps: 9, codeKb: 900 }));
    expect(got.code).toBe(false);
    expect(got.why).toContain("9 зависимостей, 900 КБ");
  });

  it("ровно на границе — ещё код", () => {
    // Граница проверяется отдельно: сдвиг DEP_BUDGET меняет решения молча.
    expect(take(item({ codeDeps: DEP_BUDGET })).code).toBe(true);
    expect(take(item({ codeDeps: DEP_BUDGET + 1 })).code).toBe(false);
  });

  it("склонение: 21 зависимость, 22 зависимости, 11 зависимостей", () => {
    expect(take(item({ codeDeps: 21 })).why).toContain("21 зависимость");
    expect(take(item({ codeDeps: 22 })).why).toContain("22 зависимости");
    expect(take(item({ codeDeps: 11 })).why).toContain("11 зависимостей");
  });

  it("исключение 12–14: двенадцать зависимостей, а не «двенадцать зависимости»", () => {
    // Без этой проверки сдвиг правила «2–4 → few» ловится только глазами.
    expect(take(item({ codeDeps: 12 })).why).toContain("12 зависимостей");
    expect(take(item({ codeDeps: 13 })).why).toContain("13 зависимостей");
    expect(take(item({ codeDeps: 14 })).why).toContain("14 зависимостей");
  });
});

describe("если приём словами не описан — код, но цена названа", () => {
  it("дорогой код без описания — принимаем явно", () => {
    const got = take(item({ ideaCovers: false, codeDeps: 8, codeKb: 640 }));
    expect(got.code).toBe(true);
    expect(got.why).toContain("придётся принять");
    expect(got.why).toContain("8 зависимостей");
  });

  it("недорогой код без описания — просто берём", () => {
    const got = take(item({ ideaCovers: false, codeDeps: 2 }));
    expect(got.code).toBe(true);
    expect(got.why).not.toContain("придётся принять");
  });
});

describe("итог считает, что не потянули", () => {
  it("два приёма и один код", () => {
    const got = summary([
      item({ codeDeps: 9, codeKb: 900 }),
      item({ id: "keys", codeDeps: 6, codeKb: 200 }),
      item({ id: "tz", codeDeps: 1, codeKb: 10 }),
    ]);
    expect(got.ideas).toBe(2);
    expect(got.code).toBe(1);
    expect(got.said).toContain("не потянули 15 зависимостей и 1100 КБ");
  });

  it("пользователю — в мегабайтах, а не «зависимостей меньше»", () => {
    expect(forUser(3, 9)).toBe("в сборке 3 чужие зависимости, это 9 МБ обновлений");
  });

  it("ничего лишнего — так и говорим", () => {
    expect(forUser(0, 0)).toBe("ничего лишнего в сборке");
  });
});
