import { describe, expect, it } from "vitest";
import { coverage, notDo, render, whatToDo, type Row } from "./failIsolated";

/**
 * Шаг 369: чужой сбой не прячет моё дело — изоляция.
 */

const row = (over: Partial<Row> = {}): Row => ({ id: "1", what: "уборка загрузок", readable: true, ...over });

describe("сбой одного дела — одна строка", () => {
  it("битый отчёт не прячет соседей", () => {
    const rows = [row({ id: "a", what: "разбор отчёта", readable: false, error: "файл обрезан" }), row({ id: "b" })];
    const shown = render(rows, (r) => `${r.what}: готово`);
    expect(shown.length).toBe(2);
    expect(shown[1]!.text).toBe("уборка загрузок: готово");
  });

  it("в строке сбоя — причина и «остальные на месте»", () => {
    const shown = render([row({ readable: false, error: "файл обрезан" })], () => "");
    expect(shown[0]!.broken).toBe(true);
    expect(shown[0]!.text).toContain("файл обрезан");
    expect(shown[0]!.text).toContain("Остальные дела на месте");
  });

  it("исключение при отрисовке ловится, лента целая", () => {
    const rows = [row({ id: "a" }), row({ id: "b", what: "голос" })];
    const shown = render(rows, (r) => {
      if (r.id === "a") throw new Error("сломался рендер");
      return "ок";
    });
    expect(shown.length).toBe(2);
    expect(shown[0]!.text).toContain("сломался рендер");
    expect(shown[1]!.text).toBe("ок");
  });

  it("причина не записана — так и говорим", () => {
    expect(render([row({ readable: false })], () => "")[0]!.text).toContain("причина не записана");
  });
});

describe("счёт не даёт «одно скрыто» выглядеть как «всё в порядке»", () => {
  it("всё читается", () => {
    expect(coverage([row()], render([row()], () => "ok"))).toBe("показано 1 из 1");
  });

  it("одно не читается — названо", () => {
    const rows = [row({ id: "a", readable: false }), row({ id: "b" })];
    expect(coverage(rows, render(rows, () => "ok"))).toBe("показано 1 из 2, 1 дело не читается");
  });

  it("склонение", () => {
    const rows = [row({ id: "a", readable: false }), row({ id: "b", readable: false }), row({ id: "c" })];
    expect(coverage(rows, render(rows, () => "ok"))).toContain("2 дела не читается");
  });
});

describe("нечитаемое не удаляем", () => {
  it("отчёт не мешает остальным — удалять не нужно", () => {
    expect(whatToDo(row({ readable: false }))).toContain("удалять отчёт не нужно");
  });

  it("три запрета: не скрывать, не экран ошибки, не «упрощать»", () => {
    const got = notDo().join();
    expect(got).toContain("потерять запись");
    expect(got).toContain("один сбой — одна строка");
    expect(got).toContain("именно неудачные человек и ищет");
  });
});
