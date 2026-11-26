import { describe, expect, it } from "vitest";
import { check, checks, LIMIT, mayEdit, next, notDo, whyNoRenumber, type Version } from "./planBoundary";

/**
 * Шаг 500: ровно 500 шагов — остальное новая версия плана.
 */

const version = (over: Partial<Version> = {}): Version => ({ name: "500", steps: 500, replaces: null, ...over });

describe("ровно пятьсот", () => {
  it("план на 500 — в порядке", () => {
    expect(check(version())).toEqual([]);
  });

  it("501 и больше — раздувание", () => {
    expect(check(version({ steps: 520 })).join()).toContain("это раздувание, а не новая версия");
  });

  it("имя — число, а не «финальная»", () => {
    expect(check(version({ name: "финальная" })).join()).toContain("имя должно быть числом");
  });

  it("версия без шагов — не версия", () => {
    expect(check(version({ steps: 0 })).join()).toContain("версия без шагов не версия");
  });

  it("не заменяет сама себя", () => {
    expect(check(version({ replaces: "500" })).join()).toContain("заменяет себя");
  });
});

describe("закрытая не правится", () => {
  it("500 из 500 — закрыта", () => {
    const got = mayEdit(version(), LIMIT);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("правка идёт в новую версию");
  });

  it("490 из 500 — открыта", () => {
    const got = mayEdit(version(), 490);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("править можно");
  });

  it("новая версия на 100 шагов закрыта при 100 — тоже", () => {
    expect(mayEdit(version({ name: "501", steps: 100, replaces: "500" }), 100).ok).toBe(false);
  });
});

describe("что дальше — числом", () => {
  it("осталось — сколько", () => {
    expect(next(version(), 490)).toBe("осталось 10: 490 из 500");
  });

  it("закрыт — дальше новая версия, а не 501-й шаг", () => {
    expect(next(version(), LIMIT)).toContain("а не 501-й шаг");
  });
});

describe("перенумерация запрещена", () => {
  it("номера — ссылки, проверяемые в CI", () => {
    const got = whyNoRenumber();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("step:452");
    expect(got[1]).toContain("ломает ссылки молча");
  });

  it("не правит закрытую, чтобы «уточнить формулировку»", () => {
    expect(notDo()[1]).toContain("уточнить формулировку");
    expect(checks()).toHaveLength(3);
  });
});
