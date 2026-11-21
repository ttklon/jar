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

  it("главный сценарий проходится с клавиатуры: палитра, Enter, дело текстом", async () => {
    render(<App />);
    await loaded();

    // 1. Экран меняется без мыши: Ctrl+K, буквы, Enter — на первый найденный.
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByLabelText("Поиск экрана", {}, { timeout: 5000 }), {
      target: { value: "история" },
    });
    fireEvent.keyDown(screen.getByLabelText("Поиск экрана"), { key: "Enter" });
    await waitFor(() => expect(screen.queryByLabelText("Поиск экрана")).toBeNull(), {
      timeout: 5000,
    });

    // 2. Возврат на «Голос» — тоже без мыши.
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByLabelText("Поиск экрана", {}, { timeout: 5000 }), {
      target: { value: "голос" },
    });
    fireEvent.keyDown(screen.getByLabelText("Поиск экрана"), { key: "Enter" });

    // 3. Поле задачи доступно с клавиатуры и подписано клавишей Enter.
    //    Ищем среди всех полей «Услышал»: голосовой экран остаётся смонтированным
    //    за скрытыми экранами, и полей два — это не дубль, а цена фонового голоса.
    const fields = await screen.findAllByLabelText("Услышал", {}, { timeout: 2000 });
    const field = fields[fields.length - 1];
    expect(field).toBeTruthy();
    fireEvent.change(field as HTMLElement, { target: { value: "сколько места на диске" } });
    // Кнопка подписана клавишей, а не молчит. Ищем по обеим подписям: после
    // заполнения шагов поле может ждать ответа, и это тоже честная подсказка.
    // Проверяем через eventual-ожидание: поиск по фразе асинхронный.
    await waitFor(
      () =>
        expect(
          screen.queryByTitle("Enter — найти. Ctrl+K — любой экран") ??
            screen.queryByTitle("Enter — отправить ответ. Ctrl+K — любой экран"),
        ).toBeTruthy(),
      { timeout: 2000 },
    );
  });

  it("при узком окне и крупном масштабе навигация уходит наверх, а не сжимает содержимое", async () => {
    // 640 логических пикселей — это экран 1280 при масштабе 200%. Раньше колонка
    // была жёстко 236 px и отнимала больше трети ширины.
    const original = globalThis.innerWidth;
    Object.defineProperty(globalThis, "innerWidth", { value: 640, configurable: true });
    fireEvent(window, new Event("resize"));

    render(<App />);
    await loaded();

    const shell = document.querySelector("main")?.parentElement;
    expect(shell).toBeTruthy();
    // Одна колонка: боковая панель не занимает 236 px.
    expect((shell as HTMLElement).style.gridTemplateColumns).toBe("1fr");
    // Навигация лентой сверху: элементы идут в строку, а не в столбик.
    const nav = screen.getByRole("navigation");
    expect(nav.style.flexDirection).toBe("row");

    Object.defineProperty(globalThis, "innerWidth", { value: original, configurable: true });
    fireEvent(window, new Event("resize"));
  });

  it("на узком экране полоска не остаётся сбоку, а навигация не обрезается", async () => {
    // Три дефекта одного и того же решения «колонка стала лентой»:
    //
    //  * `border-right` остался — полоса вдоль всего экрана, будто колонка есть;
    //  * `overflow: hidden` на ленте режет перенос кнопок: на 200% масштабе
    //    часть навигации недоступна;
    //  * распорка `flex: 1` съедала высоту и выталкивала подпись за край.
    //
    // Проверяются именно эти три свойства, а не «стало красивее»: всё
    // остальное о вёрстке глазами не проверишь.
    const original = globalThis.innerWidth;
    Object.defineProperty(globalThis, "innerWidth", { value: 640, configurable: true });
    fireEvent(window, new Event("resize"));

    render(<App />);
    await loaded();

    const aside = document.querySelector("aside");
    expect(aside).toBeTruthy();
    const style = (aside as HTMLElement).style;
    // `0px`, а не пусто: пустое значит «не задали», и полоса осталась бы.
    expect(style.borderRight).toBe("0px");
    // Полоса снизу — она отделяет ленту от содержимого.
    expect(style.borderBottom).toContain("1px");
    // Лента растёт вниз вместе с переносом, а не обрезает кнопки.
    expect(style.overflow).toBe("visible");

    Object.defineProperty(globalThis, "innerWidth", { value: original, configurable: true });
    fireEvent(window, new Event("resize"));
  });

  it("на широком экране колонка остаётся колонкой", async () => {
    // Обратная сторона: правка для узкого окна не должна сломать широкое.
    const original = globalThis.innerWidth;
    Object.defineProperty(globalThis, "innerWidth", { value: 1600, configurable: true });
    fireEvent(window, new Event("resize"));

    render(<App />);
    await loaded();

    const aside = document.querySelector("aside") as HTMLElement;
    // На широком экране рамка задаётся классом, инлайн-стиля нет вовсе.
    expect(aside.style.borderRight).toBe("");
    expect(aside.style.overflow).toBe("");
    // И навигация по-прежнему столбиком.
    expect(screen.getByRole("navigation").style.flexDirection).toBe("");

    Object.defineProperty(globalThis, "innerWidth", { value: original, configurable: true });
    fireEvent(window, new Event("resize"));
  });

  it("Esc закрывает палитру и возвращает фокус туда, откуда пришли", async () => {
    // Открыли с клавиатуры — фокус был на кнопке навигации. После Esc он должен
    // вернуться туда же, а не упасть в `document.body`: иначе следующий Tab
    // начинает с начала страницы, и человек, который ходит табуляцией, теряет
    // место. Это дефект, который не виден ни глазами, ни в обычных тестах.
    render(<App />);
    await loaded();

    const nav = screen.getByRole("navigation");
    const first = within(nav).getAllByRole("button")[0] as HTMLElement;
    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByLabelText(/поиск|найти/i);
    // Палитра забрала фокус — так и должно быть.
    expect(document.activeElement).not.toBe(first);
    expect(input).toBeTruthy();

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Фокус вернулся на ту же кнопку, а не в тело документа.
    await waitFor(() => expect(document.activeElement).toBe(first));
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
