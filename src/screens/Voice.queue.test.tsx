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

  it("два дела без окон идут одновременно, а не по очереди", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);

    // Запуск, который висит, пока его не отпустят: так видно, ждёт ли второе дело первого.
    const releases: Array<() => void> = [];
    vi.mocked(runPlan).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve({
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
            } as never),
          );
        }),
    );

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    addToQueue("проверить свободное место");
    fireEvent.click(screen.getByText("Работать без меня"));

    // Оба дела уже в работе: второй запуск не ждёт первого.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(/^делаю · /).length).toBe(2);

    releases.forEach((release) => release());
    await waitFor(() => expect(screen.getAllByText(/готово · /).length).toBe(2));
  });

  it("два дела в одно окно одновременно не идут: второе честно ждёт", async () => {
    const screenPlan = {
      plan: {
        goal: "нажать",
        steps: [{ registry: "apps-windows|нажать|кнопку", params: { name: "Войти" } }],
      },
      problems: [],
      gates: [],
      questions: [],
    };
    vi.mocked(draftPlan).mockResolvedValue(screenPlan as never);

    const releases: Array<() => void> = [];
    vi.mocked(runPlan).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve({ goal: "нажать", steps: [], stopped: null, run_id: 1 } as never),
          );
        }),
    );

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("нажать войти");
    addToQueue("нажать готово");
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1));
    // Второе не запущено: одновременно в окно нельзя.
    expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1);

    releases.forEach((release) => release());
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(2));
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

  it("цель не закрыта — очередь спрашивает модель, что дальше, и продолжает делами", async () => {
    const splitThought = {
      prompt: "…",
      answer: "…",
      proposal: {
        Split: {
          goal: "наведи порядок в загрузках",
          deeds: ["найди дубликаты в загрузках", "удали старые установщики"],
          why: "две разные работы",
        },
      },
      plan: null,
      learning: null,
      deeds: ["найди дубликаты в загрузках", "удали старые установщики"],
      problem: null,
    };

    const nextThought = {
      prompt: "…",
      answer: "…",
      proposal: {
        Next: {
          goal: "наведи порядок в загрузках",
          done: false,
          deeds: ["проверь, что осталось в загрузках"],
          why: "старые установщики ещё там",
        },
      },
      plan: null,
      learning: null,
      deeds: ["проверь, что осталось в загрузках"],
      problem: null,
    };

    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "найди дубликаты в загрузках",
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

    // Первый ответ — разложение, второй — продолжение, дальше модель молчит:
    // очередь не должна придумывать дела за неё.
    vi.mocked(think)
      .mockResolvedValue(null as never)
      .mockResolvedValueOnce(splitThought as never)
      .mockResolvedValueOnce(nextThought as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());

    fireEvent.click(screen.getByText("Поставить все в очередь"));
    fireEvent.click(screen.getByText("Работать без меня"));

    // Два дела из разложения и одно из продолжения — очередь не остановилась на первом.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(3));

    expect(vi.mocked(think).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(think).mock.calls[1]?.[0]).toContain("Цель: «наведи порядок в загрузках»");

    // Счёт по цели и потолок в час видны на экране, а не подразумеваются.
    await waitFor(() =>
      expect(screen.getByText(/цель «наведи порядок в загрузках»: сделано 3/)).toBeTruthy(),
    );
    expect(screen.getByText(/за этот час сам начал 3 из 12/)).toBeTruthy();

    // Модель промолчала про продолжение — так и сказано, а не «всё сделано».
    await waitFor(() =>
      expect(screen.getByText(/модель не сказала, что делать дальше/)).toBeTruthy(),
    );
  });

  it("дело по цели не сделалось — очередь не заметает это новыми делами", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "найди дубликаты в загрузках",
      steps: [],
      stopped: "шаг 1: нет доступа",
      run_id: 1,
    } as never);

    vi.mocked(think).mockResolvedValue({
      prompt: "…",
      answer: "…",
      proposal: {
        Split: {
          goal: "наведи порядок в загрузках",
          deeds: ["найди дубликаты в загрузках", "удали старые установщики"],
          why: "две разные работы",
        },
      },
      plan: null,
      learning: null,
      deeds: ["найди дубликаты в загрузках", "удали старые установщики"],
      problem: null,
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());

    fireEvent.click(screen.getByText("Поставить все в очередь"));
    fireEvent.click(screen.getByText("Работать без меня"));

    // Оба дела не сделались — очередь говорит об этом и новых дел не выдумывает.
    await waitFor(() => expect(screen.getByText(/не сделалось/)).toBeTruthy());
    expect(vi.mocked(think)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(2);
  });
});
