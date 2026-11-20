// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { Welcome } from "./Welcome";

/**
 * Первый экран — единственное место, где человек узнаёт правила игры. Поэтому тест
 * проверяет не вёрстку, а три вещи: правила названы, «начать» ничего не выполняет на
 * машине, и оговорка про браузер стоит на экране, а не в документации.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран знакомства", () => {
  it("называет три правила, а не обещания", () => {
    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);

    expect(screen.getByText("Чтение — без спроса")).toBeTruthy();
    expect(screen.getByText("Изменения — после вашего слова")).toBeTruthy();
    expect(screen.getByText("Деньги, личность и необратимое — не делает")).toBeTruthy();
    // Обещаний «всё умеет» на первом экране быть не должно.
    expect(screen.queryByText(/всё умеет/i)).toBeNull();
  });

  it("«начать» закрывает знакомство, а не выполняет дело", () => {
    const onStart = vi.fn();
    const onOpen = vi.fn();
    render(<Welcome source="ядро" onStart={onStart} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "К разговору" }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("три перехода ведут туда, где можно посмотреть", () => {
    const onOpen = vi.fn();
    render(<Welcome source="ядро" onStart={() => {}} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Спросить словами" }));
    fireEvent.click(screen.getByRole("button", { name: "Что умею" }));
    fireEvent.click(screen.getByRole("button", { name: "История" }));

    expect(onOpen.mock.calls).toEqual([["ask"], ["catalog"], ["journal"]]);
  });

  it("говорит, откуда данные и что в браузере ничего не выполняется", () => {
    render(<Welcome source="браузер" onStart={() => {}} onOpen={() => {}} />);

    expect(screen.getByText(/Данные: браузер/)).toBeTruthy();
    expect(screen.getByText(/в браузере ничего не выполняется/i)).toBeTruthy();
  });
});
