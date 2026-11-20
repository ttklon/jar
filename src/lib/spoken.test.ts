import { describe, expect, it } from "vitest";
import { isSpokenStop } from "./spoken";

describe("слово стоп", () => {
  it("принимает целое слово остановки", () => {
    expect(isSpokenStop("Стоп")).toBe(true);
    expect(isSpokenStop("  хватит. ")).toBe(true);
    expect(isSpokenStop("отмена!")).toBe(true);
    expect(isSpokenStop("остановись")).toBe(true);
  });

  it("не путает остановку с новой задачей и с разрешением", () => {
    expect(isSpokenStop("стоп и удали")).toBe(false);
    expect(isSpokenStop("останови музыку")).toBe(false);
    expect(isSpokenStop("да")).toBe(false);
    expect(isSpokenStop("")).toBe(false);
  });
});