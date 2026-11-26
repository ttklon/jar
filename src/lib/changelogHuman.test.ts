import { describe, expect, it } from "vitest";
import { belongsToHuman, check, checkAll, checks, MAX_WORDS, notBelongs, text, type Line } from "./changelogHuman";

/**
 * Шаг 466: changelog по-человечески — одна строка на изменение.
 */

const line = (over: Partial<Line> = {}): Line => ({ what: "программа понимает «почисти загрузки»", kind: "новое", todo: null, ...over });

describe("одна строка на изменение", () => {
  it("правильная строка проходит", () => {
    expect(check(line())).toEqual([]);
  });

  it("длинная — не строка", () => {
    const long = line({ what: Array.from({ length: 30 }, () => "слово").join(" ") });
    expect(check(long).join()).toContain("больше 25 не читают");
  });

  it("пустая — не сказано, что изменилось", () => {
    expect(check(line({ what: "   " })).join()).toContain("не сказано, что изменилось");
  });
});

describe("«исправлены ошибки» — отписка", () => {
  it("ловится", () => {
    expect(check(line({ what: "исправлены ошибки" })).join()).toContain("отписка");
  });

  it("«улучшена стабильность» — тоже", () => {
    expect(check(line({ what: "улучшена стабильность работы" })).join()).toContain("отписка");
  });

  it("конкретное исправление — проходит", () => {
    expect(check(line({ what: "окно больше не уезжает на второй монитор", kind: "исправлено" }))).toEqual([]);
  });
});

describe("строка целиком", () => {
  it("вид первым словом", () => {
    expect(text(line())).toBe("Новое: программа понимает «почисти загрузки»");
  });

  it("действие — в скобках", () => {
    expect(text(line({ kind: "изменилось", todo: "переназначить клавишу" }))).toContain("(переназначить клавишу)");
  });
});

describe("повторы и техническое", () => {
  it("одинаковые строки — замечание", () => {
    expect(checkAll([line(), line()]).join()).toContain("повторяется");
  });

  it("техническое — не сюда", () => {
    const got = notBelongs().join();
    expect(got).toContain("рефакторинг");
    expect(got).toContain("без изменения поведения");
  });

  it("что попадает — четыре пункта", () => {
    expect(belongsToHuman()).toHaveLength(4);
    expect(checks()).toHaveLength(3);
    expect(MAX_WORDS).toBe(25);
  });
});
