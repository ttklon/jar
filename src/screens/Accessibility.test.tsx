// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Accessibility } from "./Accessibility";
import { record, reset, settleAfter, useClock } from "../lib/bargeMeasure";

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

afterEach(() => {
  cleanup();
  reset();
});

describe("экран «Доступность»", () => {
  it("главный сценарий назван числом шагов, и у каждого — клавиша", () => {
    render(<Accessibility />);
    expect(screen.getByText(/Главный сценарий без мыши: \d+ шагов, все с клавишами/)).toBeTruthy();
    // Пять нажатий: палитра, буквы, Enter, фраза, Enter.
    expect(screen.getByText(/^1\. Ctrl\+K$/)).toBeTruthy();
  });

  it("перебивание названо числом, а не «работает» (шаг 80)", () => {
    const now = { at: 0 };
    const restore = useClock(() => now.at);
    try {
      record();
      now.at = 130;
      settleAfter(130);
      render(<Accessibility />);
      // Обещание — в заголовке, замер — строкой: «худшее перебивание: … 130 мс».
      expect(screen.getByText(/Перебивание: не дольше 200 мс/)).toBeTruthy();
      const line = screen.getByText(/худшее перебивание/);
      expect(line.textContent).toContain("130 мс");
      expect(line.textContent).toContain("в срок");
      // Среднее не показываем: оно скрывает одно медленное за девятью быстрыми.
      expect(screen.getByText(/среднее не показываем/)).toBeTruthy();
    } finally {
      restore();
    }
  });

  it("без замеров сказано, что мерить, а не выдано «работает»", () => {
    render(<Accessibility />);
    expect(screen.getByText(/ещё не мерили: перебейте приложение голосом/)).toBeTruthy();
    // И названо, где обещание действует: три места, а не одно.
    expect(screen.getByText("кнопка в окне")).toBeTruthy();
    expect(screen.getByText("горячая клавиша")).toBeTruthy();
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

  it("игра: дела по расписанию не запускаются, окна и клавиши не мешают", () => {
    render(<Accessibility />);
    expect(
      screen.getByText(/открыто полноэкранное приложение: дела по расписанию не запускаю/),
    ).toBeTruthy();
  });

  it("нажал сам — выполняется без уведомления, иначе «нажал, а ничего не произошло»", () => {
    render(<Accessibility />);
    expect(
      screen.getByText(/вы попросили сами: выполняю, но уведомление не покажу/),
    ).toBeTruthy();
  });

  it("пропущенное в игре не догоняется скопом: спрашиваем по одному", () => {
    render(<Accessibility />);
    expect(screen.getByText(/пропущено 2 дела — спрошу, выполнять ли, по одному/)).toBeTruthy();
  });
})
