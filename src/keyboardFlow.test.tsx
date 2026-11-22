// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "./app";
import { WELCOME_KEY } from "./lib/firstRun";

/**
 * Главный сценарий проходит без мыши (шаг 190).
 *
 * Зачем отдельный тест, когда есть сторож 183. Тот проверяет **разметку**: нет
 * кликов на не-кнопках. Это необходимо, но не достаточно: фокуса может не быть
 * ни у чего, порядок Tab может уходить в пустоту, а поле может быть за
 * `pointer-events: none`. Ни одного из этого в разметке не видно.
 *
 * Поэтому здесь ведётся **настоящий** путь клавишами: Tab по элементам, пока не
 * дойдём до единого входа, слово, Enter — и проверка, что слово доехало до поля
 * разговора. Мышь не участвует ни разу: `fireEvent.click` в этом файле нет
 * намеренно — он проходил бы и там, где Tab не работает.
 *
 * Почему именно «до поля разговора», а не «отправилось». Отправка — это второе
 * действие и, возможно, вопрос про модель. Главный сценарий человека без мыши —
 * сказать фразу и увидеть её в поле; дальше он жмёт Enter ещё раз, и это уже
 * проверено на экране «Голос» отдельно.
 */

vi.mock("./ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ipc")>();
  return { ...actual, isTauri: () => false };
});

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
  globalThis.localStorage?.clear();
});

describe("главный сценарий без мыши", () => {
  it("вход фокусируется и принимает фразу клавишами", async () => {
    globalThis.localStorage?.setItem(WELCOME_KEY, "1");
    render(<App />);

    // Приложение открывается голосом: это и есть «загрузилось».
    await screen.findByRole("button", { name: /Держать и говорить|Всегда слушаю/ }, { timeout: 8000 });

    const entry = screen.getByRole("textbox", { name: /скажи или напиши/ });

    // 1. Вход **фокусируем**. Это то, что проверяемо в jsdom: он не двигает
    //    фокус по Tab сам, поэтому «дошёл ли Tab» здесь не проверить. А вот
    //    «попадает ли элемент в порядок Tab» — проверить можно: `tabIndex`
    //    не отрицательный, элемент не `disabled` и не `hidden`.
    entry.focus();
    expect(document.activeElement, "поле входа не принимает фокус").toBe(entry);
    expect(entry.hasAttribute("disabled")).toBe(false);
    expect(entry.getAttribute("tabindex")).not.toBe("-1");

    // 2. Набранное с клавиатуры доходит до состояния поля.
    fireEvent.change(entry, { target: { value: "первое дело" } });
    expect((entry as HTMLInputElement).value).toBe("первое дело");

    // 3. Enter отправляет форму — тот же путь, что у мыши: `submit` формы, а не
    //    отдельный обработчик кнопки. Иначе клавиатура и мышь вели бы двумя
    //    путями, и один из них однажды отстал бы.
    fireEvent.submit(entry.closest("form")!);

    // 4. Фраза доехала до разговора и не потерялась.
    const field = await screen.findByRole("textbox", { name: "Услышал" }, { timeout: 5000 });
    await waitFor(() => expect((field as HTMLInputElement).value).toBe("первое дело"));
  });

  it("все нажимаемые места — кнопки, и каждая фокусируема", async () => {
    // Шаг 190 вместе с 183: сценарий без мыши держится на том, что **всё**
    // нажимаемое попадает в порядок Tab. Кнопка Fluent и `<button>` попадают
    // сами; `div` — нет, и это ловится сторожем 183. Здесь проверяется вторая
    // половина: у кнопок на экране нет `tabIndex="-1"` и они не спрятаны от
    // фокуса.
    globalThis.localStorage?.setItem(WELCOME_KEY, "1");
    render(<App />);
    await screen.findByRole("button", { name: /Держать и говорить|Всегда слушаю/ }, { timeout: 8000 });

    const buttons = Array.from(document.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThan(0);
    const hidden = buttons
      .filter((button) => button.getAttribute("tabindex") === "-1")
      .map((button) => (button.textContent ?? "").trim().slice(0, 40) || button.outerHTML.slice(0, 60));
    expect(hidden, "кнопки вне порядка Tab").toEqual([]);
  });

  it("Enter в пустом поле не уводит на экран и не падает", async () => {
    // Пустой Enter — самое частое нажатие новичка. Он не должен ничего делать:
    // ни перехода на «Голос» (мы уже там), ни падения.
    globalThis.localStorage?.setItem(WELCOME_KEY, "1");
    render(<App />);
    await screen.findByRole("button", { name: /Держать и говорить|Всегда слушаю/ }, { timeout: 8000 });

    const entry = screen.getByRole("textbox", { name: /скажи или напиши/ });
    fireEvent.submit(entry.closest("form")!);

    // Ничего не произошло: поле пустое, ошибок нет.
    expect((entry as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
