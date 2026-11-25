import { describe, expect, it } from "vitest";
import { absent, build, fileName, summary, type Out } from "./profileExport";

/**
 * Шаг 415: экспорт профиля — один файл с понятным содержимым.
 */

const out = (over: Partial<Out> = {}): Out => ({
  name: "Анна",
  facts: ["аллергия на кошек"],
  grants: ["удаление — Загрузки"],
  at: "2026-11-20T09:12:00",
  ...over,
});

describe("файл читается человеком", () => {
  it("подписи по-русски, а не f1", () => {
    const got = build(out());
    expect(got).toContain('"что это": "профиль ZShelper');
    expect(got).toContain('"версия": 1');
    expect(got).toContain('"имя": "Анна"');
  });

  it("это настоящий JSON", () => {
    const parsed = JSON.parse(build(out()));
    expect(parsed["факты"]).toEqual(["аллергия на кошек"]);
    expect(parsed["разрешения"]).toEqual(["удаление — Загрузки"]);
  });

  it("запятые между элементами — без лишней в конце", () => {
    const got = build(out({ facts: ["a", "b"] }));
    expect(got).toContain('    "a",\n    "b"\n');
  });

  it("пустой профиль тоже валиден", () => {
    expect(JSON.parse(build(out({ facts: [], grants: [] }))).факты).toEqual([]);
  });
});

describe("до сохранения видно, что в файле", () => {
  it("по-русски и с числами", () => {
    const got = summary(out({ facts: ["a", "b"] }));
    expect(got).toContain("профиль «Анна»");
    expect(got).toContain("2 факта памяти");
    expect(got).toContain("можно поправить одну строку руками");
  });
});

describe("имя файла открывается там, куда его отправят", () => {
  it("кириллица транслитерируется, дата в имени", () => {
    expect(fileName("Анна", new Date(2026, 10, 20))).toBe("zshelper-anna-2026-11-20.json");
  });

  it("пробелы и знаки схлопываются", () => {
    expect(fileName("Анна  Иванова!", new Date(2026, 0, 5))).toBe("zshelper-anna-ivanova-2026-01-05.json");
  });

  it("пустое имя — profile, а не пусто", () => {
    expect(fileName("   ", new Date(2026, 0, 5))).toContain("zshelper-profile-");
  });
});

describe("чего в файле не бывает", () => {
  it("три отсутствия, включая id устройства", () => {
    const got = absent().join();
    expect(got).toContain("id устройства");
    expect(got).toContain("пароли и ключи");
  });
});
