import { describe, expect, it } from "vitest";
import { enough, number, parse, question, say, since } from "./amount";

/**
 * Шаг 92: «сколько» и «какие именно» — числа, диапазоны, даты.
 *
 * «Удали файлы старше трёх месяцев» сегодня либо не понимается, либо понимается
 * как «удали файлы».
 */
const now = new Date("2026-11-20T10:00:00").getTime();

describe("числа словами — такие же числа, как цифры", () => {
  it("«пять» и «5» — одно", () => {
    expect(number("пять")).toBe(5);
    expect(number("5")).toBe(5);
  });

  it("«сорок два» — 42, а не 40 и 2", () => {
    expect(number("сорок два")).toBe(42);
    expect(number("двадцать")).toBe(20);
    expect(number("сто пять")).toBe(105);
  });

  it("не число — не угадываем", () => {
    expect(number("семьдесят")).toBe(70);
    expect(number("много")).toBeNull();
  });

  it("косвенные падежи — тоже числа", () => {
    // «От трёх до десяти» говорят, а не пишут.
    expect(number("трёх")).toBe(3);
    expect(number("десяти")).toBe(10);
  });
});

describe("диапазон не схлопывается в одно число", () => {
  it("«от трёх до десяти» — диапазон", () => {
    // Иначе удаляется не то.
    const got = parse("удали от трёх до десяти файлов");
    expect(got.kind).toBe("range");
    if (got.kind === "range") {
      expect(got.from).toBe(3);
      expect(got.to).toBe(10);
    }
  });

  it("«с 3 по 10» — тоже диапазон", () => {
    expect(parse("удали с 3 по 10").kind).toBe("range");
  });

  it("перевёрнутый диапазон выправляется, а не отвергается", () => {
    const got = parse("удали от десяти до трёх");
    if (got.kind === "range") {
      expect(got.from).toBe(3);
    }
  });

  it("в ответе сказано, что это диапазон", () => {
    expect(say(parse("от трёх до десяти"))).toContain("диапазон");
  });
});

describe("сравнение — не количество", () => {
  it("«больше 500 МБ» — сравнение", () => {
    const got = parse("найди файлы больше 500 МБ");
    expect(got.kind).toBe("more");
    if (got.kind === "more") expect(got.value).toBe(500);
  });

  it("«меньше трёх дней» — сравнение", () => {
    expect(parse("файлы меньше трёх дней").kind).toBe("less");
  });
});

describe("«несколько» — не число, и это честно", () => {
  it("число не подставляется", () => {
    // Подставить «десять» значит придумать за человека.
    const got = parse("удали несколько файлов");
    expect(got.kind).toBe("vague");
    expect(say(got)).toContain("не подставляю");
  });

  it("для необратимого «несколько» недостаточно", () => {
    // «Удали несколько файлов» — это лотерея.
    expect(enough(parse("удали несколько файлов"))).toBe(false);
    expect(enough(parse("удали пять файлов"))).toBe(true);
    expect(enough(parse("удали от трёх до десяти"))).toBe(true);
  });

  it("числа не сказано вовсе — это не ошибка, а «none»", () => {
    expect(parse("удали файлы").kind).toBe("none");
  });
});

describe("«сколько» — вопрос или количество", () => {
  it("«сколько файлов в папке» — вопрос, а не действие", () => {
    // Смешать их значит выполнить действие вместо ответа.
    expect(question("сколько файлов в папке")).toBe(true);
  });

  it("«удали сколько-то лишних» — не вопрос", () => {
    expect(question("удали лишние")).toBe(false);
  });

  it("вопрос с «?» на конце — вопрос", () => {
    expect(question("найди большие файлы?")).toBe(true);
  });
});

describe("дата без года — последний прошедший месяц", () => {
  it("в ноябре «с марта» — март этого года", () => {
    // Год назад — это была бы другая фраза («с марта прошлого года»).
    const at = since("удали файлы с марта", now);
    expect(at).not.toBeNull();
    if (at !== null) {
      const date = new Date(at);
      expect(date.getMonth()).toBe(2);
      expect(date.getFullYear()).toBe(2026);
    }
  });

  it("«с декабря» в ноябре — прошлый год, а не будущий", () => {
    const at = since("файлы с декабря", now);
    if (at !== null) expect(new Date(at).getFullYear()).toBe(2025);
  });

  it("нет месяца — нет даты", () => {
    expect(since("удали файлы", now)).toBeNull();
  });
});
