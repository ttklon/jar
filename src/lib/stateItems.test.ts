import { describe, expect, it } from "vitest";
import { riskyCount } from "./stateItems";

/**
 * Шаг 255: `stateItems` был в списке «не покрыто тестами».
 *
 * Проверяется `riskyCount` — одно число на экране «Состояние», и оно врёт легче
 * всего: считается из реестра, а подписано для человека.
 */

describe("сколько действий с необратимым следом", () => {
  it("запись на диск — не риск: «создай папку» есть у всех", () => {
    // Было: `write-local` считалось рискованным, и число выходило 513 из 835 —
    // 47% действий. Слово «необратимый» к «создай папку» не относится, и человек,
    // прочитав «513 действий с необратимым следом», перестаёт читать это число.
    expect(riskyCount([{ risk: "write-local" }])).toBe(0);
  });

  it("наружу, разрушительное, деньги и подпись — риск, всё остальное нет", () => {
    expect(
      riskyCount([
        { risk: "external" },
        { risk: "destructive" },
        { risk: "money" },
        { risk: "identity" },
        { risk: "read" },
        { risk: "write-local" },
      ]),
    ).toBe(4);
  });

  it("пустой реестр — ноль, а не null: «нет» это тоже ответ", () => {
    expect(riskyCount([])).toBe(0);
  });

  it("число сходится с реестром: 129 из 835, а не 513", async () => {
    const actions = (await import("../../data/actions.json")).default as { risk: string }[];
    const got = riskyCount(actions);
    // Сумма четырёх рисков: 51 + 67 + 7 + 4.
    expect(got).toBe(129);
    // И это меньше пятой части реестра — число, которое можно произнести.
    expect(got / actions.length).toBeLessThan(0.2);
  });
});
