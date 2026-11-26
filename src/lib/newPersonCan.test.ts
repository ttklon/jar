import { describe, expect, it } from "vitest";
import { answerLooks, check, checks, notDo, questions, type Question } from "./newPersonCan";

/**
 * Шаг 498: новый человек может продолжить без меня.
 */

describe("пять вопросов, на каждый машинный ответ", () => {
  it("готово: автор не нужен", () => {
    const got = check();
    expect(got.ok).toBe(true);
    expect(got.said).toContain("автор не нужен");
    expect(got.missing).toEqual([]);
  });

  it("вопросов ровно пять", () => {
    expect(questions()).toHaveLength(5);
  });

  it("на каждый — путь или команда, а не «в документации»", () => {
    for (const question of questions()) {
      expect(question.answer).not.toBeNull();
      expect(question.answer!).toMatch(/\.(ts|md)|`/);
    }
  });

  it("нет ответа — «спросить автора»", () => {
    const got = check([{ can: "найти, где менять разбор фразы", answer: null }]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("«спросить автора» нужен для 1");
  });

  it("пустая строка — тоже нет ответа", () => {
    expect(check([{ can: "x", answer: "  " }]).ok).toBe(false);
  });
});

describe("как выглядит машинный ответ", () => {
  it("три вида: путь, команда, документ", () => {
    const got = answerLooks();
    expect(got).toHaveLength(3);
    expect(got[1]).toContain("check_all.py");
  });

  it("«в документации» не ответ", () => {
    expect(notDo()[0]).toContain("нужен путь или команда");
    expect(checks()).toHaveLength(3);
  });
});

describe("ответ на вопрос — часть проверки", () => {
  it("список с одним провалом называет его", () => {
    const list: Question[] = [...questions().slice(0, 4), { can: "узнать, чего программа не делает", answer: null }];
    expect(check(list).missing).toEqual(["узнать, чего программа не делает"]);
  });
});
