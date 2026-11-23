import { describe, expect, it } from "vitest";
import { answer, coverage, full, line, permanent, worst } from "./handAnswer";

/**
 * Шаг 105: любая рука отвечает — что сделано, чем доказано, что не отменяется.
 *
 * «Нажал» вместо «сделано»; пустое доказательство читалось как «всё хорошо».
 */
describe("три поля, и все обязательны", () => {
  it("полный отчёт — три поля и ни одной дыры", () => {
    const got = answer({ did: "создал папку D:\\Отчёты", proof: "путь существует", risk: "write-local" }, "создать папку");
    expect(got.did).toContain("создал папку");
    expect(got.proof).toContain("путь существует");
    expect(got.gaps).toEqual([]);
    expect(full(got)).toBe(true);
  });

  it("пустое доказательство не читается как успех", () => {
    // Именно так пустая строка и читалась.
    const got = answer({ did: "сделал", proof: "  ", risk: "read" }, "проверить");
    expect(got.proof).toContain("не проверено");
    expect(got.gaps).toContain("чем доказано");
  });

  it("«нажал» без предмета назван дырой, а не отчётом", () => {
    const got = answer({ risk: "read" }, "открыть программу");
    expect(got.gaps).toContain("что сделано");
    expect(got.did).toContain("не сказала");
  });
});

describe("что не отменяется — сказано до нажатия", () => {
  it("риск destructive назван неотменяемым", () => {
    const got = answer({ did: "удалил 12 файлов", proof: "12 файлов нет", risk: "destructive" }, "удалить");
    expect(got.permanent).toContain("не отменяется");
  });

  it("чтение и запись отменяемы, и об этом не шумят", () => {
    const got = answer({ did: "посчитал", proof: "12 файлов", risk: "read" }, "посчитать");
    expect(got.permanent).toBe("");
    expect(got.gaps).toEqual([]);
  });

  it("незнакомый риск — неотменяемый, а не безопасный", () => {
    // То же правило, что в шаге 101: неизвестное не выглядит безопасным.
    expect(permanent("что-то новое")).toBe(true);
    expect(permanent(null)).toBe(true);
    expect(permanent("write-local")).toBe(false);
  });

  it("молчание руки об отменяемости — дыра, а не «отменяется»", () => {
    // Ни риска, ни прямого ответа: выдать «отменяется» значит обещать возврат,
    // которого может не быть.
    const got = answer({ did: "сделал", proof: "видно" }, "сделать");
    expect(got.gaps).toContain("что не отменяется");
  });

  it("риск из реестра — уже ответ об отменяемости", () => {
    // Рука, назвавшая риск, ответила и на третий вопрос.
    expect(answer({ did: "сделал", proof: "видно", risk: "write-local" }, "сделать").gaps).toEqual([]);
  });
});

describe("«любая рука» — это число", () => {
  it("покрытие считается, а не обещается", () => {
    const list = [
      answer({ did: "a", proof: "b", undoable: true }, "x"),
      answer({ did: "a", proof: "", undoable: true }, "x"),
      answer({}, "x"),
    ];
    const got = coverage(list);
    expect(got.total).toBe(3);
    expect(got.full).toBe(1);
    expect(got.share).toBeCloseTo(1 / 3);
  });

  it("чаще всего не хватает доказательства — это одна правка во всех руках", () => {
    // Риск назван у обоих, поэтому вторая дыра — та, которой чаще не хватает.
    const list = [answer({ did: "a", risk: "read" }, "x"), answer({ did: "a", proof: "p", risk: "read" }, "x")];
    expect(worst(list)[0]?.gap).toBe("чем доказано");
    // Обе руки без доказательства — и это одна правка во всех руках сразу.
    expect(worst(list)[0]?.times).toBe(1);
  });

  it("строка для человека называет дыры, а не молчит", () => {
    const said = line(answer({ did: "a" }, "x"));
    expect(said).toContain("рука не ответила");
  });
});
