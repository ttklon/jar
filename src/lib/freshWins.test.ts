import { describe, expect, it } from "vitest";
import { choose, counts, edited, fill, mark, type Field } from "./freshWins";

/**
 * Шаг 265: память не подменяет свежую фразу — приоритет у сказанного сейчас.
 *
 * Дефект: память и разбор фразы жили рядом и не встречались. Человек говорит
 * «открой отчёты в D:\Новое\Отчёты», а приложение подставляет запомненное
 * `D:\Отчёты` — подсказка перекрывает то, что сказали **сейчас**. Это худший вид
 * ошибки: не «не понял», а «понял и заменил своим».
 *
 * Так выходит само собой: подсказка заполняет поле, а заполненное поле
 * неотличимо от сказанного — и догадка побеждает по умолчанию.
 */

const field = (said: string, remembered: string): Field => ({ said, remembered });

describe("сказанное сейчас сильнее памяти — всегда (шаг 265)", () => {
  it("сказанное не заменяется запомненным", () => {
    const got = choose(field("D:\\Новое\\Отчёты", "D:\\Отчёты"));
    expect(got.value).toBe("D:\\Новое\\Отчёты");
    expect(got.from).toBe("said");
  });

  it("и это не «обычно», а при любом расхождении", () => {
    const pairs: Array<[string, string]> = [
      ["D:\\Новое", "D:\\Отчёты"],
      ["Code", "Word"],
      ["Алла", "Борис"],
      ["30", "70"],
    ];
    for (const [said, remembered] of pairs) {
      expect(choose(field(said, remembered)).value).toBe(said);
    }
  });

  it("память заполняет только пустое", () => {
    const got = choose(field("", "D:\\Отчёты"));
    expect(got.value).toBe("D:\\Отчёты");
    expect(got.from).toBe("memory");
  });

  it("и ничего не подставляет, если нет ни того, ни другого", () => {
    expect(choose(field("", "")).from).toBe("empty");
    expect(choose(field("  ", "  ")).value).toBe("");
  });
});

describe("подстановка видна как подстановка, а не как сказанное", () => {
  it("у значения из памяти есть отметка", () => {
    // Человек, который видит заполненное поле, считает его своим.
    expect(mark(choose(field("", "D:\\Отчёты")))).toBe("из памяти");
    expect(mark(choose(field("D:\\Отчёты", "D:\\Отчёты")))).toBe("");
  });

  it("сказанное возвращается как есть — без нормализации и обрезки", () => {
    // Человек должен увидеть ровно то, что набрал.
    const got = fill(field("  D:\\Новое  ", "D:\\Отчёты"));
    expect(got.value).toBe("  D:\\Новое  ");
    expect(got.hint).toBe("");
  });
});

describe("противоречие называется, а не разрешается молча", () => {
  it("при расхождении сказано, что было в памяти и что взято", () => {
    // Не повод «поправить» человека — повод сказать.
    const got = choose(field("D:\\Новое", "D:\\Отчёты"));
    expect(got.conflict).toBe(true);
    expect(got.why).toContain("вы сказали «D:\\Новое»");
    expect(got.why).toContain("в памяти «D:\\Отчёты»");
    expect(got.why).toContain("беру сказанное");
  });

  it("и это видно в том, что показывают", () => {
    expect(fill(field("D:\\Новое", "D:\\Отчёты")).note).toContain("беру сказанное");
    // Если сказанное совпало с памятью, шума нет.
    expect(fill(field("D:\\Отчёты", "D:\\Отчёты")).note).toBe("");
  });

  it("регистр, слэши и кавычки — не противоречие", () => {
    // `D:\Отчёты`, `d:\отчёты` и `D:\Отчёты\` для человека одно и то же.
    // Объявлять это противоречием значит поднимать шум на пустом месте.
    expect(choose(field("d:\\отчёты", "D:\\Отчёты")).conflict).toBe(false);
    expect(choose(field("D:\\Отчёты\\", "D:\\Отчёты")).conflict).toBe(false);
    expect(choose(field('"D:\\Отчёты"', "D:\\Отчёты")).conflict).toBe(false);
    expect(choose(field("D:\\\\Отчёты", "D:\\Отчёты")).conflict).toBe(false);
  });

  it("настоящее расхождение при этом ловится", () => {
    // Иначе предыдущая проверка просто отключила бы обнаружение.
    expect(choose(field("D:\\Отчёты2", "D:\\Отчёты")).conflict).toBe(true);
  });
});

describe("исправление подсказки — это слово человека", () => {
  it("стёр подсказку и напечатал своё — это сказанное", () => {
    expect(edited("D:\\Отчёты", "D:\\Новое")).toBe(true);
    // И такое слово сильнее памяти тем более.
    expect(choose(field("D:\\Новое", "D:\\Отчёты")).from).toBe("said");
  });

  it("не тронул подсказку — она остаётся подсказкой", () => {
    expect(edited("D:\\Отчёты", "D:\\Отчёты")).toBe(false);
  });
});

describe("сводка для журнала", () => {
  it("сколько раз память уступила и сколько было противоречий", () => {
    const got = counts([
      choose(field("D:\\Новое", "D:\\Отчёты")),
      choose(field("", "Code")),
      choose(field("Word", "Word")),
      choose(field("Алла", "Борис")),
    ]);
    expect(got.said).toBe(3);
    expect(got.memory).toBe(1);
    expect(got.conflicts).toBe(2);
  });

  it("пустой набор — нули, а не ошибка", () => {
    expect(counts([])).toEqual({ said: 0, memory: 0, conflicts: 0 });
  });
});
