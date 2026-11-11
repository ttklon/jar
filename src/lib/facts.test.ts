import { describe, expect, it } from "vitest";
import { factKey, factsToRemember, seedAnswers } from "./facts";
import type { Fact, PlanQuestion } from "../ipc";

function question(position: number, name: string, label: string): PlanQuestion {
  return { position, name, label, hint: "" };
}

/**
 * Память фактов подставляет сказанное раньше — и только в пустые поля.
 * Ошибка здесь стоит дорого: неверный путь исполняется.
 */
describe("память фактов", () => {
  it("ключ — это вопрос, а не значение", () => {
    expect(factKey(question(1, "path", "Путь"))).toBe("вопрос:path");
    expect(factKey(question(1, "  ", "Куда сохранить"))).toBe("вопрос:куда сохранить");
    expect(factKey(question(1, "", "Куда  СОХРАНИТЬ"))).toBe("вопрос:куда сохранить");
  });

  it("подставляет известное в пустое поле и говорит, что это из памяти", () => {
    const questions = [question(1, "path", "Путь"), question(2, "mask", "Маска")];
    const facts: Fact[] = [{ key: "вопрос:path", value: "D:\\Отчёты" }];

    const { answers, remembered } = seedAnswers(questions, facts, {});

    expect(answers).toEqual({ "1:path": "D:\\Отчёты" });
    expect(remembered).toEqual(["1:path"]);
  });

  it("сказанное сейчас сильнее сказанного раньше", () => {
    const questions = [question(1, "path", "Путь")];
    const facts: Fact[] = [{ key: "вопрос:path", value: "D:\\Отчёты" }];

    const { answers, remembered } = seedAnswers(questions, facts, { "1:path": "C:\\tmp" });

    expect(answers["1:path"]).toBe("C:\\tmp");
    expect(remembered).toEqual([]);
  });

  it("пустое значение не подставляет: пустая строка хуже вопроса", () => {
    const { answers } = seedAnswers([question(1, "path", "Путь")], [{ key: "вопрос:path", value: "   " }], {});
    expect(answers).toEqual({});
  });

  it("запоминает только отвеченное", () => {
    const questions = [question(1, "path", "Путь"), question(2, "mask", "Маска")];
    expect(factsToRemember(questions, { "1:path": " D:\\Отчёты ", "2:mask": "" })).toEqual([
      { key: "вопрос:path", value: "D:\\Отчёты" },
    ]);
  });
});
