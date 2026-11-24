import { describe, expect, it } from "vitest";
import { card, complete, next, tally, type Deed, type Step } from "./deedNext";

/**
 * Шаг 189: что сделано, чем доказано, **что дальше** — одной карточкой.
 *
 * Кнопки «отменить» и «повторить» — действия с отчётом, а не следующий шаг по делу.
 */

const step = (position: number, status: string, proof = ""): Step => ({
  position,
  tool: `files|шаг|${position}`,
  status,
  proof,
});

const deed = (over: Partial<Deed> = {}): Deed => ({
  subject: "разбери Загрузки",
  outcome: "ok",
  steps: [step(1, "ok", "файлов 12"), step(2, "ok", "файлов 12")],
  ...over,
});

describe("что сделано — числом, а не словом", () => {
  it("«сделано 3 из 5» отвечает, «выполнено» — нет", () => {
    const got = card(deed({ steps: [step(1, "ok"), step(2, "ok", "x"), step(3, "ok", "x"), step(4, "skipped"), step(5, "failed")] }));
    expect(got.done).toBe("сделано 3 из 5");
  });

  it("пустое дело названо пустым, а не «0 из 0»", () => {
    expect(card(deed({ steps: [] })).done).toBe("дела не было: шагов ноль");
  });

  it("доказательства считаются отдельно от выполнения", () => {
    const got = tally(deed({ steps: [step(1, "ok", "есть"), step(2, "ok")] }));
    expect(got.did).toBe(2);
    expect(got.proved).toBe(1);
  });
});

describe("что дальше — ровно одно", () => {
  it("идёт — подождать или отменить", () => {
    expect(next(deed({ outcome: "running" })).said).toContain("дело идёт");
  });

  it("отказ — не сбой: повторять то же бессмысленно", () => {
    const got = next(deed({ outcome: "denied" }));
    expect(got.said).toContain("это отказ, а не сбой");
    expect(got.how).toContain("чего не хватает");
  });

  it("отменено — сделанное не откатилось само", () => {
    expect(next(deed({ outcome: "cancelled" })).said).toContain("не откатилось само");
  });

  it("упало — назван шаг, на котором упало, и что остальные не выполнялись", () => {
    const got = next(deed({ outcome: "failed", steps: [step(1, "ok", "x"), step(2, "failed")] }));
    expect(got.said).toBe("упало на шаге 2: files|шаг|2 — остальные не выполнялись");
  });

  it("пропущенное — названо числом, а не спрятано в «успех»", () => {
    const got = next(deed({ steps: [step(1, "ok", "x"), step(2, "skipped")] }));
    expect(got.said).toBe("сделано 1 из 2; 1 шаг пропущен");
  });

  it("успех без доказательств — «прошло», а не «проверено»", () => {
    const got = next(deed({ steps: [step(1, "ok"), step(2, "ok")] }));
    expect(got.said).toContain("ни одного доказательства нет");
  });

  it("всё сделано — «дальше ничего» лучше выдуманного совета", () => {
    expect(next(deed())).toEqual({ said: "", how: "" });
  });
});

describe("карточка отвечает на все три вопроса", () => {
  it("обычное дело", () => {
    const got = card(deed());
    expect(complete(got).ok).toBe(true);
    expect(got.proof).toBe("проверено 2 из 2");
    expect(got.attention).toBe(false);
  });

  it("провал требует внимания", () => {
    expect(card(deed({ outcome: "failed" })).attention).toBe(true);
    expect(card(deed({ outcome: "denied" })).attention).toBe(true);
  });

  it("«дальше» без способа — неполная карточка", () => {
    const broken = { done: "сделано 1 из 1", proof: "проверено 1 из 1", next: { said: "повторите", how: "" }, attention: false };
    expect(complete(broken).ok).toBe(false);
    expect(complete(broken).why).toContain("без способа");
  });

  it("способ без «что дальше» — тоже", () => {
    const broken = { done: "x", proof: "y", next: { said: "", how: "нажмите" }, attention: false };
    expect(complete(broken).why).toContain("способ без");
  });

  it("пустые «сделано» и «доказано» ловятся", () => {
    expect(complete({ done: " ", proof: "y", next: { said: "", how: "" }, attention: false }).why).toContain("что сделано");
    expect(complete({ done: "x", proof: "", next: { said: "", how: "" }, attention: false }).why).toContain("чем доказано");
  });
});
