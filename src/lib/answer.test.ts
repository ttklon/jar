import { describe, expect, it } from "vitest";
import { firstOpenQuestion, phraseIsAnswer, questionField } from "./answer";

describe("ответ на открытый вопрос", () => {
  it("обычная фраза — ответ, стоп и «да» — нет", () => {
    expect(phraseIsAnswer("C:\\tmp\\a.txt")).toBe(true);
    expect(phraseIsAnswer("ещё")).toBe(true);
    expect(phraseIsAnswer("да")).toBe(false);
    expect(phraseIsAnswer("Стоп.")).toBe(false);
    expect(phraseIsAnswer("  ")).toBe(false);
  });

  it("берёт первый пустой вопрос и не трогает уже заполненный", () => {
    const path = { position: 1, name: "path", label: "Путь" };
    const name = { position: 2, name: "name", label: "Имя" };
    expect(firstOpenQuestion([path, name], {})?.name).toBe("path");
    expect(firstOpenQuestion([path, name], { [questionField(path)]: "C:\\a" })?.name).toBe("name");
    expect(
      firstOpenQuestion([path, name], {
        [questionField(path)]: "C:\\a",
        [questionField(name)]: "отчёт",
      }),
    ).toBeNull();
  });
});