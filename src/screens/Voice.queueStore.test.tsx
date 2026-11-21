// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Voice } from "./Voice";
import { KEY } from "../lib/queueStore";
import type { QueueItem } from "../lib/queue";

/**
 * Очередь дел переживает перезапуск окна (шаг 145 плана).
 *
 * Проверяется поведение, а не вызов функции: человек закрыл окно, вернулся — и
 * дела на месте. Дело, которое в момент закрытия шло, возвращается в ожидание с
 * честной пометкой: процесса уже нет.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

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
    draftPlan: async () => null,
    facts: async () => [],
    speechStatus: async () => null,
    machineState: async () => null,
    readinessStatus: async () => null,
    requestLearning: async () => null,
    cancelTool: async () => undefined,
    setVoiceTrayStatus: async () => undefined,
    think: async () => null,
    readScreen: async () => null,
    foregroundWindow: async () => null,
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

const stored = (items: QueueItem[]) => localStorage.setItem(KEY, JSON.stringify(items));

describe("очередь дел на диске", () => {
  it("дела, сохранённые до запуска, видны после открытия окна", async () => {
    stored([
      { id: "a", goal: "почисти корзину", state: "waiting", note: "" },
      { id: "b", goal: "проверь обновления", state: "waiting", note: "" },
    ]);

    render(<Voice onOpen={() => {}} />);

    // Дела на месте — человек не потерял порученное.
    expect(await screen.findByText(/почисти корзину/)).toBeTruthy();
    expect(screen.getByText(/проверь обновления/)).toBeTruthy();
  });

  it("дело, которое шло при закрытии, возвращается в ожидание, а не врёт про «идёт»", async () => {
    stored([{ id: "a", goal: "разбери загрузки", state: "running", note: "" }]);

    render(<Voice onOpen={() => {}} />);

    const goal = await screen.findByText(/разбери загрузки/);
    expect(goal).toBeTruthy();
    // Процесса уже нет: пометка говорит правду.
    await waitFor(() => expect(screen.getByText(/прервано перезапуском/)).toBeTruthy());
  });

  it("битый файл не мешает открыть экран", async () => {
    localStorage.setItem(KEY, "{это не json");

    render(<Voice onOpen={() => {}} />);
    // Экран жив: поле ввода на месте, а не белый лист.
    expect(await screen.findByLabelText("Услышал")).toBeTruthy();
  });

  it("добавленное дело сохраняется без ожидания закрытия окна", async () => {
    render(<Voice onOpen={() => {}} />);
    await screen.findByLabelText("Услышал");

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "почисти корзину" },
    });
    fireEvent.click(screen.getByRole("button", { name: "В очередь" }));

    // Запись идёт с паузой, но человеку ждать закрытия окна не нужно.
    await waitFor(
      () => {
        const raw = localStorage.getItem(KEY);
        expect(raw).toBeTruthy();
        expect(raw).toContain("почисти корзину");
      },
      { timeout: 2000 },
    );
  });
});

describe("продолжение прерванного дела", () => {
  it("дело, прерванное на шаге 3, при возврате обещает продолжить с шага 3", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        {
          id: "a",
          goal: "разложи документы",
          state: "running",
          note: "",
          resumeAt: 3,
        },
      ]),
    );

    render(<Voice onOpen={() => {}} />);

    // Видно ДО запуска точное место продолжения — а не «продолжу заново».
    expect(await screen.findByText(/первые 2 шага уже сделаны: продолжу с шага 3/)).toBeTruthy();
  });
});
