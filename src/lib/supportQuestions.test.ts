import { describe, expect, it } from "vitest";
import { attach, checks, notDo, questions, safeToSend, withoutFiles } from "./supportQuestions";

/**
 * Шаг 467: инструкция для поддержки — что спросить и что приложить.
 */

describe("три вопроса, на которые можно ответить", () => {
  it("ровно три и все обязательные", () => {
    const got = questions();
    expect(got).toHaveLength(3);
    expect(got.every((q) => q.must)).toBe(true);
  });

  it("первый — фраза дословно", () => {
    expect(questions()[0]!.ask).toContain("как говорили");
  });

  it("второй отличает отказ от неверного результата", () => {
    expect(questions()[1]!.why).toContain("отказ от неверного результата");
  });

  it("третий разделяет новый дефект и старое ограничение", () => {
    expect(questions()[2]!.why).toContain("старое ограничение");
  });
});

describe("что приложить — одной кнопкой", () => {
  it("три вложения, каждое из приложения", () => {
    const got = attach();
    expect(got).toHaveLength(3);
    expect(got[0]!.how).toContain("кнопка");
    expect(got[2]!.how).toContain("манифест");
  });

  it("сказано, чего в файлах нет — чтобы не боялись", () => {
    const got = safeToSend().join();
    expect(got).toContain("паролей и ключей");
    expect(got).toContain("имени пользователя Windows");
    expect(got).toContain("памяти и профилей");
  });
});

describe("файлы не обязательны", () => {
  it("три ответа дают половину", () => {
    const got = withoutFiles();
    expect(got).toContain("дают половину");
    expect(got).toContain("не обязательны для первого ответа");
  });

  it("не «опишите подробно» и не скриншоты папок", () => {
    const got = notDo().join();
    expect(got).toContain("вопросы конкретные");
    expect(got).toContain("скриншоты Проводника");
    expect(got).toContain("файлов, чтобы ответить");
  });

  it("три проверки", () => {
    expect(checks()).toHaveLength(3);
  });
});
