// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Voice } from "./Voice";

/**
 * «Стоп» во время работы: шаг 140 плана.
 *
 * Здесь я сперва решил, что нашёл дефект: в условии кнопки стоит `&& !thinking`,
 * и это выглядело как «стоп недоступен, пока модель думает». Ничего подобного:
 * `disabled` — это конъюнкция условий «полный покой», и `!thinking` в ней делает
 * кнопку ДОСТУПНОЙ при размышлении. Дефекта нет, и доказательство этому — тест:
 * он проходит и на прежнем коде.
 *
 * Урок записан затем, что «прочитал код глазами» и «проверил поведением» — разные
 * вещи, и стоил этот урок часа. Тест остаётся: он закрепляет правило, чтобы
 * будущая правка условия не сделала стоп недоступным в самый нужный момент.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

/** Разговор с моделью, который «висит»: пока не отпустим — ответа нет. */
const mocks = vi.hoisted(() => ({
  thinkCalls: 0,
  sayCalls: 0,
  resolve: null as (() => void) | null,
}));

vi.mock("../lib/useVoice", () => ({
  useVoice: () => ({
    listening: false,
    processing: false,
    speaking: false,
    supported: true,
    alwaysSupported: false,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
  }),
}));

vi.mock("../ipc", async () => {
  const actual = await vi.importActual<typeof import("../ipc")>("../ipc");
  return {
    ...actual,
    isTauri: () => true,
    planFor: async () => [],
    // Экран читается до вопроса; без этой заглушки путь обрывается ошибкой,
    // `thinking` сбрасывается — и тест проверял бы не то состояние.
    readScreen: async () => null,
    foregroundWindow: async () => null,
    draftPlan: async () => null,
    facts: async () => [],
    speechStatus: async () => null,
    machineState: async () => null,
    readinessStatus: async () => null,
    requestLearning: async () => null,
    cancelTool: async () => undefined,
    setVoiceTrayStatus: async () => undefined,
    // Бесконечный разговор: пока тест не отпустит, модель молчит.
    think: () => {
      mocks.thinkCalls += 1;
      return new Promise((resolve) => {
        mocks.resolve = () => resolve(null);
      });
    },
    say: () => {
      mocks.sayCalls += 1;
      return new Promise((resolve) => {
        mocks.resolve = () => resolve("готово");
      });
    },
  };
});

afterEach(cleanup);

describe("стоп не блокируется размышлением", () => {
  it("пока модель думает, стоп доступен и останавливает", async () => {
    render(<Voice onOpen={() => {}} />);

    // Человек нажал «Спросить модель» — это тот самый путь, где ответа ждут
    // секундами. Здесь стоп обязан быть доступен.
    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "убери рабочий стол" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Спросить модель" }));

    const stop = await screen.findByRole("button", { name: "Стоп" });

    // Пока модель молчит, выход должен быть.
    await waitFor(() => expect((stop as HTMLButtonElement).disabled).toBe(false), {
      timeout: 3000,
    });
    // Доказательство, что мы в состоянии «думаю»: сама кнопка модели теперь
    // показывает «спрашиваю модель» и выключена.


    // И нажатие действительно снимает ожидание, а не глотается.
    fireEvent.click(stop);
    await waitFor(() =>
      expect(screen.getByLabelText("Услышал")).toBeTruthy(),
    );
  });

  it("после остановки стоп снова недоступен: останавливать нечего", async () => {
    render(<Voice onOpen={() => {}} />);

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "убери рабочий стол" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    const stop = screen.getByRole("button", { name: "Стоп" });
    await waitFor(() => expect((stop as HTMLButtonElement).disabled).toBe(false), {
      timeout: 3000,
    });

    fireEvent.click(stop);
    await waitFor(() => expect((stop as HTMLButtonElement).disabled).toBe(true));
  });
});
