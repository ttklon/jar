import { describe, expect, it } from "vitest";
import { abandoned, answer, deadline, insteadOfSpinner, spinning, state } from "./timeouts";

/**
 * Шаг 134: таймауты с честным «долго, ждать?» вместо бесконечного спиннера.
 *
 * Спиннер крутился вечно, и «ещё работает» было не отличить от «умерло».
 */
describe("у каждого ожидания есть срок", () => {
  it("срок — число, и он свой у каждого дела", () => {
    expect(deadline("kernel").ms).toBe(3000);
    expect(deadline("model").ms).toBe(30_000);
    // Один таймаут на всё врал бы в обе стороны.
    expect(deadline("network").ms).toBeLessThan(deadline("model").ms);
  });

  it("срок объяснён, а не просто поставлен", () => {
    expect(deadline("kernel").said).toContain("дольше это уже сбой");
  });

  it("спиннер без срока назван бесконечным", () => {
    const got = spinning(true, false);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("бесконечный спиннер");
  });
});

describe("по истечении — выбор, а не ошибка", () => {
  it("срок вышел — спрашиваем «ждать ещё?»", () => {
    const got = state({ kind: "kernel", ms: 3500, extended: 0 });
    expect(got.state).toBe("ask");
    expect(got.said).toContain("Ждать ещё 3 с?");
  });

  it("продление — решение человека, и оно уважается", () => {
    // Продлили — снова ждём, а не спорим.
    expect(state({ kind: "kernel", ms: 4000, extended: 1 }).state).toBe("wait");
  });

  it("дважды продлевали — бросаем, а не спрашиваем в третий раз", () => {
    const got = state({ kind: "kernel", ms: 20_000, extended: 2 });
    expect(got.state).toBe("give-up");
    expect(got.said).toContain("ждать больше нечего");
  });

  it("«бросаю» действительно бросает", () => {
    expect(answer("stop").abandoned).toBe(true);
    expect(answer("extend").extended).toBe(1);
  });

  it("продление копится, иначе ожидание снова бесконечно", () => {
    // Если счётчик сбрасывается в 1, «дважды продлевали» не наступит никогда.
    expect(answer("extend", 1).extended).toBe(2);
    expect(state({ kind: "kernel", ms: 20_000, extended: answer("extend", 1).extended }).state).toBe("give-up");
  });
});

describe("брошенное не выдаётся за сделанное", () => {
  it("бросок — факт с числом, а не пустота", () => {
    const said = abandoned("model", 30_000);
    expect(said).toContain("брошено через 30000 мс");
    expect(said).toContain("ответа не было");
  });
});

describe("вместо круга — срок и что делается", () => {
  it("долгое дело показывает срок, а не бесконечный круг", () => {
    expect(insteadOfSpinner("model")).toContain("модель: 30 с");
    expect(insteadOfSpinner("model")).toContain("спрошу, ждать ли дальше");
  });
});
