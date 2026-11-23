import { describe, expect, it } from "vitest";
import { allow, byDefault, differs, reset, say, type Setup } from "./oneEngine";

/**
 * Шаг 75: один движок для всех ролей по умолчанию, разные — по желанию.
 *
 * Зоопарк моделей хуже одной: память занята всеми, диск съеден копиями, и
 * непонятно, какая модель отвечает.
 */
describe("по умолчанию — одна модель", () => {
  it("умолчание называет одну модель и говорит, что это умолчание", () => {
    // Иначе человек не знает, что можно иначе.
    const setup = byDefault("7B");
    expect(setup.kind).toBe("one");
    expect(say(setup)).toContain("одна модель");
    expect(differs(setup)).toBe(false);
  });

  it("одна модель отвечает на все роли — одинаково понятно, какая", () => {
    expect(say(byDefault("7B"))).toContain("7B");
  });
});

describe("своя модель на роль — только с причиной", () => {
  it("замер показал выигрыш — можно", () => {
    // Дешёвая модель справляется: это доказано, а не обещано.
    const { setup, said } = allow(byDefault("7B"), {
      role: "intent",
      model: "0.5B",
      reason: "measured",
    });
    expect(setup.kind).toBe("many");
    expect(said).toContain("замер");
    expect(said).toContain("понять фразу");
  });

  it("иначе не влезает — тоже причина", () => {
    const { said } = allow(byDefault("7B"), { role: "intent", model: "0.5B", reason: "fits" });
    expect(said).toContain("не влезает");
  });

  it("«хочу» принимается, но называется выбором, а не улучшением", () => {
    // Человек имеет право; приложение не должно делать вид, что это выгоднее.
    const { said } = allow(byDefault("7B"), { role: "chat", model: "3B", reason: "want" });
    expect(said).toContain("ваш выбор");
    expect(said).toContain("не выигрывает");
  });
});

describe("зоопарк не начинается незаметно", () => {
  it("третья модель — отказ с объяснением", () => {
    // Память занята всеми, разная скорость выглядит как нестабильность.
    let setup: Setup = byDefault("7B");
    setup = allow(setup, { role: "intent", model: "0.5B", reason: "measured" }).setup;
    setup = allow(setup, { role: "chat", model: "3B", reason: "want" }).setup;
    const third = allow(setup, { role: "plan", model: "14B", reason: "want" });
    expect(third.said).toContain("зоопарк");
    expect(third.setup).toEqual(setup);
  });

  it("две модели — ещё не зоопарк", () => {
    const { setup } = allow(byDefault("7B"), { role: "intent", model: "0.5B", reason: "measured" });
    expect(setup.kind).toBe("many");
    expect(differs(setup)).toBe(true);
  });
});

describe("из зоопарка есть выход одним действием", () => {
  it("возврат к одной модели", () => {
    // Зоопарк, из которого нельзя выйти, остаётся навсегда.
    const { setup } = allow(byDefault("7B"), { role: "intent", model: "0.5B", reason: "measured" });
    expect(reset(setup).kind).toBe("one");
  });

  it("разные модели видны: какая отвечает — можно ответить", () => {
    // Если человек не может связать ошибку с моделью, настройка вредна.
    const { setup } = allow(byDefault("7B"), { role: "code", model: "3B", reason: "want" });
    const said = say(setup);
    expect(said).toContain("код");
    expect(said).toContain("3B");
    // Причина названа: без неё отличие выглядит случайностью.
    expect(said).toContain("ваш выбор");
  });
});
