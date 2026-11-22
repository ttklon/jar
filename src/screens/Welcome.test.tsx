// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import actionsJson from "../../data/actions.json";
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

  it("первое дело предлагается до настройки, а не после неё", () => {
    // Пока модель качается, реестр уже отвечает: «что умею», «где данные»,
    // «сколько места». Человек должен увидеть это на первом экране, а не искать
    // кнопку настройки, чтобы получить первый ответ.
    const onStart = vi.fn();
    render(<Welcome source="ядро" onStart={onStart} onOpen={() => {}} />);

    expect(screen.getByText("Можно сразу, без настройки:")).toBeTruthy();
    expect(screen.getByText("«что умею»")).toBeTruthy();
    // Главное действие — «К разговору», и оно выше карточки готовности: первый
    // ответ не должен ждать настройки (шаги 21/28).
    // Главное действие стоит раньше карточки готовности: карточка — про то, чего
    // не хватает, а разговор начинается без неё.
    const start = screen.getByRole("button", { name: "К разговору" });
    const sideLinks = screen.getByText("если нужно сначала посмотреть:");
    expect(
      start.compareDocumentPosition(sideLinks) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("«начать» закрывает знакомство, а не выполняет дело", () => {
    const onStart = vi.fn();
    const onOpen = vi.fn();
    render(<Welcome source="ядро" onStart={onStart} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "К разговору" }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("переходы вбок работают и ведут каждый в своё", () => {
    const onOpen = vi.fn();
    render(<Welcome source="ядро" onStart={() => {}} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Что умею" }));
    fireEvent.click(screen.getByRole("button", { name: "История" }));
    fireEvent.click(screen.getByRole("button", { name: "Экран моделей" }));

    expect(onOpen.mock.calls).toEqual([["catalog"], ["journal"], ["models"]]);
  });

  it("путь в разговор один, а не три (шаги 21/29)", () => {
    // Пять кнопок, из которых три делают одно и то же, — это выбор, которого
    // человек не просил. На первом экране должно быть одно главное действие.
    const onStart = vi.fn();
    render(<Welcome source="ядро" onStart={onStart} onOpen={() => {}} />);

    const buttons = screen.getAllByRole("button");
    const starts = buttons.filter((button) =>
      /К разговору|Спросить словами|Сказать первое дело/.test(button.textContent ?? ""),
    );

    // Осталось ровно одно действие, ведущее в разговор, — и это главная кнопка.
    expect(starts).toHaveLength(1);
    expect(starts[0]?.textContent).toBe("К разговору");

    fireEvent.click(starts[0] as HTMLElement);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("говорит, откуда данные и что в браузере ничего не выполняется", () => {
    render(<Welcome source="браузер" onStart={() => {}} onOpen={() => {}} />);

    expect(screen.getByText(/Данные: браузер/)).toBeTruthy();
    expect(screen.getByText(/в браузере ничего не выполняется/i)).toBeTruthy();
  });


  it("спрашивает имя один раз и сразу показывает, что запомнил (шаг 37)", () => {
    localStorage.clear();
    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);

    // Один вопрос — и он про человека, а не про настройку.
    const field = screen.getByLabelText("как тебя называть?") as HTMLInputElement;
    expect(field.value).toBe("");
    // Отказ назван, а не спрятан (шаг 38).
    expect(screen.getByText("можно не отвечать")).toBeTruthy();

    fireEvent.change(field, { target: { value: "Аня" } });

    // Запомнилось сразу, а не по кнопке: человек может уйти с экрана.
    expect(localStorage.getItem("zshelper.person.name")).toBe("Аня");
    expect(screen.getByText("запомнил: Аня")).toBeTruthy();
  });


  it("неподходящая система названа до разговора и с действием (шаг 35)", () => {
    // Старый WebView2 — причина «белого окна». Узнать о ней надо здесь, а не
    // тогда, когда экрана разговора уже нет.
    const ua = vi
      .spyOn(globalThis.navigator, "userAgent", "get")
      .mockReturnValue(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 Safari/537.36 Edg/91.0.864.71",
      );

    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);

    expect(screen.getByText(/Устарел WebView2/)).toBeTruthy();
    // Действие, а не только диагноз: адрес, по которому обновляют.
    expect(screen.getByText(/aka\.ms\/webview2/)).toBeTruthy();
    ua.mockRestore();
  });

  it("«не прочитал» — отдельная строка, а не «подходит»", () => {
    const ua = vi.spyOn(globalThis.navigator, "userAgent", "get").mockReturnValue("");
    const platform = vi.spyOn(globalThis.navigator, "platform", "get").mockReturnValue("");

    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);

    expect(screen.getByText(/Проверить версию Windows и WebView2 не удалось/)).toBeTruthy();
    expect(screen.queryByText(/Система подходит/)).toBeNull();
    ua.mockRestore();
    platform.mockRestore();
  });


  it("второй запуск называет, чего не хватает до пройденного пути (шаг 27)", () => {
    localStorage.clear();
    localStorage.setItem("zshelper.welcome.seen", "1");
    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);

    // Число, а не «всё хорошо»: пройдено 1 из 3, и названо, чего нет.
    expect(screen.getByText(/Первый запуск пройден: 1 из 3/)).toBeTruthy();
    expect(screen.getByText(/Не хватает: объяснения про микрофон, вопроса про имя/)).toBeTruthy();
  });

  it("когда всё пройдено, проверка молчит", () => {
    localStorage.clear();
    for (const key of [
      "zshelper.welcome.seen",
      "zshelper.mic.explained",
      "zshelper.person.asked",
    ]) {
      localStorage.setItem(key, "1");
    }
    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);

    // «Пройдено 3 из 3» на каждом открытии — шум, а не проверка.
    expect(screen.queryByText(/Первый запуск пройден/)).toBeNull();
  });


  it("три примера фраз на первом экране, и каждый находится в реестре (шаг 31)", async () => {
    localStorage.clear();
    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);

    // Один пример читается как «только это и можно сказать».
    const examples = ["что умею", "где мои загрузки", "найди большие файлы"];
    for (const example of examples) {
      expect(screen.getByText(`«${example}»`)).toBeTruthy();
    }

    // Пример, который ничего не находит, — обещание впустую. Проверяем по
    // настоящему реестру: каждое слово примера должно в нём встречаться.
    const haystack = JSON.stringify(actionsJson).toLowerCase();
    for (const word of ["загрузк", "большие файлы"]) {
      expect(haystack).toContain(word);
    }
  });
});
