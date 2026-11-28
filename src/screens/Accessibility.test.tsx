// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Accessibility } from "./Accessibility";

/**
 * «Доступность» (шаги 193/198).
 *
 * Два дефекта, которые снаружи не видны: сценарий требует мыши, и ошибка видна,
 * но не объявлена — для человека с диктором её просто нет.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран «Доступность»", () => {
  it("главный сценарий назван числом шагов, и у каждого — клавиша", () => {
    render(<Accessibility />);
    expect(screen.getByText(/Главный сценарий без мыши: \d+ шагов, все с клавишами/)).toBeTruthy();
    // Пять нажатий: палитра, буквы, Enter, фраза, Enter.
    expect(screen.getByText(/^1\. Ctrl\+K$/)).toBeTruthy();
  });

  it("у ошибки объявлены и роль, и срочность", () => {
    render(<Accessibility />);
    // Ошибка — alert/assertive; без этого диктор её не заметит.
    expect(screen.getAllByText(/role="alert" aria-live="assertive"/).length).toBeGreaterThan(0);
    expect(screen.getByText(/role="status" aria-live="polite"/)).toBeTruthy();
  });

  it("очередь не даёт диктору говорить три ошибки разом", () => {
    render(<Accessibility />);
    expect(screen.getByText(/при трёх ошибках подряд диктор скажет сначала/)).toBeTruthy();
  });

  it("Esc — это шаг назад, а не потеря начатого", () => {
    render(<Accessibility />);
    expect(screen.getByText(/^Esc:/)).toBeTruthy();
  });
});
