// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../app";
import { WELCOME_KEY } from "../lib/firstRun";
import { KEY } from "../lib/queueStore";

/**
 * Работа переживает смену экрана: шаг 151 плана.
 *
 * Человек ставит очередь и уходит смотреть «Руки» или «Историю». Если экран
 * «Голос» при этом размонтируется, очередь умрёт вместе с ним: `queueRunningRef`
 * и сам список живут в компоненте. Человек вернётся — и увидит «ничего не
 * происходит», хотя ничего не останавливал.
 *
 * Поэтому проверяется не «экран скрыт», а **работа продолжается**: пока открыт
 * другой экран, дело всё равно доводится до конца.
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

const mocks = vi.hoisted(() => ({ runs: 0 }));

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
    draftPlan: async (goal: string) => ({
      plan: { goal, steps: [] },
      problems: [],
      gates: [],
      questions: [],
    }),
    planFor: async () => [],
    machineState: async () => ({ budget: { may_start: true, parallel: 1, mode: "away" } }),
    // Запуск нарочно долгий: человек успевает уйти с экрана ДО того, как очередь
    // начнёт следующее дело. Если экран размонтируется, очередь умрёт вместе с ним
    // и второе дело не начнётся никогда.
    runPlan: async () => {
      mocks.runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { stopped: null, steps: [{ status: "ok" }] };
    },
    facts: async () => [],
    speechStatus: async () => null,
    readinessStatus: async () => null,
    requestLearning: async () => null,
    cancelTool: async () => undefined,
    setVoiceTrayStatus: async () => undefined,
    think: async () => null,
    say: async () => "готово",
    readScreen: async () => null,
    foregroundWindow: async () => null,
    uiDump: async () => {
      throw new Error("нет UI Automation");
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(WELCOME_KEY, "1");
  mocks.runs = 0;
});

afterEach(cleanup);

describe("работа переживает смену экрана", () => {
  it("очередь идёт, пока человек смотрит другой экран", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: "a", goal: "почисти корзину", state: "waiting", note: "" },
        { id: "b", goal: "проверь обновления", state: "waiting", note: "" },
      ]),
    );

    render(<App />);
    await screen.findByText(/почисти корзину/);

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "и это" } });
    fireEvent.click(screen.getByRole("button", { name: "Работать без меня" }));

    // Ждём, пока первое дело реально начнётся, — иначе проверка была бы про
    // момент до запуска, а не про смену экрана.
    await waitFor(() => expect(mocks.runs).toBeGreaterThanOrEqual(1), { timeout: 15000 });

    // Уходим на другой экран — ровно то, что делает человек. Ищем в меню: на самом
    // голосовом экране есть ссылки «Руки», «История» и «Что умею», и по имени они
    // совпадают с пунктами меню.
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Руки" }));

    // И работа продолжается: оба дела доходят до запуска.
    await waitFor(() => expect(mocks.runs).toBeGreaterThanOrEqual(2), { timeout: 20000 });
    // Голосовой экран скрыт, но ЖИВ: поле «Услышал» осталось в документе.
    // Если бы экран размонтировали, поле исчезло бы вместе с очередью — и очередь
    // умерла бы на полпути, а человек увидел бы «ничего не происходит».
    expect(screen.queryByLabelText("Услышал")).toBeTruthy();

    // И очередь на диске: смена экрана — не повод терять список. Иначе после
    // перезапуска человек увидел бы пустое место вместо своих дел.
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Array<{ goal: string }>;
    expect(saved.map((row) => row.goal)).toContain("почисти корзину");
  });
});
