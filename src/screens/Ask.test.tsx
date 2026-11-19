// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Ask } from "./Ask";

/**
 * Проверяется обещание экрана: на просьбу он отвечает тем, что есть в реестре, и
 * говорит прямо, выполнимо ли это. В тестах работает dev-адаптер (браузер), правила
 * поиска у него те же, что в ядре (`src/lib/planner.ts`).
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран «Спросить»", () => {
  it("находит действие, которое приложение умеет выполнять", async () => {
    render(<Ask />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "создай папку" } });
    fireEvent.click(screen.getByRole("button", { name: /найти/i }));

    await waitFor(() => {
      expect(screen.getByText("files|создать|папку")).toBeTruthy();
    });
    expect(screen.getAllByText(/уже умею/i).length).toBeGreaterThan(0);
  });

  it("на пустой запрос не отвечает «ничего не нашлось»", async () => {
    render(<Ask />);

    fireEvent.click(screen.getByRole("button", { name: /найти/i }));

    expect(screen.queryByText(/ничего не нашлось/i)).toBeNull();
    expect(screen.getByText(/проще всего ищется/i)).toBeTruthy();
  });
});
