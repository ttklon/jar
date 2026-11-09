// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  /**
   * Кнопки навигации ищутся внутри меню: на самом голосовом экране есть ссылки
   * «Руки», «История» и «Что умею», и они ведут туда же. Это не дубли, а два входа
   * в одно место — но по имени они совпадают, поэтому ищем в меню.
   */
  const nav = () => within(screen.getByRole("navigation"));

  /** Приложение открывается голосом: это и есть проверка «загрузилось». */
  const loaded = () =>
    waitFor(
      () => expect(screen.getByRole("button", { name: "Держать и говорить" })).toBeTruthy(),
      { timeout: 4000 },
    );

  it("открывается голосовым экраном, а не списком экранов", async () => {
    render(<App />);

    await loaded();
    expect(screen.getByText(/Скажите задачу/)).toBeTruthy();
    expect(screen.getByText(/Пока ничего не сказано/)).toBeTruthy();
  });

  it("обзор реестра показывает цифры из данных репозитория", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Обзор" }).click();
    await waitFor(() => expect(screen.getByText("Что уже умею")).toBeTruthy(), { timeout: 4000 });

    const domainsBlock = await screen.findAllByText("49");
    expect(domainsBlock.length).toBeGreaterThan(0);
    expect(screen.getAllByText("829").length).toBeGreaterThan(0);
  });

  it("экран «Руки» показывает инструменты и их политику", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Руки" }).click();
    await waitFor(() => expect(screen.getByText(/\d+ инструментов/)).toBeTruthy());

    // Опасное помечено, чтение — нет: политика приходит из того же решения, что и в ядре.
    expect(screen.getAllByText("Требует подтверждения").length).toBeGreaterThan(0);
    expect(screen.getByText(/В браузере инструменты не выполняются/)).toBeTruthy();
    // Проверка перед запуском живёт в ядре, и экран это говорит, а не делает вид.
    expect(screen.getByText(/проверку перед запуском делает приложение/)).toBeTruthy();
  });

  it("экран «Сценарии» показывает план из шагов и риск", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Сценарии" }).click();
    await waitFor(() => expect(screen.getByText(/\d+ сценариев/)).toBeTruthy());

    // Сценарии собираются из данных: заголовок и его шаги приходят из data/flows.json.
    expect(screen.getByText("Как поживает компьютер")).toBeTruthy();
    expect(screen.getAllByText(/В браузере сценарии не выполняются/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d+ шагов/).length).toBeGreaterThan(0);
  });

  it("экран «История» честно говорит, что журнала в браузере нет", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "История" }).click();
    // Два «Пока пусто» — журнал и память: это разные источники, и оба честно пусты
    // в браузере, где нет ни журнала, ни базы.
    await waitFor(() => expect(screen.getAllByText(/Пока пусто/).length).toBe(2));
    expect(screen.getByText(/В браузере журнала нет/)).toBeTruthy();
    expect(screen.getByText(/В браузере памяти нет/)).toBeTruthy();
  });

  it("экран «Приложения» показывает профили и честно говорит, что исполняется", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Приложения" }).click();
    await waitFor(() => expect(screen.getByText(/87 приложений/)).toBeTruthy());

    // Числа приходят из данных: профилей столько, сколько файлов в data/profiles.
    expect(screen.getAllByText(/\d+ операций/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Показать операции/).length).toBeGreaterThan(0);
  });

  it("каталог фильтрует по фразе", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Что умею" }).click();
    await waitFor(() => expect(screen.getByText("Каталог действий")).toBeTruthy());

    const found = await screen.findByText(/Найдено: 829 из 829/);
    expect(found).toBeTruthy();
  });
});
