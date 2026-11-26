import { describe, expect, it } from "vitest";
import { anchor, build, check, checks, notDo, type Source } from "./oneDoc";

/**
 * Шаг 480: документация собирается в один читаемый файл для офлайн-просмотра.
 */

const source = (over: Partial<Source> = {}): Source => ({ path: "docs/A.md", title: "Как начать", order: 2, body: "Текст про начало.", ...over });

describe("порядок чтения, а не алфавит", () => {
  it("собирает по order", () => {
    const got = build([source({ title: "Подробности", order: 9 }), source({ title: "Что это", order: 1 })]);
    expect(got.headings).toEqual(["Что это", "Подробности"]);
    expect(got.problems).toEqual([]);
  });

  it("одинаковый порядок — предупреждение", () => {
    const got = build([source({ title: "А", order: 1 }), source({ path: "docs/B.md", title: "Б", order: 1 })]);
    expect(got.problems.join()).toContain("порядок чтения неоднозначен");
  });

  it("пустой документ — предупреждение, а не дыра", () => {
    const got = build([source(), source({ title: "Пусто", order: 3, body: "  " })]);
    expect(got.headings).toEqual(["Как начать"]);
    expect(got.problems.join()).toContain("«Пусто» пуст: пропущен");
  });
});

describe("оглавление и якоря внутри файла", () => {
  it("якорь из заголовка", () => {
    expect(anchor("Как начать")).toBe("как-начать");
    expect(anchor("Что это?")).toBe("что-это");
  });

  it("оглавление есть, и в нём ссылки на заголовки", () => {
    const got = build([source()]);
    expect(got.text).toContain("## Оглавление");
    expect(got.text).toContain("- [Как начать](#как-начать)");
    expect(check(got, ["как-начать"])).toEqual([]);
  });

  it("ссылка на несуществующий заголовок — битая", () => {
    const got = build([source()]);
    expect(check(got, ["чего-нет"]).join()).toContain("ведёт в никуда");
  });

  it("два одинаковых заголовка — второй якорь с числом", () => {
    const got = build([source(), source({ path: "docs/B.md", order: 5 })]);
    expect(got.problems.join()).toContain("якорь «как-начать» занят");
  });
});

describe("файл производный", () => {
  it("шапка говорит, что править его бессмысленно", () => {
    expect(build([source()]).text).toContain("Править этот файл бессмысленно");
  });

  it("не сортируется по алфавиту и не правится руками", () => {
    expect(notDo()[2]).toContain("не сортируется по алфавиту");
    expect(checks()).toHaveLength(3);
  });

  it("пустой файл — ошибка проверки", () => {
    expect(check({ text: "ничего", headings: [], problems: [] }, []).join()).toContain("нет ни одного документа");
  });
});
