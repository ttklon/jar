import { describe, expect, it } from "vitest";
import { build, example } from "./memoryReport";
import { EMPTY, give } from "./grants";
import type { Sourced } from "./factOrigin";

/**
 * Шаг 278: отчёт «что память знает обо мне» одной страницей.
 *
 * Экран памяти (263) даёт работать с памятью, но не отвечает на вопрос, с
 * которым приходят, впервые задумавшись о приватности: **что вы обо мне знаете**.
 * Список из сорока строк на него не отвечает: видно каждую строку — и не видно
 * картины.
 */

const NOW = 1_800_000_000_000;

const fact = (over: Partial<Sourced> = {}): Sourced => ({
  kind: "folder",
  value: "C:\\Users\\Иван\\Отчёты",
  origin: "said",
  at: NOW,
  from: "",
  ...over,
});

describe("сначала «обо мне», потом техническое", () => {
  it("голоса и папки идут раньше способов", () => {
    const got = build(
      [fact({ kind: "method", value: "переименуй фото" }), fact({ kind: "voice", value: "Алла" }), fact()],
      EMPTY,
      0,
      NOW,
    );
    expect(got.rows.map((row) => row.what)).toEqual(["голоса", "папки", "способы работы"]);
  });

  it("виды без фактов не занимают место", () => {
    const got = build([fact()], EMPTY, 0, NOW);
    expect(got.rows.length).toBe(1);
  });

  it("у каждой строки есть пример и происхождение", () => {
    const got = build([fact()], EMPTY, 0, NOW);
    expect(got.rows[0]!.example).toContain("C:\\");
    expect(got.rows[0]!.origin).toContain("вы сказали: 1");
  });
});

describe("отчёт не становится вторым местом, где лежат адреса", () => {
  it("путь сокращается до первой части", () => {
    // «Страница про приватность» не должна уезжать в диагностику со всеми адресами.
    expect(example(fact())).toBe("C:\\…");
  });

  it("имя человека из пути не попадает в отчёт", () => {
    expect(example(fact())).not.toContain("Иван");
  });

  it("имя голоса в отчёте скрыто", () => {
    expect(example(fact({ kind: "voice", value: "Алла" }))).toContain("скрыто");
  });

  it("громкость в отчёте видна: число ничего не выдаёт", () => {
    expect(example(fact({ kind: "volume", value: "30" }))).toBe("30");
  });

  it("страница не содержит имени из пути", () => {
    const got = build([fact()], EMPTY, 0, NOW);
    expect(got.page).not.toContain("Иван");
  });
});

describe("сказано и то, чего нет", () => {
  it("паролей нет — это факт, а не пустая строка", () => {
    // Молчание одинаково похоже на «нет данных» и на «не проверяли».
    const got = build([fact()], EMPTY, 0, NOW);
    const all = got.absent.join(" ");
    expect(all).toContain("пароли");
    expect(all).toContain("токены");
    expect(all).toContain("данные карт");
  });

  it("пустая память — тоже сказано", () => {
    const got = build([], EMPTY, 0, NOW);
    expect(got.absent[0]).toContain("память пуста");
    expect(got.page).toContain("фактов нет");
  });

  it("согласия — не часть памяти, и это видно", () => {
    const got = build([fact()], EMPTY, 0, NOW);
    expect(got.absent.join(" ")).toContain("не в памяти");
    expect(got.page).toContain("Согласия сейчас: 0 из 3");
  });

  it("согласия считаются по действующим", () => {
    const got = build([fact()], give(EMPTY, "files", NOW), 0, NOW);
    expect(got.page).toContain("Согласия сейчас: 1 из 3");
  });
});

describe("одна страница, а не список", () => {
  it("сорок папок — одна строка, а не сорок", () => {
    // Если для ответа надо листать, это не ответ.
    const many = Array.from({ length: 40 }, (_, i) => fact({ value: `D:\\Папка${i}` }));
    const got = build(many, EMPTY, 0, NOW);
    expect(got.rows.length).toBe(1);
    expect(got.rows[0]!.many).toBe(40);
    expect(got.page.split("\n").length).toBeLessThan(20);
  });

  it("в отчёте есть дата: иначе непонятно, когда это было верно", () => {
    const got = build([fact()], EMPTY, 0, NOW);
    expect(got.page).toMatch(/\d{2}\.\d{2}\.\d{4}/);
  });

  it("страница читается: заголовок и разделы", () => {
    const got = build([fact()], EMPTY, 2, NOW);
    expect(got.page).toContain("Что память знает обо мне");
    expect(got.page).toContain("Чего в памяти нет:");
  });
});
