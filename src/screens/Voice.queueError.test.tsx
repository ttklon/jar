// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Voice } from "./Voice";
import { KEY } from "../lib/queueStore";

/**
 * Ошибка одного дела не ломает следующее (шаг 149 плана).
 *
 * Что именно проверяется и почему это не формальность. В очереди дела идут подряд,
 * и дело «б» стартует только тогда, когда очередь увидит: «а» больше не в работе.
 * Если исключение вылетает между «начал» и «закончил», дело «а» остаётся в
 * состоянии «идёт» навсегда — и очередь встаёт целиком, хотя виновато одно дело.
 * Человек видит «идёт» и ничего больше; следующее дело не начнётся никогда.
 *
 * Проверка такая: первое дело падает не ответом ядра, а исключением, и после
 * этого второе дело обязано быть запущено.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const mocks = vi.hoisted(() => ({
  drafts: [] as string[],
  runs: [] as string[],
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
    // План собирается для любого дела: без плана очередь даже не начнёт.
    draftPlan: async (goal: string) => {
      mocks.drafts.push(String(goal));
      // Форма ровно та, что у настоящего `PlanCheck`: если бы здесь не хватало
      // полей, `unattended` увидел бы «вопрос» там, где его нет, и дело честно
      // ушло бы в «нужно ваше слово» — то есть тест проверял бы мок, а не очередь.
      return {
        plan: { goal, steps: [] },
        problems: [],
        gates: [],
        questions: [],
      };
    },
    planFor: async () => [],
    machineState: async () => ({
      budget: { may_start: true, parallel: 1, mode: "away" },
    }),
    runPlan: (plan: string) => {
      let goal = "";
      try {
        goal = JSON.parse(plan).goal ?? "";
      } catch {
        goal = plan;
      }
      mocks.runs.push(goal);
      // Первое дело падает ИСКЛЮЧЕНИЕМ — так выглядит сбой внутри запуска.
      if (mocks.runs.length === 1) {
        return Promise.reject(new Error("ядро упало на середине"));
      }
      return Promise.resolve({ stopped: null, steps: [{ status: "ok" }] });
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
  };
});

beforeEach(() => {
  localStorage.clear();
  mocks.drafts.length = 0;
  mocks.runs.length = 0;
});

afterEach(cleanup);

/** Положить два дела сразу в очередь: так человек и делает — «сделай это и это». */
function seed() {
  localStorage.setItem(
    KEY,
    JSON.stringify([
      { id: "a", goal: "почисти корзину", state: "waiting", note: "" },
      { id: "b", goal: "проверь обновления", state: "waiting", note: "" },
    ]),
  );
}

describe("ошибка одного дела не ломает следующее", () => {
  it("после падения первого дела очередь берётся за второе", { timeout: 30000 }, async () => {
    seed();
    render(<Voice onOpen={() => {}} />);
    await screen.findByText(/почисти корзину/);
    // Кнопки очереди появляются, когда человек что-то сказал: «В очередь» без слов
    // означала бы «поставь в очередь пустоту».
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "и это тоже" } });

    fireEvent.click(screen.getByRole("button", { name: "Работать без меня" }));

    // Второе дело должно быть запущено — именно это и есть «не ломает следующее».
    // План собирается лениво (по три дела за круг), поэтому ждём с запасом —
    // проверяется не скорость, а то, что очередь не встала навсегда.
    await waitFor(() => expect(mocks.runs.length).toBeGreaterThanOrEqual(2), {
      timeout: 20000,
    });
    expect(mocks.runs[1]).toContain("проверь обновления");
  });

  it("упавшее дело названо, а не осталось «идёт»", { timeout: 30000 }, async () => {
    seed();
    render(<Voice onOpen={() => {}} />);
    await screen.findByText(/почисти корзину/);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "и это тоже" } });

    fireEvent.click(screen.getByRole("button", { name: "Работать без меня" }));

    // Причина видна человеку: «идёт» навсегда — это молчание, а не ответ.
    await waitFor(
      () => expect(screen.getByText(/запуск прервался: ядро упало на середине/)).toBeTruthy(),
      { timeout: 20000 },
    );
  });
});
