import { describe, expect, it } from "vitest";
import { LINES, audit, compatible, ifTakeCode, type Line } from "./borrowedLicense";

/**
 * Шаг 291: таблица заимствований — что, откуда, зачем, лицензия.
 *
 * Разница между «взяли приём» и «взяли код» решается здесь — и решается молча,
 * если колонки нет.
 */

const line = (over: Partial<Line> = {}): Line => ({
  what: "одно поле как вход",
  from: "Raycast",
  basis: { kind: "idea" },
  ...over,
});

describe("приём не имеет лицензии, код имеет", () => {
  it("идея — чужая лицензия к нам не относится", () => {
    const got = audit([line()]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("чужих лицензий в сборке нет");
  });

  it("код со свободной лицензией — можно, с уведомлением", () => {
    expect(compatible("mit").ok).toBe(true);
    expect(compatible("apache").said).toContain("уведомление");
  });

  it("код с gpl делает сборку gpl", () => {
    // Это выясняется, когда приложение уже раздают.
    const got = compatible("gpl");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("сборка становится gpl");
  });

  it("несвободная не идёт в сборку", () => {
    expect(compatible("proprietary").ok).toBe(false);
  });

  it("неизвестная — это «не проверяли», а не «наверное, можно»", () => {
    const got = compatible("unknown");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не проверяли");
  });
});

describe("таблица проверяется целиком", () => {
  it("наша таблица — девять идей, кода нет", () => {
    const got = audit();
    expect(got.ok).toBe(true);
    expect(got.said).toContain("идей 9");
    expect(got.said).toContain("кода 0");
    expect(LINES.length).toBe(9);
  });

  it("все строки — идеи, а не выдача одной за другую", () => {
    expect(LINES.every((item) => item.basis.kind === "idea")).toBe(true);
  });

  it("код с несовместимой лицензией ловится", () => {
    const got = audit([line({ basis: { kind: "code", license: "gpl" } })]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("gpl");
  });
});

describe("цена решения названа, а не запрет", () => {
  it("mit — что именно сделать", () => {
    expect(ifTakeCode("mit")).toContain("уведомление об авторстве");
  });

  it("gpl — что изменится в сборке", () => {
    expect(ifTakeCode("gpl")).toContain("открывать исходники");
  });

  it("неизвестная — сначала узнать", () => {
    expect(ifTakeCode("unknown")).toContain("сначала узнать");
  });
});
