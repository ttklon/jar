// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RiskBadge } from "./RiskBadge";
import { RISK_LABEL } from "../i18n/ru";
import type { Risk } from "../ipc";

/**
 * Шаг 255: `RiskBadge` был в списке «не покрыто» — и это не мелочь.
 *
 * Значок риска — единственное место, где человек узнаёт, что действие опасное,
 * прежде чем нажать. Ошибка здесь (перепутать цвет, потерять слово, показать не
 * тот класс) читается как «всё в порядке» там, где не в порядке.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

const ALL: Risk[] = ["read", "write-local", "external", "destructive", "identity", "money"];

describe("риск читается словом, а не только цветом", () => {
  it("у каждого риска своё слово из словаря", () => {
    // Цвет — подсказка, слово — ответ: дальтоник и диктор видят то же, что зрячий.
    for (const risk of ALL) {
      cleanup();
      render(<RiskBadge risk={risk} />);
      expect(screen.getByText(RISK_LABEL[risk])).toBeTruthy();
    }
  });

  it("слова рисков не повторяются: два разных риска не выглядят одинаково", () => {
    const words = ALL.map((risk) => RISK_LABEL[risk]);
    expect(new Set(words).size).toBe(words.length);
  });

  it("три опасных риска названы словами, а не «осторожно»", () => {
    // «Осторожно» на всех трёх значит, что человек не отличит деньги от подписи.
    const words = ["destructive", "identity", "money"].map((risk) => RISK_LABEL[risk as Risk]);
    expect(new Set(words).size).toBe(3);
  });

  it("точка — украшение: от диктора она скрыта", () => {
    const { container } = render(<RiskBadge risk="destructive" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
