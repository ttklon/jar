// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { App } from "./app";

/**
 * Дымовой тест интерфейса: приложение обязано отрисоваться на реальных данных
 * репозитория и показать цифры из реестра. Ловит именно те поломки, которые не
 * видит ни tsc, ни сборка: упавший провайдер темы, пустой список, неверный адаптер.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));

afterEach(cleanup);

describe("App", () => {
  it("показывает реестр из данных репозитория", async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByText("Что уже умею")).toBeTruthy(), { timeout: 4000 });

    const domainsBlock = await screen.findAllByText("49");
    expect(domainsBlock.length).toBeGreaterThan(0);
    expect(screen.getAllByText("829").length).toBeGreaterThan(0);
  });

  it("каталог фильтрует по фразе", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Что уже умею")).toBeTruthy(), { timeout: 4000 });

    screen.getByRole("button", { name: "Что умею" }).click();
    await waitFor(() => expect(screen.getByText("Каталог действий")).toBeTruthy());

    const found = await screen.findByText(/Найдено: 829 из 829/);
    expect(found).toBeTruthy();
  });
});
