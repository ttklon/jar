import { describe, expect, it } from "vitest";
import { ENOUGH, answer, decide, summarize, type Proposal } from "./scenarioOnly";

/**
 * Шаг 298: не гнаться за фичами, которых нет в сценарии пользователя.
 *
 * Функция вне сценария не нейтральна: место в меню, перевод, чужой API, поломки.
 */

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  what: "календарь внутри ассистента",
  asked: ENOUGH,
  inScenario: true,
  ...over,
});

describe("вопрос не «плохо ли», а «кто попросил»", () => {
  it("просили трое и есть в сценарии — берём", () => {
    const got = decide(proposal());
    expect(got.verdict).toBe("take");
    expect(got.said).toContain("просили 3 человека");
  });

  it("двое — ещё мало, но порог назван числом", () => {
    const got = decide(proposal({ asked: 2 }));
    expect(got.verdict).toBe("later");
    expect(got.said).toContain("меньше 3");
    expect(ENOUGH).toBe(3);
  });

  it("вне сценария и у конкурента — отказ с причиной", () => {
    const got = decide(proposal({ inScenario: false, seenAt: "Jan" }));
    expect(got.verdict).toBe("refuse");
    expect(got.said).toContain("чужая функция, а не наша недоделка");
  });

  it("вне сценария и ни у кого нет — просто откладываем", () => {
    expect(decide(proposal({ inScenario: false })).verdict).toBe("later");
  });

  it("просят много, но вне сценария — всё равно отказ", () => {
    // Иначе «много просили» побеждает сценарий молча.
    expect(decide(proposal({ inScenario: false, asked: 40, seenAt: "LM Studio" })).verdict).toBe("refuse");
  });
});

describe("отказ говорится вслух", () => {
  it("отказы называются поимённо", () => {
    const got = summarize([
      proposal(),
      proposal({ what: "календарь", inScenario: false, seenAt: "Jan" }),
      proposal({ what: "мобильное приложение", inScenario: false, seenAt: "Яндекс" }),
    ]);
    expect(got.refused).toEqual(["календарь", "мобильное приложение"]);
    expect(got.said).toContain("отказываемся 2");
  });

  it("отказ не звучит как отговорка — есть «что вместо»", () => {
    const got = answer(proposal({ what: "календарь", inScenario: false, seenAt: "Jan" }), "напоминание в память одной строкой");
    expect(got).toContain("другой сценарий");
    expect(got).toContain("вместо этого");
  });

  it("для принятого — не отказ, а очередь", () => {
    expect(answer(proposal(), "")).toContain("в работе или в очереди");
  });
});

describe("итог не прячет цену", () => {
  it("пустая пачка — счёт нулями, а не пустая строка", () => {
    const got = summarize([]);
    expect(got.said).toContain("берём 0");
    expect(got.refused).toEqual([]);
  });

  it("отказ — решение, а не долг", () => {
    expect(summarize([]).said).toContain("не долг");
  });
});
