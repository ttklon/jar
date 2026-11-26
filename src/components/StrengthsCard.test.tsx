// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StrengthsCard } from "./StrengthsCard";
import { STRENGTHS, boundaries } from "../lib/ownStrengths";

/**
 * Шаг 48б: сила называется вместе с пределом.
 *
 * Правило ownStrengths существовало и не было подключено: человек читал на
 * первом экране только «что можно сказать», но не «что приложение делает лучше
 * других» — и не знал, где его силы кончаются.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("что умею лучше", () => {
  it("все три силы названы, и у каждой виден предел", () => {
    render(<StrengthsCard />);
    for (const strength of STRENGTHS) {
      expect(screen.getByText(strength.name)).toBeTruthy();
      // Предел рядом с силой, а не мелким шрифтом в конце.
      expect(screen.getByText(`предел: ${strength.limit}`)).toBeTruthy();
    }
  });

  it("«чего нет» названо отдельно, а не спрятано", () => {
    render(<StrengthsCard />);
    expect(screen.getByText("Чего нет")).toBeTruthy();
    for (const line of boundaries()) {
      expect(screen.getByText(line)).toBeTruthy();
    }
  });

  it("ни одного «всё умеет» и ни одного обещания будущего", () => {
    render(<StrengthsCard />);
    expect(screen.queryByText(/всё умеет/i)).toBeNull();
    expect(screen.queryByText(/починим|в будущем|скоро/i)).toBeNull();
  });
});
