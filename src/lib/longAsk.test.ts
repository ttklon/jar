import { describe, expect, it } from "vitest";
import { answered, ask, inTime, LONG_MS, threshold, type Wait } from "./longAsk";

/**
 * Шаг 129: порог, после которого говорится «это долго, ждать?».
 *
 * Долгое дело молча шло, и человек уходил, не зная, что можно не ждать.
 */
const wait = (ms: number, over: Partial<Wait> = {}): Wait => ({
  what: "думаю",
  ms,
  asked: false,
  chosen: false,
  stoppable: true,
  ...over,
});

describe("порог — число, а не ощущение", () => {
  it("до порога не спрашиваем", () => {
    const got = ask(wait(LONG_MS - 1));
    expect(got.ask).toBe(false);
    expect(got.why).toContain("ещё не долго");
  });

  it("после порога спрашиваем — и с числом", () => {
    const got = ask(wait(LONG_MS + 6000));
    expect(got.ask).toBe(true);
    expect(got.said).toBe("«думаю» — это долго (10 с). Ждать?");
  });
});

describe("вопрос даёт выбор, а не уведомление", () => {
  it("«жду» продолжает и больше не спрашивает", () => {
    expect(answered("wait")).toEqual({ continue: true, said: "жду до конца — больше не спрошу" });
  });

  it("«нет» останавливает", () => {
    expect(answered("stop").continue).toBe(false);
  });

  it("если остановить нельзя — не вопрос, а уведомление", () => {
    const got = ask(wait(LONG_MS + 1, { stoppable: false }));
    expect(got.ask).toBe(false);
    expect(got.why).toContain("был бы уведомлением");
  });
});

describe("спрашивают ровно один раз", () => {
  it("повторный вопрос — пила, а не выбор", () => {
    expect(ask(wait(LONG_MS + 1, { asked: true })).why).toContain("уже спросили один раз");
  });

  it("человек сам попросил ждать — ответ уже есть", () => {
    expect(ask(wait(LONG_MS + 1, { chosen: true })).why).toContain("человек сам попросил ждать");
  });
});

describe("порог у разных дел разный, и он назван", () => {
  it("думать 8 секунд — долго, читать диск 8 секунд — нет", () => {
    expect(ask(wait(LONG_MS + 4000)).ask).toBe(true);
    expect(8_000 > threshold("read").ms).toBe(false);
  });

  it("у каждого дела порог сказан словами", () => {
    expect(threshold("think").said).toContain("4 с");
    expect(threshold("network").said).toContain("5 с");
  });
});

describe("вопрос вовремя, а не после", () => {
  it("вопрос до конца — это вопрос", () => {
    expect(inTime(4500, 9000, 0).ok).toBe(true);
  });

  it("вопрос после конца — отчёт, и так и назван", () => {
    expect(inTime(9000, 9000, 0).said).toContain("это отчёт, а не выбор");
  });

  it("вопроса не было — человек ждал молча", () => {
    expect(inTime(null, 9000, 0).said).toContain("ждал молча");
  });
});
