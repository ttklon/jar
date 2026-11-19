// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Voice } from "./Voice";
import type { VoiceOptions } from "../lib/useVoice";

/**
 * Ответ на уточняющий вопрос голосом.
 *
 * Человек, который говорит, не смотрит в экран: если приложение спрашивает «путь?», ответ
 * должен приниматься словами. Здесь проверяется главное — услышанное в этот момент идёт
 * в поле, а не в новый поиск, и приложение говорит вслух, что услышало.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// `vi.mock` поднимается наверх файла, поэтому всё общее живёт в `vi.hoisted`.
const mocks = vi.hoisted(() => ({
  speak: vi.fn((_phrase: string) => true),
  start: vi.fn(),
  stop: vi.fn(),
  options: null as VoiceOptions | null,
}));

vi.mock("../lib/useVoice", () => ({
  useVoice: (incoming: VoiceOptions) => {
    mocks.options = incoming;
    return {
      listening: false,
      speaking: false,
      supported: true,
      alwaysSupported: false,
      start: mocks.start,
      stop: mocks.stop,
    };
  },
}));

vi.mock("../lib/voice", async () => {
  const actual = await vi.importActual<typeof import("../lib/voice")>("../lib/voice");
  return { ...actual, speak: mocks.speak };
});

beforeEach(() => {
  mocks.options = null;
  mocks.start.mockClear();
  mocks.stop.mockClear();
  mocks.speak.mockClear();
});

afterEach(cleanup);

describe("ответ голосом", () => {
  it("услышанное заполняет поле вопроса, а не превращается в новую задачу", async () => {
    render(<Voice onOpen={() => {}} />);

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "создай папку" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    const path = await screen.findByLabelText("Путь");

    // Зажали «сказать ответ» — микрофон пошёл.
    fireEvent.pointerDown(screen.getByRole("button", { name: /Сказать ответ: Путь/ }));
    expect(mocks.start).toHaveBeenCalled();

    // Пришёл разбор: он должен попасть в поле.
    mocks.options?.onText("C:\\tmp\\jar");
    await waitFor(() => expect((path as HTMLInputElement).value).toBe("C:\\tmp\\jar"));

    // И вслух сказано, что услышано.
    await waitFor(() => expect(mocks.speak).toHaveBeenCalled());
    expect(mocks.speak.mock.calls.some(([phrase]) => String(phrase).includes("C:\\tmp\\jar"))).toBe(true);

    // Поле «Услышал» осталось прежним: это был ответ, а не новая задача.
    expect((screen.getByLabelText("Услышал") as HTMLInputElement).value).toBe("создай папку");
  });

  it("когда ответов нет, приложение не притворяется, что услышало", async () => {
    render(<Voice onOpen={() => {}} />);

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "создай папку" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    const path = await screen.findByLabelText("Путь");
    fireEvent.pointerDown(screen.getByRole("button", { name: /Сказать ответ: Путь/ }));

    // Разбор ничего не дал — так и говорим, а поле остаётся пустым.
    mocks.options?.onError("не разобрал — попробуйте ещё раз");
    await waitFor(() => expect(screen.getByText(/не разобрал/)).toBeTruthy());
    expect((path as HTMLInputElement).value).toBe("");
  });
});
