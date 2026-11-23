import { describe, expect, it } from "vitest";
import { already, decide, delta, offer } from "./repeatDeed";

/**
 * Шаг 107: повтор дела — показать, что изменится, и спросить один раз.
 *
 * Повтор другого дела выяснялся после; второй вопрос обесценивал первый.
 */
describe("сначала разница, потом вопрос", () => {
  it("изменилось — сказано числом", () => {
    const got = offer([{ what: "файлов в Загрузках", then: 12, now: 15 }], true);
    expect(got.preview).toContain("было 12, стало 15");
    expect(got.question).toBe("повторить?");
  });

  it("не изменилось — повтор ничего не изменит, и это ответ", () => {
    const got = offer([{ what: "файлов", then: 12, now: 12 }], true);
    expect(got.preview).toContain("ничего не изменит");
  });

  it("прошлого дела нет — сказано прямо, а не «ничего не изменится»", () => {
    // Сравнение с самим собой всегда даёт «как в прошлый раз» — это враньё.
    const got = delta({ what: "шагов", then: null, now: 2 });
    expect(got.said).toContain("сравнивать не с чем");
    expect(got.changed).toBe(true);
  });

  it("посчитать не удалось — это не «ноль»", () => {
    // «Ноль файлов» и «не смог посчитать» — разные факты.
    const got = delta({ what: "файлов", then: 12, now: null });
    expect(got.said).toContain("посчитать не удалось");
    expect(got.changed).toBe(true);
  });

  it("порядок: разница показывается до вопроса, а не в ответе", () => {
    // Человек отвечает на показанное, а не на обещание.
    const got = offer([{ what: "папок", then: 1, now: 3 }], true);
    expect(got.preview.length).toBeGreaterThan(0);
    expect(got.question).toBe("повторить?");
  });
});

describe("один вопрос, а не два", () => {
  it("«да» — сразу повод запускать, без второго «вы уверены»", () => {
    const got = offer([{ what: "файлов", then: 1, now: 2 }], true);
    const run = decide(true, got);
    expect(run.run).toBe(true);
    expect(run.said).toContain("повторяю");
  });

  it("«нет» — не повторяю, и это весь ответ", () => {
    expect(decide(false, offer([], true)).said).toBe("не повторяю");
  });
});

describe("повтор не обещан там, где его нет", () => {
  it("нельзя — причина названа, а не «недоступно»", () => {
    const got = offer([], false, "скачивание повторяется по своим правилам");
    expect(got.ask).toBe(false);
    expect(got.why).toContain("своим правилам");
    expect(decide(true, got).run).toBe(false);
  });

  it("причины нет — общая, но честная", () => {
    expect(offer([], false).why).toContain("не повторяется");
  });
});

describe("уже сделанное названо до вопроса", () => {
  it("часть сделана — повтор их не тронет", () => {
    expect(already(8, 12, "файлов")).toContain("8 из 12");
  });

  it("сделано всё — повторять нечего", () => {
    expect(already(12, 12, "файлов")).toContain("повторять нечего");
  });

  it("ничего не сделано — молчим, а не пишем «0 из 12»", () => {
    expect(already(0, 12, "файлов")).toBe("");
  });
});
