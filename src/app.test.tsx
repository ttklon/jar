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
  // Чистый лист: знакомство пройдено, место работы не запомнено. Без второго
  // половина тестов начиналась бы с экрана, который оставил предыдущий тест
  // (шаг 191 запоминает место), — и проверяла бы не то, что задумано.
  globalThis.localStorage?.clear?.();
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
    // Кнопка теперь говорит и что это («экран»), поэтому сравниваем с началом
    // текста, а не со всем: подпись дописана, название осталось первым.
    const voice = Array.from(list.querySelectorAll("button")).find((button) =>
      button.textContent?.trim().startsWith("Голос"),
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

    await screen.findByText("Знакомство", {}, { timeout: 5000 });
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
    await screen.findByText(/\d+ инструментов/, {}, { timeout: 5000 });

    const voicePrompt = screen.getByText(/Скажите задачу/);
    expect(voicePrompt.closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it("обзор реестра показывает цифры из данных репозитория", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Обзор" }).click();
    await screen.findByText("Что уже умею", {}, { timeout: 5000 });

    const domainsBlock = await screen.findAllByText(String(DOMAINS));
    expect(domainsBlock.length).toBeGreaterThan(0);
    expect(screen.getAllByText(String(TOTAL)).length).toBeGreaterThan(0);
  });

  it("экран «Руки» показывает инструменты и их политику", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Руки" }).click();
    await screen.findByText(/\d+ инструментов/, {}, { timeout: 5000 });

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
    // Экран грузится по требованию: ждём не шапку, а сам план. Шапка
    // появляется раньше тела — на этом тест и спотыкался.
    await screen.findByText("Как поживает компьютер", {}, { timeout: 5000 });
    expect(screen.getByText(/\d+ сценариев/)).toBeTruthy();

    // Сценарии собираются из данных: заголовок и его шаги приходят из data/flows.json.
    expect(screen.getAllByText(/В браузере сценарии не выполняются/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\d+ шагов/).length).toBeGreaterThan(0);
  });

  it("экраны подключены по требованию, а не все сразу", async () => {
    // Шаги 387/393. Статический импорт одиннадцати экранов кладёт их все в
    // первый бандл: человек ждёт разбора мегабайтов ради одного экрана.
    // Проверяется на уровне исходника, потому что в jsdom модуль грузится в
    // том же такте и заглушку не увидеть, — а вернуть статический импорт
    // легко и незаметно.
    // Читаем с диска от корня репозитория: `import.meta.url` в jsdom — не
    // file-схема, и `URL` по нему не открывается.
    const source = (await import("node:fs")).readFileSync(
      `${process.cwd()}/src/app.tsx`,
      "utf8",
    );
    const lazyScreens = [...source.matchAll(/lazy\(\(\) => import\("\.\/screens\/(\w+)"\)/g)].map(
      (match) => match[1],
    );
    // Все экраны, кроме тех, что нужны на первом кадре.
    for (const name of ["Overview", "Catalog", "Hands", "Flows", "Ask", "Models", "Journal", "Apps", "Settings"]) {
      expect(lazyScreens, `${name} грузится по требованию`).toContain(name);
      expect(source).not.toMatch(new RegExp(`^import \\{ ${name} \\} from "\\./screens/${name}";`, "m"));
    }
    // Voice и Welcome остаются статическими: первый кадр не ждёт сети.
    expect(source).toMatch(/^import \{ Voice \} from "\.\/screens\/Voice";/m);
    expect(source).toMatch(/^import \{ Welcome \} from "\.\/screens\/Welcome";/m);
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
    await screen.findByText(/87 приложений/, {}, { timeout: 5000 });

    // Числа приходят из данных: профилей столько, сколько файлов в data/profiles.
    expect(screen.getAllByText(/\d+ операций/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Показать операции/).length).toBeGreaterThan(0);
  });

  it("каталог фильтрует по фразе", async () => {
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "Что умею" }).click();
    // Экран подгружается по требованию: в CI модуль грузится заметно дольше,
    // чем в локальном прогоне, поэтому ждём с запасом, а не «сразу после клика».
    await screen.findByText("Каталог действий", {}, { timeout: 5000 });

    const found = await screen.findByText(new RegExp(`Найдено: ${TOTAL} из ${TOTAL}`));
    expect(found).toBeTruthy();
  });

  it("один вход: фраза с любого экрана доходит до разговора", async () => {
    // Шаг 181. До этого поле было только на экране «Голос»: ушёл в «Историю» — и
    // чтобы что-то сказать, надо было вспомнить, что говорить надо не здесь.
    render(<App />);
    await loaded();

    nav().getByRole("button", { name: "История" }).click();
    // Заголовок экрана, а не «Что болит»: второе появляется, лишь когда пришли
    // данные журнала, и ждать его — значит проверять чужую загрузку.
    await screen.findByRole("heading", { name: "История", level: 1 }, { timeout: 5000 });

    // Вход на виду и на чужом экране.
    const entry = screen.getByRole("textbox", { name: /скажи или напиши/ });
    fireEvent.change(entry, { target: { value: "создай папку на рабочем столе" } });
    fireEvent.submit(entry.closest("form")!);

    // Фраза не отправилась за человека — она лежит в поле разговора, и её видно.
    // Поле разговора называется «Услышал»: вход обещает «не ищи экран», а не
    // «действуй без тебя», и последний взгляд перед действием остаётся человеку.
    const field = await screen.findByRole("textbox", { name: "Услышал" }, { timeout: 5000 });
    await waitFor(() =>
      expect((field as HTMLInputElement).value).toBe("создай папку на рабочем столе"),
    );
    // А из единого входа фраза ушла: иначе она отправилась бы дважды.
    expect((entry as HTMLInputElement).value).toBe("");
  });

  it("«Состояние» открывается из ленты и говорит правду одним взглядом (шаг 1)", async () => {
    render(<App />);
    await loaded();

    // Пункт есть в ленте — значит до экрана можно добраться без мыши, Tab'ом.
    nav().getByRole("button", { name: "Состояние" }).click();
    await screen.findByRole("heading", { name: "Состояние", level: 1 }, { timeout: 6000 });

    // И на нём сразу видно и что работает, и чего мы не знаем — словами, а не
    // цветом. Сводка с числом: «N проверено · …».
    expect(screen.getByText(/^\d+ (проверено|не проверено|не установлено|провал)|проверять нечего|делать нечего/)).toBeTruthy();
  });

  it("одно поле ищет настройку и ведёт в настройки (шаг 192)", async () => {
    render(<App />);
    await loaded();

    // Ctrl+K — палитра, и в ней «тема» находит настройку, а не только «Настройки»
    // как экран. Раньше человек получал ответ «Настройки» и искал внутри глазами.
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const search = await screen.findByLabelText("Поиск экрана", {}, { timeout: 5000 });
    fireEvent.change(search, { target: { value: "тёмная" } });

    const palette = await screen.findByTestId("palette");
    expect(palette.textContent).toContain("Тема");
    expect(palette.textContent).toContain("настройка");

    // Выбор ведёт на экран настроек — туда, где эта тема и живёт.
    const item = Array.from(palette.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Тема"),
    );
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    await screen.findByRole("heading", { name: "Настройки", level: 1 }, { timeout: 5000 });
  });

  it("возможность находится тем словом, которым её называют (шаг 192)", async () => {
    render(<App />);
    await loaded();

    // «Скачать модель» — не экран и не настройка: такого пункта в ленте нет.
    // Поиск обязан находить возможность и вести туда, где она живёт.
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const search = await screen.findByLabelText("Поиск экрана", {}, { timeout: 5000 });
    fireEvent.change(search, { target: { value: "скачать модель" } });

    const palette = await screen.findByTestId("palette");
    expect(palette.textContent).toContain("возможность");
    const item = Array.from(palette.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Скачать модель"),
    );
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    await screen.findByRole("heading", { name: /Модели/i, level: 1 }, { timeout: 5000 });
  });

  it("место работы открывается в следующий раз (шаг 191)", async () => {
    // Первый запуск: ушли в «Историю».
    const first = render(<App />);
    await loaded();
    nav().getByRole("button", { name: "История" }).click();
    await screen.findByRole("heading", { name: "История", level: 1 }, { timeout: 5000 });
    first.unmount();

    // Второй запуск: приложение открывается там, где человек работал, а не с
    // начала. Иначе каждый раз надо заново искать своё место.
    //
    // Ждём не микрофон: на «Истории» его нет, и `loaded()` искал бы не то.
    // Признак загрузки здесь — лента навигации, она есть на любом экране.
    render(<App />);
    await screen.findByRole("heading", { name: "История", level: 1 }, { timeout: 6000 });
  });

  it("стрелки двигают фокус по экранам (шаг 191)", async () => {
    render(<App />);
    await loaded();

    const items = Array.from(
      screen.getByRole("navigation").querySelectorAll<HTMLButtonElement>("button"),
    );
    expect(items.length).toBeGreaterThan(2);
    items[0]!.focus();

    // Вниз — следующий пункт, и фокус именно на нём, а не «где-нибудь».
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(items[1]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);

    // С последнего вниз — на первый: список не обрывается в пустоту.
    const last = items[items.length - 1]!;
    last.focus();
    fireEvent.keyDown(last, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);

    // Home и End — крайние, как в любом списке.
    fireEvent.keyDown(items[0]!, { key: "End" });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("один вход: название экрана ведёт на экран, а не в разговор", async () => {
    render(<App />);
    await loaded();

    const entry = screen.getByRole("textbox", { name: /скажи или напиши/ });
    fireEvent.change(entry, { target: { value: "история" } });
    fireEvent.submit(entry.closest("form")!);

    // Увели на «Историю», а не оставили фразу «история» в поле разговора.
    // Заголовок экрана, а не «Что болит»: второе появляется, лишь когда пришли
    // данные журнала, и ждать его — значит проверять чужую загрузку.
    await screen.findByRole("heading", { name: "История", level: 1 }, { timeout: 5000 });
    expect((entry as HTMLInputElement).value).toBe("");
  });
});

describe("уменьшение движения доходит до документа (шаг 187)", () => {
  it("при включённой настройке системы на корне стоит data-motion=still", async () => {
    // Дефект: флаг вычислялся и оставался переменной — настройка, которая
    // ничего не меняет, это «не сделано», а не «почти сделано».
    const origin = globalThis.matchMedia;
    globalThis.matchMedia = ((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof globalThis.matchMedia;
    globalThis.localStorage?.setItem(WELCOME_KEY, "1");

    render(<App />);
    await waitFor(() => expect(screen.getByRole("navigation")).toBeTruthy());
    expect(document.documentElement.getAttribute("data-motion")).toBe("still");

    globalThis.matchMedia = origin;
  });
});

describe("сенсор: цели крупнее и это сказано (шаг 223)", () => {
  it("при pointer: coarse пункт меню вырастает до 44 и появляется пояснение", async () => {
    const origin = globalThis.matchMedia;
    // Восстановление — через `finally`, а не в конце тела: упавший тест иначе
    // протекает в следующий, и второй падает с чужим размером.
    try {
    globalThis.matchMedia = ((q: string) => ({
      matches: q.includes("pointer: coarse"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof globalThis.matchMedia;
    globalThis.localStorage?.setItem(WELCOME_KEY, "1");

    render(<App />);
    await waitFor(() => expect(screen.getByRole("navigation")).toBeTruthy());
    // Ищем внутри навигации: кнопка «Руки» есть и на самом экране «Руки».
    const item = within(screen.getByRole("navigation")).getByRole("button", { name: "Руки" });
    // Палец попадает в пункт, а не мимо: высота идёт от указателя, а не от вкуса.
    expect(item.style.minHeight).toBe("44px");
    // И это не молча: смена размера без объяснения читается как поломка.
    expect(screen.getByText(/сенсорный экран: цели крупнее/)).toBeTruthy();
    } finally {
      globalThis.matchMedia = origin;
    }
  });

  it("на мыши пункт ниже и пояснения нет: там ничего не менялось", async () => {
    // Мышь надо **объявить**: среда, которая молчит про указатель, считается
    // сенсорной — ошибаться в сторону крупных целей безопаснее (правило 3).
    const origin = globalThis.matchMedia;
    globalThis.matchMedia = ((q: string) => ({
      matches: q.includes("pointer: fine"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof globalThis.matchMedia;
    try {
      globalThis.localStorage?.setItem(WELCOME_KEY, "1");
      render(<App />);
      await waitFor(() => expect(screen.getByRole("navigation")).toBeTruthy());
      expect(within(screen.getByRole("navigation")).getByRole("button", { name: "Руки" }).style.minHeight).toBe("32px");
      expect(screen.queryByText(/сенсорный экран/)).toBeNull();
    } finally {
      globalThis.matchMedia = origin;
    }
  });
});
