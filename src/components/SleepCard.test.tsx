// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SleepCard } from "./SleepCard";

/**
 * «Сон и выключение» (шаги 457/458).
 *
 * Что проверяем: при уходе в сон названо, что отпускается и что при пробуждении
 * спросят; незавершённое дело показано с номером шага; и «выключению не мешаю» —
 * даже когда сохранить не удалось.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("../ipc", () => ({
  isTauri: () => false,
  unfinished: async () => ({ deed: "уборка загрузок", step: 3, said: "убери загрузки", draft: "" }),
  unfinishedForget: async () => {},
  unfinishedSet: async () => {},
  unfinishedSave: async () => ({ allow: true, items: [], said: "сохранено" }),
}));

afterEach(cleanup);

describe("карточка «Сон и выключение»", () => {
  it("при уходе в сон сказано, что отпущено и что спросят", () => {
    render(<SleepCard />);
    expect(screen.getByText(/запись остановлена; движок отпущен/)).toBeTruthy();
    expect(screen.getByText(/При пробуждении спрошу, продолжать ли/)).toBeTruthy();
  });

  it("микрофон в чехле не пишет шорохи", () => {
    render(<SleepCard />);
    expect(screen.getByText(/микрофон: не записывать в чехле/)).toBeTruthy();
    expect(screen.getByText(/движок: не держать гигабайты всю ночь/)).toBeTruthy();
  });

  it("незавершённое дело видно с номером шага — и не продолжается само", async () => {
    render(<SleepCard />);
    expect(await screen.findByText(/нашлось незавершённое: дело «уборка загрузок» на шаге 3/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "продолжить с того же шага" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "не продолжать" })).toBeTruthy();
  });

  it("если сохранить не удалось, выключению всё равно не мешаем", () => {
    render(<SleepCard />);
    expect(
      screen.getByText(/сохранить не успели, но выключению не мешаю: работа компьютера важнее нашего журнала/),
    ).toBeTruthy();
  });
});
