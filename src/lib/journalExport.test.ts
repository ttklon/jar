import { describe, expect, it } from "vitest";
import { absent, build, reader, shortenPath, type Line } from "./journalExport";

/**
 * Шаг 423: экспорт журнала в файл для поддержки, с вычисткой секретов.
 */

const at = new Date(2026, 10, 20, 9, 12).getTime();
const line = (over: Partial<Line> = {}): Line => ({ at, text: "почисти загрузки — сделано", ...over });

describe("файл собирается и честно себя описывает", () => {
  it("шапка: строки, окно, сколько вычищено", () => {
    const got = build([line()], at);
    expect(got.text).toContain("журнал ZShelper для поддержки");
    expect(got.text).toContain("строк: 1, за последние 24 ч");
    expect(got.text).toContain("имя пользователя Windows в файле отсутствует");
  });

  it("время в строке без даты", () => {
    expect(build([line()], at).text).toContain("09:12 почисти загрузки");
  });

  it("нет записей за время — так и сказано", () => {
    const got = build([line({ at: at - 48 * 3_600_000 })], at);
    expect(got.said).toContain("нет записей за это время");
  });
});

describe("секреты вычищаются и здесь", () => {
  it("пароль из журнала не уходит", () => {
    const got = build([line({ text: "сохрани пароль от почты: qwerty123" })], at);
    expect(got.cleaned).toBeGreaterThan(0);
    expect(got.text).not.toContain("qwerty123");
  });
});

describe("пути сокращаются, имя пользователя исчезает", () => {
  it("полный путь — до последних частей", () => {
    expect(shortenPath("C:\\Users\\anna\\AppData\\Local\\ZShelper\\logs\\app.log")).toBe("…\\app.log");
  });

  it("путь без диска тоже сокращается", () => {
    expect(shortenPath("/home/anna/.zshelper/logs/app.log")).toContain("…");
  });

  it("обычный текст не трогается", () => {
    expect(shortenPath("почисти загрузки — сделано")).toBe("почисти загрузки — сделано");
  });

  it("имя пользователя из файла не попадает", () => {
    const got = build([line({ text: "открыл C:\\Users\\anna\\Загрузки\\файл.zip" })], at);
    expect(got.text).not.toContain("anna");
  });
});

describe("человек читает первым", () => {
  it("сказано до отправки", () => {
    expect(build([line()], at).said).toContain("Прочитайте его перед отправкой");
  });

  it("что файл не содержит — три пункта", () => {
    expect(absent()).toHaveLength(3);
    expect(reader()).toContain("только он");
  });
});
