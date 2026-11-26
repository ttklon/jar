// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HotkeyCard, parse } from "./HotkeyCard";

/**
 * Шаг 97: занятая клавиша не сохраняется, и сразу предлагается свободная.
 *
 * Главная ошибка, которую это исключает: «сохранили, а оно не работает» — человек
 * узнавал о занятости через неделю, когда клавиша не срабатывала.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("горячая клавиша", () => {
  it("системное сочетание не назначается, и сказано почему", () => {
    render(<HotkeyCard />);
    fireEvent.change(screen.getByLabelText("новое сочетание клавиш"), { target: { value: "Alt+F4" } });
    fireEvent.click(screen.getByRole("button", { name: "назначить" }));

    expect(screen.getByText(/системное сочетание Windows/)).toBeTruthy();
    // Прежняя клавиша осталась действующей — молча ничего не поменялось.
    expect(screen.getByText(/Прежняя клавиша осталась/)).toBeTruthy();
  });

  it("свободная клавиша назначается и называется", () => {
    render(<HotkeyCard />);
    fireEvent.change(screen.getByLabelText("новое сочетание клавиш"), { target: { value: "Ctrl+Shift+K" } });
    fireEvent.click(screen.getByRole("button", { name: "назначить" }));

    expect(screen.getByText(/свободна: можно назначать; сохранил/)).toBeTruthy();
    expect(screen.getByText("Ctrl+Shift+K")).toBeTruthy();
  });

  it("на занятую клавишу сразу называется свободная альтернатива", () => {
    render(<HotkeyCard taken={["ctrl+alt+space"]} />);
    fireEvent.change(screen.getByLabelText("новое сочетание клавиш"), { target: { value: "Ctrl+Alt+Space" } });
    fireEvent.click(screen.getByRole("button", { name: "назначить" }));

    expect(screen.getByText(/уже занята другой программой/)).toBeTruthy();
    expect(screen.getByText(/Свободна:/)).toBeTruthy();
  });

  it("непонятный ввод не превращается в «наверное, вот это»", () => {
    expect(parse("Z")).toBeNull();
    expect(parse("Ctrl+Alt+")).toBeNull();
    expect(parse("Ctrl+Alt+K")).toEqual({ mods: ["ctrl", "alt"], key: "k" });
  });
});
