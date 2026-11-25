import { describe, expect, it } from "vitest";
import { KEEP_DATA, WIPE_ALL, byList, confirm, dangers, listing, size, type Row } from "./wipeListing";

/**
 * Шаг 319: удаление — выбор «оставить данные» / «удалить всё» с явным списком.
 *
 * «Данные» человеку ничего не значат; путь и размер — значат.
 */

const row = (over: Partial<Row> = {}): Row => ({
  what: "память",
  path: "%LOCALAPPDATA%\\ZShelper\\data\\memory.md",
  mb: 8,
  precious: true,
  ...over,
});

describe("список до подтверждения", () => {
  it("в «оставить данные» нет ни одной драгоценной строки", () => {
    expect(KEEP_DATA.some((item) => item.precious)).toBe(false);
  });

  it("в «удалить всё» — память, журнал и настройки", () => {
    const precious = WIPE_ALL.filter((item) => item.precious).map((item) => item.what);
    expect(precious.length).toBe(3);
    expect(precious.join()).toContain("память");
  });

  it("у каждой строки полный путь, а не только название", () => {
    expect(WIPE_ALL.every((item) => item.path.includes("ZShelper"))).toBe(true);
  });

  it("«оставить» освобождает модели, но не память", () => {
    const got = confirm("keep");
    expect(got).toContain("останутся");
    expect(got).toContain("4.4 ГБ");
  });

  it("«удалить всё» называет безвозвратное поимённо", () => {
    const got = confirm("wipe");
    expect(got).toContain("Безвозвратно");
    expect(got).toContain("память");
  });

  it("размер по-человечески", () => {
    expect(size(4200)).toBe("4.1 ГБ");
    expect(size(8)).toBe("8 МБ");
  });
});

describe("удаление по списку, а не по маске", () => {
  it("трогает только то, что в списке", () => {
    const got = byList(
      [row({ path: "%LOCALAPPDATA%\\ZShelper\\data\\memory.md" })],
      ["%LOCALAPPDATA%\\ZShelper\\data\\memory.md", "%LOCALAPPDATA%\\ZShelper\\data\\мой-файл.txt"],
    );
    expect(got.remove).toEqual(["%LOCALAPPDATA%\\ZShelper\\data\\memory.md"]);
    expect(got.kept).toEqual(["%LOCALAPPDATA%\\ZShelper\\data\\мой-файл.txt"]);
  });

  it("файл человека в папке данных остаётся", () => {
    const got = byList(listing("wipe"), ["%LOCALAPPDATA%\\ZShelper\\data\\мой-файл.txt"]);
    expect(got.remove).toEqual([]);
    expect(got.kept.length).toBe(1);
  });

  it("маска вместо пути — опасна", () => {
    expect(dangers([row({ path: "%LOCALAPPDATA%\\ZShelper\\*" })]).join()).toContain("маска");
  });

  it("корень диска — опасно", () => {
    expect(dangers([row({ path: "C:\\" })]).join()).toContain("корень диска");
  });

  it("папка приложения целиком — там может лежать файл человека", () => {
    expect(dangers([row({ path: "D:\\Tools\\ZShelper" })]).join()).toContain("файл человека");
  });

  it("наш собственный список безопасен", () => {
    expect(dangers(WIPE_ALL)).toEqual([]);
    expect(dangers(KEEP_DATA)).toEqual([]);
  });
});
