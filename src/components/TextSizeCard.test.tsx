// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TEXT_SCALE_KEY, TextSizeCard, applyScale, readScale } from "./TextSizeCard";

/**
 * Шаг 10: «Размер текста» — масштаб, который человек выбирает и который остаётся.
 *
 * Правило textScale было написано и не подключено: 125/150/200% существовали
 * только в функциях. Проверяется то, ради чего настройку делают: выбор виден,
 * назван числом, применяется к окну и переживает перезапуск.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.style.fontSize = "";
});

describe("размер текста", () => {
  it("четыре обещанных масштаба видны, и выбор назван числом", async () => {
    render(<TextSizeCard />);
    expect(screen.getByRole("radiogroup", { name: "размер текста" })).toBeTruthy();
    for (const percent of ["100", "125", "150", "200"]) {
      expect(screen.getByLabelText(`размер текста ${percent} процентов`)).toBeTruthy();
    }
    // Выбран ровно один масштаб — а не «все сразу».
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("размер текста 150 процентов"));
    // Подтверждение словами правила: масштаб и строка в пикселях, а не «готово».
    expect(await screen.findByText(/масштаб шрифта 150%: строка 21 px/)).toBeTruthy();
  });

  it("выбор применяется к окну и запоминается до следующего запуска", () => {
    render(<TextSizeCard />);
    fireEvent.click(screen.getByLabelText("размер текста 200 процентов"));

    expect(document.documentElement.style.fontSize).toBe("28px");
    expect(localStorage.getItem(TEXT_SCALE_KEY)).toBe("2");
    // Следующий запуск читает то же, что записали: одна правда, не две.
    expect(readScale(localStorage)).toBe(2);
  });

  it("необещанное значение приводится вверх, а не вниз", () => {
    // Увеличить — не обидеть; уменьшить — отобрать размер, который человек выбрал.
    expect(readScale({ getItem: () => "1.4" })).toBe(1.5);
    expect(readScale({ getItem: () => "0.5" })).toBe(1);
    expect(readScale(undefined)).toBe(1);
  });

  it("применение к окну без корня — не падение", () => {
    expect(() => applyScale(1.5, null)).not.toThrow();
  });
});
