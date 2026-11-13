// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  draftPlan,
  machineState,
  planFor,
  requestLearning,
  runPlan,
  think,
  uiDump,
  foregroundWindow,
} from "../ipc";
import { Voice } from "./Voice";

/**
 * Очередь на экране: несколько дел подряд, пока человек не скажет «стоп».
 *
 * Проверяется главное: очередь идёт сама только когда человек отошёл, не исполняет без
 * него того, что требует его слова, и умеет остановиться.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  planFor: vi.fn().mockResolvedValue([]),
  draftPlan: vi.fn().mockResolvedValue(null),
  requestLearning: vi.fn().mockResolvedValue(null),
  facts: vi.fn().mockResolvedValue([]),
  think: vi.fn().mockResolvedValue(null),
  uiDump: vi.fn().mockRejectedValue(new Error("нет UI Automation")),
  machineState: vi.fn().mockResolvedValue({
    sample: { cpu_percent: 10, ram_free_mb: 9_000, ram_total_mb: 16_384, idle_seconds: 900 },
    budget: { parallel: 3, mode: "away" as const, reason: "человек отошёл", may_start: true },
    available: true,
    note: "машина измеряется честно",
  }),
  draftHand: vi.fn(),
  trialHand: vi.fn(),
  speak: vi.fn(),
  modelPrompt: vi.fn().mockResolvedValue(""),
  rememberFact: vi.fn().mockResolvedValue(undefined),
  runPlan: vi.fn(),
  speechStatus: vi.fn().mockResolvedValue({
    found: false,
    program: null,
    model: null,
    search_dir: "C:\\Program Files\\jar",
    models_dir: "C:\\Program Files\\jar\\models",
  }),
  foregroundWindow: vi.fn().mockResolvedValue({
    title: "Видео — браузер",
    process: "chrome.exe",
    pid: 4321,
  }),
  isolationStatus: vi.fn().mockResolvedValue({ available: true, summary: "", note: "" }),
  transcribeLocal: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const away = {
  sample: { cpu_percent: 10, ram_free_mb: 9_000, ram_total_mb: 16_384, idle_seconds: 900 },
  budget: { parallel: 3, mode: "away" as const, reason: "человек отошёл", may_start: true },
  available: true,
  note: "машина измеряется честно",
};

const safePlan = {
  plan: { goal: "убавить громкость", steps: [{ registry: "звук|убавить|громкость", params: {} }] },
  problems: [],
  gates: [],
  questions: [],
};

const needsWord = {
  ...safePlan,
  gates: [
    {
      position: 1,
      registry: "файлы|удалить|папка",
      decision: "confirm" as const,
      risk: "destructive",
      wants_approval: true,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.mocked(draftPlan).mockReset().mockResolvedValue(null);
  vi.mocked(runPlan).mockReset();
  vi.mocked(machineState).mockReset().mockResolvedValue(away as never);
  vi.mocked(planFor).mockReset().mockResolvedValue([]);
  vi.mocked(think).mockReset().mockResolvedValue(null as never);
  vi.mocked(requestLearning).mockReset().mockResolvedValue(null);
  vi.mocked(uiDump).mockReset().mockRejectedValue(new Error("нет UI Automation"));
  vi.mocked(machineState).mockReset().mockResolvedValue(away as never);
  vi.mocked(foregroundWindow).mockReset().mockResolvedValue({
    title: "Видео — браузер",
    process: "chrome.exe",
    pid: 4321,
  } as never);
});

/** Очередь набирается тем же полем, которым человек говорит. */
function addToQueue(phrase: string) {
  fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: phrase } });
  fireEvent.click(screen.getByText("В очередь"));
}

describe("очередь дел на экране", () => {
  it("человек отошёл — очередь идёт сама: простое исполняет, на требующем слова встаёт", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce(safePlan as never).mockResolvedValueOnce(needsWord as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "убавить громкость",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: null,
      run_id: 1,
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    addToQueue("удалить папку");

    fireEvent.click(screen.getByText("Работать без меня"));

    // Первое дело исполнено без человека — это и есть очередь.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/готово · убавить громкость/)).toBeTruthy());

    // Второе требует подтверждения: не исполнено, а помечено «нужно ваше слово».
    expect(screen.getByText(/нужно ваше слово · удалить папку/)).toBeTruthy();
    expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1);
  });

  it("человек вернулся — очередь новые дела не начинает", async () => {
    vi.mocked(machineState).mockResolvedValue({
      ...away,
      budget: { parallel: 3, mode: "near" as const, reason: "человек за машиной", may_start: true },
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(screen.getByText(/чтобы не мешать/)).toBeTruthy());
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("«стоп» останавливает то, что ещё не начиналось", async () => {
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("первое дело");
    addToQueue("второе дело");
    fireEvent.click(screen.getByText("Стоп"));

    await waitFor(() => expect(screen.getAllByText(/остановлено · /).length).toBe(2));
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });
});
