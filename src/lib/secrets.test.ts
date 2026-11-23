import { describe, expect, it } from "vitest";
import { clean, forLog, leaks, MARK, say, sendable } from "./secrets";

/**
 * Шаг 98: секреты вычищаются **до** отправки модели.
 *
 * «Сохрани пароль от почты в файл» — фраза уходит модели целиком, а секрет потом
 * не отозвать.
 */
describe("секрет вычищается, фраза остаётся", () => {
  it("«сохрани пароль: hunter2 в файл» — пароль не уходит", () => {
    const got = clean("сохрани пароль: hunter2 в файл");
    expect(got.any).toBe(true);
    expect(got.text).not.toContain("hunter2");
    expect(got.text).toContain("пароль");
    expect(got.text).toContain("файл");
  });

  it("ключ по префиксу узнаётся", () => {
    const got = clean("вставь sk-abcdefghijklmnop1234 в конфиг");
    expect(got.text).not.toContain("sk-abcdefghijklmnop1234");
    expect(got.text).toContain("конфиг");
    expect(got.found).toContain("ключ sk-");
  });

  it("токен GitHub и ключ AWS узнаются", () => {
    expect(clean("вставь ghp_abcdefghijklmnopqrst в файл").any).toBe(true);
    expect(clean("ключ AKIAIOSFODNN7EXAMPLE положи в переменную").any).toBe(true);
  });

  it("место секрета помечено, а не стёрто молча", () => {
    // «Сохрани в файл» без «пароль» — другая просьба.
    expect(clean("пароль: hunter2").text).toContain(MARK);
  });

  it("сказано, что вычищено, и что именно уйдёт", () => {
    const said = say(clean("пароль: hunter2 в файл"));
    expect(said).toContain("вычистил до отправки");
    expect(said).not.toContain("hunter2");
  });
});

describe("ложных срабатываний минимум", () => {
  it("обычное число не секрет", () => {
    // «Прошу 52 файла» — вычистить число значит сломать намерение.
    const got = clean("удали 52 файла");
    expect(got.any).toBe(false);
    expect(got.text).toBe("удали 52 файла");
  });

  it("обычная фраза не меняется", () => {
    const got = clean("найди большие файлы в загрузках");
    expect(got.any).toBe(false);
    expect(got.text).toBe("найди большие файлы в загрузках");
  });

  it("без секрета сказать нечего", () => {
    expect(say(clean("открой папку"))).toBe("");
  });
});

describe("вычистка до, а не после", () => {
  it("в журнал уходит вычищенное", () => {
    // Журнал нужен для разбора, а не для секретов.
    const got = clean("пароль: hunter2");
    expect(forLog(got)).not.toContain("hunter2");
  });

  it("отправлять можно всегда — после вычистки", () => {
    // Отказать целиком значит не понять просьбу.
    expect(sendable(clean("пароль: hunter2 в файл"))).toBe(true);
  });

  it("тест проверяет, что значение не осталось", () => {
    expect(leaks("пароль: hunter2", clean("пароль: hunter2"), "hunter2")).toBe(false);
  });
});
