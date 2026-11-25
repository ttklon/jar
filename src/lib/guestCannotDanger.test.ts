import { describe, expect, it } from "vitest";
import { attempts, decide, holes, howWord, proves } from "./guestCannotDanger";

/**
 * Шаг 420: тест — гость не может выполнить опасную руку. Через все слои.
 */

describe("ни одного прохода по четырём путям", () => {
  it("все 40 попыток — ни одна не проходит", () => {
    expect(attempts()).toHaveLength(40);
    expect(holes(attempts())).toEqual([]);
  });

  it("прямая просьба", () => {
    expect(decide({ how: "ask", risk: "delete", owner: "guest" }).said).toContain("шаг 405");
  });

  it("расписание не выполняет опасное под гостем", () => {
    expect(decide({ how: "schedule", risk: "delete", owner: "guest" }).said).toContain("ждёт его самого");
  });

  it("подтверждение гостя не принимается", () => {
    expect(decide({ how: "confirm", risk: "pay", owner: "guest" }).said).toContain("подтверждает хозяин и лично");
  });

  it("переключение — требует присутствия", () => {
    expect(decide({ how: "switch", risk: "system", owner: "guest" }).said).toContain("а не нажатия «я хозяин»");
  });

  it("опасное от имени хозяина — обход", () => {
    const got = decide({ how: "confirm", risk: "delete", owner: "owner" });
    expect(got.refused).toBe(true);
    expect(got.said).toContain("обход, а не просьба");
  });
});

describe("но чтение проходит всегда", () => {
  it("гость получает пользу, а не только отказы", () => {
    for (const how of ["ask", "schedule", "confirm", "switch"] as const) {
      expect(decide({ how, risk: "read", owner: "guest" }).refused).toBe(false);
    }
  });
});

describe("тест перечисляет пути словами", () => {
  it("четыре имени, и все по-русски", () => {
    expect(["ask", "schedule", "confirm", "switch"].map((h) => howWord(h as "ask")))
      .toEqual(["прямая просьба", "расписание", "подтверждение", "переключение профиля"]);
  });

  it("три утверждения о доказанном", () => {
    expect(proves()).toHaveLength(3);
  });
});
