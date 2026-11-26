import { describe, expect, it } from "vitest";
import { checks, notDo, onHeard, RESUME_MS, resume, sameEverywhere, type State } from "./bargeIn";

/**
 * Шаг 97: перебивание — заговорил, и приложение замолчало.
 */

const state = (over: Partial<State> = {}): State => ({ speaking: true, saidSoFar: "Загрузки можно почистить", ...over });

describe("заговорил — замолчал сразу", () => {
  it("речь человека — стоп и метка", () => {
    const got = onHeard(state(), "речь человека");
    expect(got.state.speaking).toBe(false);
    expect(got.state.saidSoFar).toContain("[перебито]");
    expect(got.said).toBe("замолчал сразу: говорите");
  });

  it("свой голос — не перебивание", () => {
    const got = onHeard(state(), "свой голос");
    expect(got.state.speaking).toBe(true);
    expect(got.said).toContain("перебивания нет");
  });

  it("шум — не перебивание", () => {
    const got = onHeard(state(), "шум");
    expect(got.state.speaking).toBe(true);
    expect(got.said).toContain("продолжаю фразу");
  });

  it("тишина — ничего не меняет", () => {
    const before = state();
    expect(onHeard(before, "тишина").state).toBe(before);
  });
});

describe("после перебивания — договаривает, а не начинает", () => {
  it("достаточно тишины — продолжает с места", () => {
    const got = resume(state({ speaking: false }), RESUME_MS);
    expect(got.state.speaking).toBe(true);
    expect(got.said).toContain("начало вы уже слышали");
  });

  it("мало тишины — подождать, и сказано сколько", () => {
    const got = resume(state({ speaking: false }), 300);
    expect(got.state.speaking).toBe(false);
    expect(got.said).toContain("подожду ещё 500 мс");
  });

  it("фразы не было — говорить нечего", () => {
    expect(resume(state({ speaking: false, saidSoFar: "" }), RESUME_MS).said).toBe("фраза не начиналась: говорить нечего");
  });

  it("уже говорю — возвращаться некуда", () => {
    expect(resume(state(), RESUME_MS).said).toContain("возвращаться некуда");
  });

  it("порог тишины — меньше секунды", () => {
    expect(RESUME_MS).toBe(800);
  });
});

describe("одинаково на обеих кнопках", () => {
  it("три места", () => {
    const got = sameEverywhere();
    expect(got).toHaveLength(3);
    expect(got.join()).toContain("трее");
  });

  it("не начинает сначала", () => {
    expect(notDo()[0]).toContain("человек уже слышал начало");
    expect(checks()).toHaveLength(3);
  });
});
