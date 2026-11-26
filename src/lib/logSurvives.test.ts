import { describe, expect, it } from "vitest";
import { append, read, rescue, survives, type Row } from "./logSurvives";

/**
 * Шаг 429: журнал читается, даже если база повреждена.
 */

const row = (over: Partial<Row> = {}): Row => ({ at: 1, text: "почисти загрузки", ...over });

describe("битая строка не портит остальные", () => {
  const text = [JSON.stringify(row({ at: 1 })), "{битое", JSON.stringify(row({ at: 3 }))].join("\n");

  it("строки до и после сбойной читаются", () => {
    const got = read(text);
    expect(got.rows.map((r) => r.at)).toEqual([1, 3]);
  });

  it("испорченные считаются и называются", () => {
    const got = read(text);
    expect(got.broken).toBe(1);
    expect(got.said).toContain("1 испорчены и пропущены");
  });

  it("правильная форма, но не та — тоже испорчена", () => {
    expect(read('{"at": "не число", "text": "x"}').broken).toBe(1);
  });

  it("пустой журнал — не ошибка", () => {
    expect(read("").said).toBe("журнал пуст: записей ещё не было");
  });

  it("всё битое — сказано прямо", () => {
    expect(read("{a}\n{b}").said).toContain("не читается: 2 строки испорчены");
  });
});

describe("дописываем, а не перезаписываем", () => {
  it("новая строка в конце и с переводом", () => {
    const got = append(JSON.stringify(row({ at: 1 })) + "\n", row({ at: 2 }));
    expect(got.text.endsWith("\n")).toBe(true);
    expect(read(got.text).rows).toHaveLength(2);
  });

  it("файла нет — начинаем с нуля", () => {
    expect(read(append("", row()).text).rows).toHaveLength(1);
  });

  it("без перевода в конце не склеиваем строки", () => {
    const got = append(JSON.stringify(row({ at: 1 })), row({ at: 2 }));
    expect(read(got.text).broken).toBe(0);
  });
});

describe("что делать при поломке базы", () => {
  it("сначала достаём журнал, база потом", () => {
    const got = rescue([row(), row()]);
    expect(got[0]).toContain("2 записи из файла");
    expect(got[1]).toContain("резервной копии");
  });

  it("журнал был пуст — так и говорим", () => {
    expect(rescue([])[0]).toBe("записей нет: журнал был пуст");
  });

  it("что не теряется — три обещания", () => {
    expect(survives()).toHaveLength(3);
  });
});
