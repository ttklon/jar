import { describe, expect, it } from "vitest";
import { fallback, isCode, load, pick, say } from "./codeModel";

/**
 * Шаг 77: модель для кода — отдельно, включается только на задачах кода.
 *
 * Если она загружена «на всякий случай», память занята моделью, нужной раз в
 * день, и разговор идёт через неё же — втрое дольше.
 */
describe("кодовая модель грузится только на код", () => {
  it("разговор идёт обычной моделью, кодовая не грузится", () => {
    // Модель на 7B не должна занимать память ради одной задачи.
    const chosen = pick("talk", "1.5B", "7B");
    expect(chosen.model).toBe("1.5B");
    expect(chosen.why).toContain("не грузится");
    expect(load("7B", "talk", false)).toBe(false);
  });

  it("код идёт кодовой", () => {
    expect(pick("code", "1.5B", "7B").model).toBe("7B");
    expect(load("7B", "code", false)).toBe(true);
  });

  it("уже загруженная не грузится заново", () => {
    expect(load("7B", "code", true)).toBe(false);
  });
});

describe("нет кодовой модели — честное «нечем»", () => {
  it("кода нет, разговор работает", () => {
    // «Сделаю вид и напишу неверное» хуже, чем «нечем».
    const chosen = pick("code", "1.5B", null);
    expect(chosen.model).toBeNull();
    expect(chosen.why).toContain("разговор при этом работает");
  });

  it("без кодовой модели нечего грузить", () => {
    expect(load(null, "code", false)).toBe(false);
  });

  it("подстановка разговорной названа с оговоркой, а не молча", () => {
    // Иначе человек получит уверенно неверный код.
    const said = fallback("1.5B");
    expect(said).toContain("ошибается");
    expect(said).toContain("при запуске");
  });
});

describe("что считается кодом", () => {
  it("слово «код» и «функция» — код", () => {
    expect(isCode("напиши функцию сортировки")).toBe(true);
    expect(isCode("исправь код в этом файле")).toBe(true);
  });

  it("«напиши письмо» — не код", () => {
    // Отличается одним словом, и никакой список не покроет все случаи.
    expect(isCode("напиши письмо маме")).toBe(false);
    expect(isCode("открой блокнот")).toBe(false);
  });

  it("пустое — не код", () => {
    expect(isCode("")).toBe(false);
    expect(isCode("   ")).toBe(false);
  });
});

describe("сказано, какая модель отвечает", () => {
  it("названа модель и причина", () => {
    // Иначе разная длина и скорость ответов выглядит как нестабильность.
    expect(say(pick("talk", "1.5B", "7B"))).toContain("1.5B");
    expect(say(pick("code", "1.5B", "7B"))).toContain("7B");
    expect(say(pick("code", "1.5B", null))).not.toContain("отвечает");
  });
});
