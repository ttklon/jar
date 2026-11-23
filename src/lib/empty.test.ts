import { describe, expect, it } from "vitest";
import { emptinessOf, emptyLine, emptyText } from "./empty";

/**
 * Шаги 9 и 13: пустота называется словами, а «непроверенное» — статус, а не
 * пустое место.
 *
 * Пустой список читается как «всё хорошо», хотя означает «здесь ничего не
 * проверяли». Это два разных факта, и разница между ними — вся суть шага.
 */
describe("пустота", () => {
  it("три причины пустоты — три разных слова", () => {
    // Одно «нет данных» заставило бы человека решать за нас, что происходит:
    // «мы не дошли» или «что-то сломалось».
    const words = [emptyText("nothing-yet"), emptyText("unknown"), emptyText("really-empty")];
    expect(new Set(words).size).toBe(3);
    expect(words[0]).toContain("ничего не проверялось");
    expect(words[2]).toContain("ничего нет");
  });

  it("пустой список не молчит и не притворяется хорошим", () => {
    expect(emptyLine([], "nothing-yet")).toBe("здесь ничего не проверялось");
    // А когда есть что показать — никакой заглушки поверх данных.
    expect(emptyLine(["a"], "nothing-yet")).toBeNull();
  });

  it("причина выбирается по фактам, а не по настроению", () => {
    // Ошибка — всегда «не удалось узнать», даже если спрашивали.
    expect(emptinessOf({ asked: true, answered: false, error: true })).toBe("unknown");
    // Не спрашивали — «ничего не проверялось»: это граница работы, а не поломка.
    expect(emptinessOf({ asked: false, answered: false, error: false })).toBe("nothing-yet");
    // Спросили, ответа нет — «не удалось узнать».
    expect(emptinessOf({ asked: true, answered: false, error: false })).toBe("unknown");
    // Спросили и получили пусто — это факт про мир.
    expect(emptinessOf({ asked: true, answered: true, error: false })).toBe("really-empty");
  });
});
