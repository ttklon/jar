// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { screen as firstScreen, checks, examples } from "../lib/firstScreen";

/**
 * Шаг 86: пустой экран — три примера, а не «догадайся сам».
 *
 * Правило `firstScreen` было написано (шаг 379) и не подключено: человек,
 * сказавший фразу, которой программа не знает, видел «такого я пока не умею» —
 * и всё. Ни что она умеет, ни с чего начать, ни в каком порядке пробовать.
 *
 * Проверяется то, что видит человек: три примера, разных жанров, первым —
 * самое безопасное, у каждого сказано, что будет, и нажатие **подставляет**
 * фразу в поле, а не отправляет её.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const ipc = vi.hoisted(() => ({
  planFor: vi.fn(async () => []),
  draftPlan: vi.fn(async () => null),
  facts: vi.fn(async () => []),
}));

vi.mock("../ipc", async () => {
  const actual = await vi.importActual<typeof import("../ipc")>("../ipc");
  return {
    ...actual,
    isTauri: () => false,
    memoryRuns: async () => [],
    engineStatus: async () => ({ found: true, program: null, search_dir: "", running: false, port: null, pid: null }),
    registrySnapshot: async () => ({
      actions: [],
      stats: { actions: 0, domains: 0, verbs: 0, byRisk: {}, byTier: {}, byStatus: {} },
    }),
    listTools: async () => [],
    readinessStatus: vi.fn().mockRejectedValue(new Error("нет")),
    planFor: ipc.planFor,
    draftPlan: ipc.draftPlan,
    facts: ipc.facts,
    think: vi.fn().mockResolvedValue(null),
    requestLearning: vi.fn().mockResolvedValue(null),
    smokeCheck: vi.fn(),
    cancelTool: vi.fn(),
    declarePresence: vi.fn(),
    machineState: vi.fn().mockResolvedValue({
      sample: null,
      budget: { parallel: 1, mode: "near", reason: "рядом", may_start: true },
      available: false,
      note: "",
      declared: null,
    }),
    draftHand: vi.fn(),
    trialHand: vi.fn(),
    speak: vi.fn(),
    modelPrompt: vi.fn().mockResolvedValue(""),
    rememberFact: vi.fn(),
    runPlan: vi.fn(),
    planCheckpoint: vi.fn().mockResolvedValue(null),
    setVoiceTrayStatus: vi.fn().mockResolvedValue(undefined),
    paused: vi.fn().mockResolvedValue(false),
    speechStatus: vi.fn().mockResolvedValue(null),
    foregroundWindow: vi.fn().mockResolvedValue(null),
    isolationStatus: vi.fn().mockResolvedValue({ available: true, summary: "", note: "" }),
    transcribeLocal: vi.fn(),
    uiDump: vi.fn(),
    uiPress: vi.fn(),
    uiType: vi.fn(),
    undoReport: vi.fn(),
    undoApply: vi.fn(),
  };
});

import { Voice } from "./Voice";

beforeAll(() => {
  globalThis.localStorage?.setItem?.("zshelper.mic.explained", "1");
});

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear?.();
  globalThis.localStorage?.setItem?.("zshelper.mic.explained", "1");
  ipc.planFor.mockReset().mockResolvedValue([]);
});

describe("пустой экран голоса (шаг 86)", () => {
  it("правило даёт три примера разных жанров, первым — безопасный", () => {
    // Само правило проверяется здесь же: экран берёт примеры из него, и если
    // правило изменится, экранный тест ниже покраснеет.
    const got = examples();
    expect(got).toHaveLength(3);
    expect(new Set(got.map((example) => example.kind)).size).toBe(3);
    expect(got[0]?.kind).toBe("safe");
    expect(checks(firstScreen())).toEqual([]);
  });

  it("фраза, которой программа не знает, не оставляет человека в пустоте", async () => {
    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай что-нибудь" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    // «Такого я пока не умею» остаётся — это честный ответ.
    expect(await screen.findByText(/такого я пока не умею/, {}, { timeout: 4000 })).toBeTruthy();
    // А рядом — три примера: что умеет и с чего начать.
    const got = examples();
    for (const example of got) {
      expect(await screen.findByText(`«${example.said}»`, {}, { timeout: 4000 })).toBeTruthy();
      // И сказано, что будет: нажимать вслепую страшно.
      expect(screen.getByText(`— ${example.what}`)).toBeTruthy();
    }
  });

  it("пример подставляет фразу, но не отправляет за человека", async () => {
    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай что-нибудь" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await screen.findByText(/такого я пока не умею/, {}, { timeout: 4000 });

    const first = examples()[0]!;
    fireEvent.click(screen.getByRole("button", { name: `подставить: ${first.said}` }));

    // Фраза — в поле, и ничего не запущено: последний взгляд остаётся человеку.
    const field = screen.getByLabelText("Услышал") as HTMLInputElement;
    expect(field.value).toBe(first.said);
    // Подстановка ничего не запустила: разбор был только по исходной фразе.
    expect(ipc.planFor.mock.calls.every((call: unknown[]) => call[0] === "сделай что-нибудь")).toBe(true);
    expect(ipc.draftPlan).not.toHaveBeenCalledWith(first.said, expect.anything());
    // Черновик сохранён: подставленное переживёт переключение экрана.
    expect(globalThis.localStorage?.getItem("zshelper.draft.phrase")).toBe(first.said);
  });
});
