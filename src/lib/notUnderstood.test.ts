import { describe, expect, it } from "vitest";
import { parse } from "./intent";
import { blame, check, example, run, say, where } from "./notUnderstood";

/**
 * Шаг 97: ошибка разбора не запускает ничего и говорит, что не понято.
 *
 * «Не понял» лучше «сделал не то», а «ничего не произошло» хуже обоих.
 */
describe("не понял — ничего не запускается", () => {
  it("фраза без действия не исполняется", () => {
    // Молчание неотличимо от поломки, а «сделал не то» — хуже.
    const got = check(parse("большие файлы в загрузках"));
    expect(got.run).toBe(false);
    expect(run(got)).toBe(false);
    expect(got.gap).toBe("всё");
  });

  it("действие есть, объекта нет — тоже не запускается", () => {
    // «Найди» без объекта — это вопрос, а не «найти всё».
    const got = check(parse("найди"));
    expect(got.run).toBe(false);
    expect(got.gap).toBe("объект");
    expect(got.said).toContain("над чем");
  });

  it("понятное — запускается", () => {
    const got = check(parse("найди отчёты"));
    expect(got.run).toBe(true);
    expect(say(got)).toBe("");
  });
});

describe("сказано, что именно не понято", () => {
  it("названо действие и чего не хватает", () => {
    expect(check(parse("найди")).said).toContain("найди отчёты");
  });

  it("у непонимания есть пример, а не «скажите иначе»", () => {
    // Без примера это просьба придумать язык приложения.
    const said = say(check(parse("ыыы")));
    expect(said).toContain("например");
    expect(example("объект")).toContain("удали");
  });

  it("«туда» без «куда» — не «в загрузки по умолчанию»", () => {
    const got = where("перенеси туда");
    expect(got?.run).toBe(false);
    expect(got?.gap).toBe("место");
    expect(got?.said).toContain("куда");
  });

  it("«перенеси в Загрузки» — место названо, вопрос не нужен", () => {
    expect(where("перенеси отчёты в Загрузки")).toBeNull();
  });
});

describe("не стыдить", () => {
  it("«некорректная команда» — про человека, хотя ошибся разбор", () => {
    expect(blame("некорректная команда")).toBe(true);
    expect(blame("ошибка пользователя")).toBe(true);
    expect(blame("не понял фразу")).toBe(false);
  });

  it("наш текст человека не винит", () => {
    for (const phrase of ["ыыы", "найди", "большие файлы"]) {
      expect(blame(say(check(parse(phrase))))).toBe(false);
    }
  });
});

describe("«не понял» — результат, а не пустота", () => {
  it("текст непустой и заметный", () => {
    const said = say(check(parse("ыыы")));
    expect(said.length).toBeGreaterThan(20);
    expect(said).toContain("ничего не делаю");
  });
});
