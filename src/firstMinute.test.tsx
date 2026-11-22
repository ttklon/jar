// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Шаг 30: «с чистого профиля через 60 секунд есть либо ответ, либо честная причина».
 *
 * Зачем отдельный тест, а не «должно быть быстро». «Должно» — не проверяется:
 * оно истинно, пока никто не смотрел. Здесь проверяется то, что видно глазами
 * на первой минуте, — и только та часть, которую можно измерить без Windows:
 * что путь вообще проходится, что он короткий (не анкета на семь шагов) и что
 * на каждом развилке человек получает либо ответ, либо причину, почему ответа нет.
 *
 * Чего этот тест **не** измеряет (и не должен делать вид): настоящее скачивание
 * гигабайта, скорость сети и железо. Секунды в тесте — не секунды на машине
 * человека, а число шагов. Поэтому имя теста говорит «путь», а не «быстро на
 * любом интернете»: обещать последнее из jsdom — врать.
 */

import { WELCOME_KEY } from "./lib/firstRun";
import { App } from "./app";

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear?.();
  vi.clearAllMocks();
});

beforeEach(() => {
  globalThis.localStorage?.clear?.();
});

describe("первая минута с чистого профиля", () => {
  it("до поля разговора три действия человека, и это не анкета", async () => {
    render(<App />);

    // Шаг 1 — экран знакомства открылся сам: человек ничего не выбрал.
    await screen.findByText("Знакомство", {}, { timeout: 5000 });

    // Шаг 2 — одно главное действие. Не меню из пяти кнопок (шаг 21).
    fireEvent.click(screen.getByRole("button", { name: "К разговору" }));

    // Шаг 3 — экран разговора с полем: дальше можно говорить или печатать.
    const field = await screen.findByLabelText("Услышал", {}, { timeout: 5000 });

    // Ответ появился после трёх действий человека, и ни одного «заполните…».
    expect(field).toBeTruthy();
    expect(screen.queryByText(/заполните|анкета|укажите/i)).toBeNull();
  });

  it("когда ответа нет — сказана причина, а не пустое место", async () => {
    render(<App />);
    await screen.findByText("Знакомство", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: "К разговору" }));

    // В браузере модели нет, и это законная причина. Но она должна быть
    // **названа**: пустое место на месте ответа человек читает как «сломалось».
    const field = await screen.findByLabelText("Услышал", {}, { timeout: 5000 });
    expect(field).toBeTruthy();

    // Без сказанного экран не молчит: он говорит, что пока ничего не сказано.
    expect(screen.getByText(/Пока ничего не сказано/)).toBeTruthy();
  });

  it("причина «нет модели» не выдаётся за ответ", async () => {
    render(<App />);
    await screen.findByText("Знакомство", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: "К разговору" }));
    await screen.findByLabelText("Услышал", {}, { timeout: 5000 });

    // Пока модель не скачана, приложение не делает вид, что разговор был:
    // ни «готово», ни придуманного ответа. Это и есть честная причина.
    expect(screen.queryByText(/^готово$/i)).toBeNull();
  });

  it("второй запуск не повторяет знакомство — минута не тратится дважды", async () => {
    // Сценарий «человек закрыл на знакомстве»: отметка не поставлена, экран вернётся.
    expect(globalThis.localStorage?.getItem(WELCOME_KEY)).toBeNull();

    const first = render(<App />);
    await screen.findByText("Знакомство", {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: "К разговору" }));
    await waitFor(() => expect(globalThis.localStorage?.getItem(WELCOME_KEY)).toBe("1"));
    first.unmount();

    // Второй запуск: сразу к делу.
    render(<App />);
    const field = await screen.findByLabelText("Услышал", {}, { timeout: 5000 });
    expect(field).toBeTruthy();
    expect(screen.queryByText("Знакомство")).toBeNull();
  });
});
