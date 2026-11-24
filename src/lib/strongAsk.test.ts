import { describe, expect, it } from "vitest";
import { allows, covers, level, mark, question, summary, type Danger } from "./strongAsk";

/**
 * Шаг 113: неотменяемый шаг помечен до запуска и спрашивает сильнее.
 *
 * «Удалить 12 файлов» и «посчитать 12 файлов» спрашивали одинаково — одной
 * галочкой, и её жали не читая.
 */
const remove: Danger = { what: "удалить 12 файлов", undoable: false, price: "12 файлов без копии", risk: "destructive" };
const count: Danger = { what: "посчитать файлы", undoable: true, risk: "read" };
const one: Danger = { what: "удалить отчёт", undoable: false, price: "1 файл", risk: "destructive" };

describe("пометка стоит до запуска", () => {
  it("необратимый шаг помечен ценой, а не словом «риск»", () => {
    expect(mark(remove)).toBe("НЕ ОТМЕНИТЬ: 12 файлов без копии");
  });

  it("отменяемый помечен тоже — пустой знак значит «отменяемо»", () => {
    expect(mark(count)).toBe("отменяемо");
  });

  it("цена не названа — сказано «возврата нет»", () => {
    expect(mark({ ...remove, price: "" })).toContain("возврата нет");
  });
});

describe("чем дороже, тем сильнее вопрос", () => {
  it("много файлов — вопрос со словом", () => {
    expect(level(remove)).toBe("word");
    expect(question(remove).text).toContain("Напишите «удалить»");
  });

  it("один файл — вопрос с ценой, без слова", () => {
    // Три уровня — уже анкета; второй уровень для одного файла достаточен.
    expect(level(one)).toBe("price");
    expect(question(one).text).toContain("не отменить");
    expect(question(one).text).toContain("1 файл");
  });

  it("отменяемое спрашивают обычной галочкой и не пугают", () => {
    // Пуганое согласие обесценивает настоящее.
    expect(question(count).text).toBe("посчитать файлы?");
  });

  it("цена — в самом вопросе, а не примечанием под ним", () => {
    expect(question(remove).text).toContain("12 файлов без копии");
  });
});

describe("слабый ответ не отвечает на сильный вопрос", () => {
  it("галочка не считается ответом там, где просят слово", () => {
    // Иначе сильный вопрос обходится слабым ответом.
    expect(allows(remove, { checked: true })).toBe(false);
    expect(allows(remove, { word: "удалить" })).toBe(true);
  });

  it("слово должно быть тем, что просили", () => {
    expect(allows(remove, { word: "да" })).toBe(false);
    expect(allows(remove, { word: " УДАЛИТЬ " })).toBe(true);
  });

  it("на обычный вопрос слово не требуется", () => {
    expect(allows(count, { checked: true })).toBe(true);
    expect(allows(count, {})).toBe(false);
  });
});

describe("общее согласие не покрывает необратимое", () => {
  it("«выполнить всё» не значит «удали»", () => {
    expect(covers(remove, true)).toBe(false);
    expect(covers(count, true)).toBe(true);
  });
});

describe("сводка — числом", () => {
  it("необратимые названы отдельно", () => {
    expect(summary([count, remove, one])).toBe("необратимых 2 из 3, из них со словом 1");
  });

  it("всё отменяемо — так и сказано", () => {
    expect(summary([count, count])).toBe("все 2 шагов отменяемы");
  });
});
