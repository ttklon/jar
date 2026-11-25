import { describe, expect, it } from "vitest";
import { SHOWN, parse, search, shortlist, stem } from "./recall";
import type { Fact } from "./memoryView";

/**
 * Шаг 268: поиск по памяти словами человека — не по ключам базы.
 *
 * В памяти лежит `folder:D:\Отчёты` и `method:переименуй фото`, а человек ищет
 * словами, которыми сам говорил: «отчёты», «переименовать фото», «та папка с
 * отчётами». Наивный поиск подстрокой ломается на регистре и окончаниях, на
 * путях и на пустом ответе.
 */

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: "folder:D:\\Отчёты",
  kind: "folder",
  label: "папка D:\\Отчёты",
  why: "открывали 4 раза",
  removable: true,
  because: "",
  ...over,
});

const MEMORY: Fact[] = [
  fact(),
  fact({ id: "folder:D:\\Фото", label: "папка D:\\Фото", why: "открывали 2 раза" }),
  fact({ id: "voice:Алла", kind: "voice", label: "голос Алла", why: "выбирали 3 раза" }),
  fact({ id: "method:переименуй фото", kind: "method", label: "способ: переименуй фото", why: "повторяли дважды" }),
  fact({ id: "volume:40", kind: "volume", label: "громкость 40%", why: "ставили дважды" }),
];

describe("вопрос разбирается на слова человека", () => {
  it("регистр и ё не различаются", () => {
    // «Отчёты» в памяти, «отчеты» в вопросе — одно и то же.
    const got = search(MEMORY, "ОТЧЕТЫ");
    expect(got.hits.length).toBe(1);
    expect(got.hits[0]!.fact.label).toContain("Отчёты");
  });

  it("служебные слова выбрасываются", () => {
    // Без этого «с» совпало бы и с фотографиями, и с отчётами.
    expect(parse("папка с отчётами").words).toEqual(["папка", "отчетами"]);
  });

  it("вопрос без слов — не «нашлось всё»", () => {
    const got = search(MEMORY, "и в на");
    expect(got.hits.length).toBe(0);
    expect(got.said).toContain("что искать");
  });
});

describe("окончания сравниваются по основе", () => {
  it("«отчётами» находит «Отчёты»", () => {
    const got = search(MEMORY, "отчётами");
    expect(got.hits.length).toBe(1);
    expect(got.hits[0]!.fact.label).toContain("Отчёты");
  });

  it("«переименовать фото» находит способ «переименуй фото»", () => {
    // Одно и то же действие человек называет по-разному в разные дни.
    const got = search(MEMORY, "переименовать фото");
    expect(got.hits.length).toBeGreaterThan(0);
    expect(got.hits[0]!.fact.kind).toBe("method");
  });

  it("короткие слова не обрезаются до пустоты", () => {
    // Иначе «дом» стал бы «д» и совпал бы со всем подряд.
    expect(stem("дом")).toBe("дом");
    expect(stem("фото")).toBe("фото");
    expect(stem("отчёты")).toBe("отчет");
  });

  it("окончание не срезается, если остаётся огрызок", () => {
    // «Запах» без защиты длины потерял бы «ах» и стал «зап» — и совпал бы со
    // всем, где эти три буквы есть: «записать», «запасов», «западня».
    expect(stem("запах")).toBe("запах");
    expect(stem("запахи")).toBe("запах");
    expect(stem("фотографии")).toBe("фотографи");
  });
});

describe("путь — не то, что человек помнит", () => {
  it("«отчёты» находит папку с путём D:\\Отчёты\\2024", () => {
    const got = search([fact({ id: "folder:D:\\Отчёты\\2024", label: "папка D:\\Отчёты\\2024" })], "отчёты");
    expect(got.hits.length).toBe(1);
  });

  it("буква диска не становится словом", () => {
    // Из `D:\Отчёты` приходит `d`; как слово оно совпало бы с каждой папкой на
    // диске D, то есть со всей памятью сразу, — и поиск «D:\Фото» нашёл бы всё.
    expect(parse("D:\\Фото").words).toEqual(["фото"]);
    const got = search(MEMORY, "D:\\Отчёты");
    expect(got.hits.length).toBe(1);
  });

  it("диск и слэши не нужны, но и не мешают", () => {
    // Буква диска — не слово: иначе `D` совпало бы с каждой папкой на диске D,
    // то есть со всей памятью сразу. А слово «фото» честно находит и папку, и
    // способ «переименуй фото» — поиск идёт словами, а не по ключам.
    const got = search(MEMORY, "D:\\Фото");
    expect(got.hits.length).toBe(2);
    expect(got.hits.some((hit) => hit.fact.label.includes("Фото"))).toBe(true);
    expect(got.hits.some((hit) => hit.fact.label.includes("Отчёты"))).toBe(false);
  });

  it("вид находится словом «папка», а не только ключом folder", () => {
    // В базе `folder`, а человек говорит «папка».
    const got = search(MEMORY, "папка");
    expect(got.hits.length).toBe(2);
  });
});

describe("порядок — по тому, насколько это то", () => {
  it("совпавшее целиком идёт раньше совпавшего частью", () => {
    const got = search(MEMORY, "переименуй фото");
    expect(got.hits[0]!.fact.kind).toBe("method");
  });

  it("в объяснении — слова человека, а не ключи", () => {
    const got = search(MEMORY, "отчёты");
    expect(got.hits[0]!.because).toContain("совпало");
    expect(got.hits[0]!.because).not.toContain("folder:");
  });
});

describe("пустой ответ — тоже ответ", () => {
  it("«ничего не нашлось» отличается от «память пуста»", () => {
    const empty = search([], "отчёты");
    const none = search(MEMORY, "борщ");
    expect(empty.said).toContain("память пуста");
    expect(none.said).toContain("ничего не нашлось");
    expect(none.said).toContain("борщ");
  });

  it("ничего не нашлось — подсказка, что делать", () => {
    const got = search(MEMORY, "борщ");
    expect(got.said).toContain("одно слово");
  });

  it("нашлось — число фактов, а не список", () => {
    const got = search(MEMORY, "папка");
    expect(got.said).toContain("нашлось 2 факта");
  });
});

describe("если нашлось много", () => {
  it("показываются первые пять, и сказано, сколько ещё", () => {
    const many = Array.from({ length: 8 }, (_, i) => fact({ id: `folder:D:\\Отчёты${i}`, label: `папка D:\\Отчёты ${i}` }));
    const got = shortlist(search(many, "отчёты").hits);
    expect(SHOWN).toBe(5);
    expect(got.shown.length).toBe(5);
    expect(got.more).toBe(3);
    expect(got.said).toContain("и ещё 3 похожих");
  });

  it("влезло всё — ничего лишнего не говорится", () => {
    const got = shortlist(search(MEMORY, "отчёты").hits);
    expect(got.more).toBe(0);
    expect(got.said).toBe("");
  });
});
