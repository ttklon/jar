// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clock, own, over, report, slow, timed } from "../lib/latencyProof";
import { LONG_MS } from "../lib/longAsk";
import { Voice } from "./Voice";

/**
 * Шаг 130: бюджет задержки с подставным медленным ядром.
 *
 * Настоящее ядро здесь не нужно: важно поведение **при** медленном ядре, а не скорость
 * этой машины. Часы идут по шагам, и тест не спит ни секунды сверх порога вопроса
 * «ждать?» (шаг 129) — он и есть проверяемое поведение.
 */

vi.mock("../ipc", async () => {
  // Все настоящие функции адаптера остаются: подменяются только те, что нужны шагу.
  const actual = await vi.importActual<typeof import("../ipc")>("../ipc");
  return {
    ...actual,
    readinessStatus: vi.fn().mockRejectedValue(new Error("статус недоступен в этом тесте")),
  isTauri: () => true,
  planFor: vi.fn().mockResolvedValue([]),
  draftPlan: vi.fn().mockResolvedValue(null),
  fillPlan: vi.fn(),
  requestLearning: vi.fn().mockResolvedValue(null),
  facts: vi.fn().mockResolvedValue([]),
    smokeCheck: vi.fn(),
  cancelTool: vi.fn().mockResolvedValue(undefined),
  uiDump: vi.fn().mockRejectedValue(new Error("в браузере нет UI Automation")),
  uiPress: vi.fn().mockRejectedValue(new Error("в браузере окон нет")),
  uiType: vi.fn().mockRejectedValue(new Error("в браузере окон нет")),
  declarePresence: vi.fn(),
  machineState: vi.fn().mockResolvedValue({
    sample: null,
    budget: { parallel: 1, mode: "near", reason: "в браузере машину не измерить", may_start: true },
    available: false,
    note: "машина измеряется в приложении",
    declared: null,
    weak: false,
  }),
  draftHand: vi.fn(),
  trialHand: vi.fn(),
  speak: vi.fn(),
  modelPrompt: vi.fn().mockResolvedValue(""),
  rememberFact: vi.fn().mockResolvedValue(undefined),
  runPlan: vi.fn(),
  planCheckpoint: vi.fn().mockResolvedValue(null),
  speechStatus: vi.fn().mockResolvedValue(null),
  setVoiceTrayStatus: vi.fn().mockResolvedValue(undefined),
  // Шаг 82: экран спрашивает паузу, чтобы трей не говорил «жду фразу» на паузе.
  paused: vi.fn().mockResolvedValue(false),
  foregroundWindow: vi.fn().mockResolvedValue(null),
  registrySnapshot: vi.fn().mockResolvedValue({
    actions: [],
    stats: { actions: 835, domains: 12, verbs: 200, byRisk: {}, byTier: {}, byStatus: {} },
  }),
    listTools: vi.fn().mockResolvedValue(Array.from({ length: 56 }, () => ({}))),
    // Медленное ядро: ответа нет вовсе — это худший случай для бюджета.
    think: vi.fn().mockReturnValue(new Promise(() => {})),
  };
});

vi.mock("../lib/recorder", async () => {
  const actual = await vi.importActual<typeof import("../lib/recorder")>("../lib/recorder");
  return {
    ...actual,
    startRecording: vi.fn().mockResolvedValue({
      found: true,
      program: "C:\\jar\\sidecars\\whisper-server.exe",
      model: "C:\\jar\\models\\ggml-small.bin",
      search_dir: "C:\\jar\\sidecars",
      models_dir: "C:\\jar\\models",
    }),
    stopRecording: vi.fn(),
  };
});

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("медленное ядро не оставляет человека в молчании", () => {
  it("при ядре, которое не отвечает, вопрос «ждать?» приходит по порогу", async () => {
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    // Это и есть регрессия скорости, которую ловит тест: если порог перестанет
    // срабатывать, человек снова будет ждать молча.
    await waitFor(
      () => expect(screen.getByText(/«поиск ответа» — это долго \(\d+ с\)\. Ждать\?/)).toBeTruthy(),
      { timeout: LONG_MS + 3000 },
    );
  }, 15_000);
});

describe("бюджет сравнивается с числом, а не с ощущением", () => {
  it("сценарий «первый звук» держится в 1500 мс и не держится в 2400", () => {
    // Часы подставные: тест не спит и не зависит от загрузки машины.
    const clk = clock();
    const ok = slow(clk, 400);
    const bad = slow(clk, 2400);
    expect(over(ok.expect, 1500).over).toBe(false);
    expect(over(bad.expect, 1500).over).toBe(true);
  });

  it("быстрое ядро не оправдывает медленный код", async () => {
    const clk = clock();
    const kernel = slow(clk, 100);
    const took = await timed(clk, kernel.run);
    // 2300 мс своих — вот что ловит регрессию, даже когда ядро мгновенное.
    expect(own(2400, took).ms).toBe(2300);
  });

  it("отчёт называет сценарий, который вылез за бюджет", () => {
    expect(
      report([
        { name: "первый звук", budget: 1500, ms: 2400 },
        { name: "план", budget: 4000, ms: 800 },
      ]),
    ).toContain("первый звук");
  });
});
