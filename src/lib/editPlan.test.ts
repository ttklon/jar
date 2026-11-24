import { describe, expect, it } from "vitest";
import { change, fields, printOf, ready, validate } from "./editPlan";

/**
 * Шаг 116: редактирование плана человеком — в понятных полях, не в JSON.
 *
 * Одна пропущенная кавычка в JSON — и план невалиден, а ошибка говорит про позицию
 * 143, а не про «путь пустой».
 */
const plan: { params: Record<string, string> }[] = [
  { params: { path: "D:\\Отчёты" } },
  { params: { from: "D:\\a.pdf", to: "D:\\Архив\\a.pdf" } },
];

describe("поля названы словами, а не именами параметров", () => {
  it("path — это «Куда положить», а не path", () => {
    const got = fields(plan);
    expect(got[0]?.label).toBe("Куда положить");
    expect(got[0]?.hint).toContain("полный путь");
  });

  it("незнакомый параметр не получает выдуманной подписи", () => {
    // Лучше честное `timeout`, чем выдуманное «Когда».
    const got = fields([{ params: { timeout: "5" } }]);
    expect(got[0]?.label).toBe("timeout");
    expect(got[0]?.hint).toContain("подписи нет");
  });

  it("у каждого поля есть номер шага: правка привязана к шагу", () => {
    expect(fields(plan).map((field) => field.position)).toEqual([0, 1, 1]);
  });
});

describe("сломанное поле не ломает остальные", () => {
  it("пустое обязательное поле названо словами", () => {
    const field = fields(plan)[0]!;
    expect(validate(field, "  ")?.problem).toContain("обязательно");
  });

  it("относительный путь отвергается до запуска", () => {
    // Иначе ядро раскроет его откуда попало, и это выяснится не там, где правили.
    const field = fields(plan)[0]!;
    expect(validate(field, "Отчёты")?.problem).toContain("полный путь");
  });

  it("полный путь проходит", () => {
    expect(validate(fields(plan)[0]!, "E:\\Новое")).toBeNull();
  });

  it("число проверяется как число", () => {
    const field = { position: 0, name: "count", label: "Сколько", hint: "", value: "3", required: true };
    expect(validate(field, "три")?.problem).toContain("число");
    expect(validate(field, "12")).toBeNull();
  });

  it("одна плохая правка не мешает другим примениться", () => {
    const got = change(plan, [
      { position: 0, name: "path", value: "Ерунда" },
      { position: 1, name: "to", value: "D:\\Новое\\a.pdf" },
    ]);
    expect(got.result.problems).toHaveLength(1);
    expect(got.steps[1]?.params["to"]).toBe("D:\\Новое\\a.pdf");
    expect(got.steps[0]?.params["path"]).toBe("D:\\Отчёты");
  });
});

describe("проверка до запуска", () => {
  it("что изменится — названо словами, с подписью поля", () => {
    const got = change(plan, [{ position: 0, name: "path", value: "E:\\Новое" }]);
    expect(got.result.said[0]).toBe('шаг 1: «Куда положить» — было D:\\Отчёты, стало E:\\Новое');
  });

  it("правка требует нового согласия", () => {
    // Плата за удобство не может быть обходом согласия (шаг 117).
    expect(change(plan, [{ position: 0, name: "path", value: "E:\\Новое" }]).result.consent).toBe(true);
  });

  it("та же правка — не требует согласия и не считается изменением", () => {
    const got = change(plan, [{ position: 0, name: "path", value: "D:\\Отчёты" }]);
    expect(got.result.consent).toBe(false);
    expect(got.result.said[0]).toContain("правок нет");
  });

  it("с ошибкой запускать нельзя", () => {
    const got = change(plan, [{ position: 0, name: "path", value: "" }]);
    expect(ready(got.result)).toBe(false);
  });

  it("без ошибок — можно", () => {
    expect(ready(change(plan, [{ position: 1, name: "to", value: "D:\\Новое\\a.pdf" }]).result)).toBe(true);
  });
});

describe("правка не меняет чужого", () => {
  it("исходный план не переписывается: правка — копия", () => {
    const before = JSON.stringify(plan);
    change(plan, [{ position: 0, name: "path", value: "E:\\Новое" }]);
    expect(JSON.stringify(plan)).toBe(before);
  });

  it("новый параметр добавляется с названной строкой", () => {
    const got = change(plan, [{ position: 0, name: "timeout", value: "5" }]);
    expect(got.result.said[0]).toContain("добавлен параметр timeout");
    expect(got.steps[0]?.params["timeout"]).toBe("5");
  });

  it("шага с таким номером нет — названо, а не проглочено", () => {
    const got = change(plan, [{ position: 9, name: "path", value: "E:\\x" }]);
    expect(got.result.problems[0]?.problem).toContain("шага с таким номером нет");
  });

  it("отпечаток правленого шага считается по параметрам", () => {
    expect(printOf({ params: { a: "1", b: "2" } })).toBe(printOf({ params: { b: "2", a: "1" } }));
  });
});
