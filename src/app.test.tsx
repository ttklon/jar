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

  it("экран «Руки» показывает десять инструментов и их политику", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Что уже умею")).toBeTruthy(), { timeout: 4000 });

    screen.getByRole("button", { name: "Руки" }).click();
    await waitFor(() => expect(screen.getByText(/10 инструментов/)).toBeTruthy());

    // Опасное помечено, чтение — нет: политика приходит из того же решения, что и в ядре.
    expect(screen.getAllByText("Требует подтверждения").length).toBeGreaterThan(0);
    expect(screen.getByText(/В браузере инструменты не выполняются/)).toBeTruthy();
  });

  it("экран «Сценарии» показывает план из шагов и риск", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Что уже умею")).toBeTruthy(), { timeout: 4000 });

    screen.getByRole("button", { name: "Сценарии" }).click();
    await waitFor(() => expect(screen.getByText(/5 сценариев/)).toBeTruthy());

    // Сценарии собираются из данных: заголовок и его шаги приходят из data/flows.json.
    expect(screen.getByText("Как поживает компьютер")).toBeTruthy();
    expect(screen.getAllByText(/В браузере сценарии не выполняются/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d+ шагов/).length).toBeGreaterThan(0);
  });

  it("экран «История» честно говорит, что журнала в браузере нет", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("Что уже умею")).toBeTruthy(), { timeout: 4000 });

    screen.getByRole("button", { name: "История" }).click();
    await waitFor(() => expect(screen.getByText(/Пока пусто/)).toBeTruthy());
    expect(screen.getByText(/В браузере журнала нет/)).toBeTruthy();
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
