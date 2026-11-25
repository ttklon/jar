import { describe, expect, it } from "vitest";
import { HEADER, KINDS, read, report, sourceWord, write } from "./plainMemory";
import type { Sourced } from "./factOrigin";

/**
 * Шаг 285: Obsidian — файлы принадлежат человеку и читаемы.
 *
 * Взято: память — обычные текстовые файлы, которые открываются любым редактором.
 * Не взято: своя разметка, «хранилище» вместо файла, вложенные структуры.
 */

const NOW = 1_800_000_000_000;

const fact = (over: Partial<Sourced> = {}): Sourced => ({
  kind: "folder",
  value: "D:\\Отчёты",
  origin: "said",
  at: NOW,
  from: "",
  ...over,
});

describe("файл читается человеком", () => {
  it("в файле есть шапка, объясняющая, что это", () => {
    // Человек, открывший файл через год, не должен догадываться.
    expect(HEADER).toContain("принадлежит вам");
    expect(HEADER).toContain("Одна строка — один факт");
  });

  it("одна строка — один факт", () => {
    const text = write([fact(), fact({ value: "D:\\Фото" })]);
    const lines = text.split("\n").filter((line) => /^folder:/.test(line));
    expect(lines.length).toBe(2);
  });

  it("происхождение написано по-русски", () => {
    // Иначе через месяц не отличить своё слово от догадки.
    const text = write([fact({ origin: "shown" })]);
    expect(text).toContain("приложение заметило");
    expect(text).not.toContain("shown");
  });

  it("все виды называются одинаково", () => {
    expect(sourceWord("said")).toBe("вы сказали");
    expect(sourceWord("imported")).toBe("перенесено");
  });

  it("пустая память — файл с шапкой, а не пустой файл", () => {
    const text = write([]);
    expect(text).toContain("Память приложения");
    expect(text.trim().split("\n").filter((line) => /^\w+:/.test(line)).length).toBe(0);
  });
});

describe("файл можно поправить руками и вернуть", () => {
  it("прочитанное, записанное и прочитанное — то же самое", () => {
    const facts = [fact(), fact({ kind: "voice", value: "Алла", origin: "shown" })];
    const back = read(write(facts));
    expect(back.facts.map((item) => `${item.kind}:${item.value}`)).toEqual(["folder:D:\\Отчёты", "voice:Алла"]);
    expect(back.facts[1]!.origin).toBe("shown");
    expect(back.skipped).toEqual([]);
  });

  it("свои пометки не мешают", () => {
    // Человек имеет право писать в своём файле что угодно.
    const text = `${write([fact()])}\n# мои заметки\n// черновик\n`;
    const got = read(text);
    expect(got.facts.length).toBe(1);
    expect(got.skipped).toEqual([]);
  });

  it("лишние пробелы и пустые строки не ломают", () => {
    const got = read("\n\n   folder:    D:\\Отчёты   —  вы сказали   \n\n");
    expect(got.facts[0]!.value).toBe("D:\\Отчёты");
    expect(got.facts[0]!.origin).toBe("said");
  });

  it("без пометки происхождения факт считается сказанным", () => {
    // Человек, убравший комментарий, не хотел понизить факт до догадки.
    expect(read("folder: D:\\Отчёты").facts[0]!.origin).toBe("said");
  });
});

describe("непонятная строка называется, а не пропадает молча", () => {
  it("строка без вида — в список пропущенных", () => {
    const got = read(`${write([fact()])}\nэто просто текст\n`);
    expect(got.facts.length).toBe(1);
    expect(got.skipped).toEqual(["это просто текст"]);
  });

  it("незнакомый вид — пропуск, а не догадка", () => {
    const got = read("sticker: кот\n");
    expect(got.facts.length).toBe(0);
    expect(got.skipped[0]).toContain("sticker");
  });

  it("пустое значение — пропуск", () => {
    const got = read("folder:\n");
    expect(got.facts.length).toBe(0);
    expect(got.skipped.length).toBe(1);
  });

  it("сколько прочитано и сколько пропущено — числом", () => {
    const got = read(`${write([fact()])}\nчепуха\n`);
    expect(report(got)).toContain("прочитано 1");
    expect(report(got)).toContain("пропущено 1");
  });

  it("пустой файл отличается от «всё пропущено»", () => {
    expect(report(read(""))).toContain("файл пуст");
  });
});

describe("виды перечислены, а не угадываются", () => {
  it("пять видов, как в памяти", () => {
    expect(KINDS).toEqual(["folder", "program", "voice", "volume", "method"]);
  });
});
