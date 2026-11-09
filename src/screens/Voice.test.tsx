// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Voice } from "./Voice";

/**
 * Главный экран: задача приходит словами, ответ приходит словами тоже. Проверяем
 * именно это, а не вёрстку.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("голосовой экран", () => {
  it("сказанное можно поправить руками и отправить — ответ тот же", async () => {
    render(<Voice />);

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "создай папку" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => {
      expect(screen.getByText("files|создать|папку")).toBeTruthy();
    });
    expect(screen.getAllByText(/уже умею/i).length).toBeGreaterThan(0);
  });

  it("когда разобрать нечем — говорит прямо, а не молчит", () => {
    render(<Voice />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));

    // В этом окружении распознавания нет: честный ответ — сказать об этом.
    expect(screen.getByText(/распознавания речи нет/)).toBeTruthy();
  });

  it("пустая фраза не превращается в «ничего не нашлось»", () => {
    render(<Voice />);

    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    expect(screen.queryByText(/такого я пока не умею/)).toBeNull();
    expect(screen.getByText(/Пока ничего не сказано/)).toBeTruthy();
  });

  it("под капотом — вход в доказательство, а не второй рабочий стол", () => {
    const onOpen = vi.fn();
    render(<Voice onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Что умею" }));
    expect(onOpen).toHaveBeenCalledWith("catalog");

    fireEvent.click(screen.getByRole("button", { name: "История" }));
    expect(onOpen).toHaveBeenCalledWith("journal");
  });
});
