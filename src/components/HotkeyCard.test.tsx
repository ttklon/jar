// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HotkeyCard, parse } from "./HotkeyCard";

/**
 * Шаг 97: занятая клавиша не сохраняется, и сразу предлагается свободная.
 *
 * Главная ошибка, которую это исключает: «сохранили, а оно не работает» — человек
 * узнавал о занятости через неделю, когда клавиша не срабатывала.
 *
 * Прежняя версия теста проверяла **слова** карточки, а сама карточка объявляла
 * «сохранил» по факту нажатия: клавиша в ядре была константой. Поэтому здесь
 * проверяется не текст, а договор с ядром: `saved` берётся из ответа, при отказе
 * прежняя клавиша остаётся, а в браузере назначение честно не выполняется.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const current = vi.fn();
const assign = vi.fn();
const tauri = vi.fn(() => true);

vi.mock("../ipc", () => ({
  isTauri: () => tauri(),
  hotkeyCurrent: () => current(),
  hotkeyAssign: (spec: string) => assign(spec),
}));

beforeEach(() => {
  current.mockReset();
  assign.mockReset();
  tauri.mockReturnValue(true);
  current.mockResolvedValue({ spec: "ctrl+alt+space", shown: "Ctrl+Alt+Space", known: false, why: "занятость чужих программ Windows не показывает" });
});

afterEach(cleanup);

describe("горячая клавиша", () => {
  it("действующая клавиша приходит из ядра, а не выдумывается", async () => {
    current.mockResolvedValue({ spec: "ctrl+shift+k", shown: "Ctrl+Shift+K", known: true, why: "" });
    render(<HotkeyCard />);

    // Клавиша, назначенная раньше, видна — а не та, что в правиле по умолчанию.
    await waitFor(() => expect(screen.getByText("Ctrl+Shift+K")).toBeTruthy());
  });

  it("отказ ядра — повод, а не «сохранено»: прежняя клавиша осталась", async () => {
    assign.mockRejectedValue(
      new Error("Ctrl+Alt+Space: Windows не отдаёт это сочетание — занято другой программой. Прежняя клавиша осталась: Ctrl+Alt+Space"),
    );
    render(<HotkeyCard />);
    fireEvent.change(screen.getByLabelText("новое сочетание клавиш"), { target: { value: "Ctrl+Alt+Space" } });
    fireEvent.click(screen.getByRole("button", { name: "назначить" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/занято другой программой/));
    // Никакого «сохранил» при отказе — именно это и было дефектом.
    expect(screen.queryByText(/сохранил/i)).toBeNull();
  });

  it("успех называется проверенным: назначение подтверждено регистрацией", async () => {
    assign.mockResolvedValue({ spec: "ctrl+shift+k", shown: "Ctrl+Shift+K", known: true, why: "" });
    render(<HotkeyCard />);
    fireEvent.change(screen.getByLabelText("новое сочетание клавиш"), { target: { value: "Ctrl+Shift+K" } });
    fireEvent.click(screen.getByRole("button", { name: "назначить" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/назначил и проверил регистрацией/));
    expect(assign).toHaveBeenCalledWith("ctrl+shift+k");
  });

  it("в браузере не обещает сохранение: проверять нечем", async () => {
    tauri.mockReturnValue(false);
    render(<HotkeyCard />);
    fireEvent.change(screen.getByLabelText("новое сочетание клавиш"), { target: { value: "Ctrl+Shift+K" } });
    fireEvent.click(screen.getByRole("button", { name: "назначить" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/в браузере клавишу проверить и назначить нечем/));
    expect(assign).not.toHaveBeenCalled();
  });

  it("непонятный ввод не превращается в «наверное, вот это»", () => {
    expect(parse("Z")).toBeNull();
    expect(parse("Ctrl+Alt+")).toBeNull();
    expect(parse("Ctrl+Alt+K")).toEqual({ mods: ["ctrl", "alt"], key: "k" });
  });
});
