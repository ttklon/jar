// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "./app";
import actionsJson from "../data/actions.json";
import { WELCOME_KEY } from "./lib/firstRun";

/**
 * Цифры берём из данных, а не из головы: реестр растёт, и дымовой тест должен проверять,
 * что экран показывает настоящее число, а не совпадать с однажды записанным.
 */
const TOTAL = actionsJson.length;
const DOMAINS = new Set(actionsJson.map((row) => row.domain)).size;

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

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear?.();
});

/**
 * Знакомство показывается один раз — в остальных тестах оно уже «видели», иначе каждый
 * из них начинался бы с первого экрана и проверял бы не то, что задумано.
 */
beforeEach(() => {
  globalThis.localStorage?.setItem?.(WELCOME_KEY, "1");
});

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

  it("Ctrl+K открывает палитру, а первые буквы ведут на экран без мыши", async () => {
    render(<App />);
    await loaded();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    // Под общей нагрузкой (полный прогон) диалог может открываться дольше секунды;
    // ждём с запасом, иначе тест падает от загрузки машины, а не от поломки.
    const search = await screen.findByLabelText("Поиск экрана", {}, { timeout: 5000 });

    // Слово, которого нет в меню глазами: человек помнит «микрофон», а не «Голос».
    fireEvent.change(search, { target: { value: "микрофон" } });
    // «Голос» есть и в меню, и в палитре. Нажимаем именно пункт палитры:
    // иначе тест доказывал бы работу меню, а не открытой палитры.
    // Кнопку ищем по видимому тексту, а не по роли: диалог Fluent прячет
    // содержимое от дерева доступности (`aria-hidden`), пока анимируется
    // открытие, и `getByRole` под общей нагрузкой его не видит. Роль при этом
    // настоящая — в браузере кнопка доступна; здесь мы не проверяем Fluent,
    // а проверяем, что палитра нашла экран и переход по ней закрыл палитру.
    const list = screen.getByTestId("palette");
    const voice = Array.from(list.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Голос",
    );
    expect(voice).toBeTruthy();
    fireEvent.click(voice as HTMLButtonElement);

    // Палитра закрылась — иначе она закрывала бы собой тот самый экран.
    await waitFor(() => expect(screen.queryByLabelText("Поиск экрана")).toBeNull(), {
      timeout: 5000,
    });
  });

  it("палитра честно говорит, когда совпадений нет", async () => {
    render(<App />);
    await loaded();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByLabelText("Поиск экрана", {}, { timeout: 5000 }), {
      target: { value: "квантовая телепортация" },
    });

    expect(screen.getByText(/ничего не нашлось по «квантовая телепортация»/)).toBeTruthy();
  });

  it("при первом запуске сначала знакомит, а потом открывает голос", async () => {
    globalThis.localStorage?.clear?.();
    render(<App />);

    await waitFor(() => expect(screen.getByText("Знакомство")).toBeTruthy(), { timeout: 4000 });
    // Знакомство закрывает работу: голосового экрана за ним ещё нет.
    expect(screen.queryByRole("button", { name: "Держать и говорить" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "К разговору" }));

    await loaded();
    // Ответ запомнен: второй раз экран не появится.
    expect(globalThis.localStorage?.getItem(WELCOME_KEY)).toBe("1");
  });

  it("открывается голосовым экраном, а не списком экранов", async () => {
    render(<App />);

    await loaded();
    expect(screen.getByText(/Скажите задачу/)).toBeTruthy();
    expect(screen.getByText(/Пока ничего не сказано/)).toBeTruthy();
  });

  it("голосовой сервис остаётся смонтированным за скрытым экраном для Ctrl+Space", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Руки" }).click();
    await waitFor(() => expect(screen.getByText(/\d+ инструментов/)).toBeTruthy());

    const voicePrompt = screen.getByText(/Скажите задачу/);
    expect(voicePrompt.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("обзор реестра показывает цифры из данных репозитория", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Обзор" }).click();
    await waitFor(() => expect(screen.getByText("Что уже умею")).toBeTruthy(), { timeout: 4000 });

    const domainsBlock = await screen.findAllByText(String(DOMAINS));
    expect(domainsBlock.length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(TOTAL)).length).toBeGreaterThan(0);
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

    const found = await screen.findByText(new RegExp(`Найдено: ${TOTAL} из ${TOTAL}`));
    expect(found).toBeTruthy();
  });
});
