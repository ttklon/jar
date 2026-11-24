// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { checkPlan, planFor, runPlan } from "../ipc";
import type { PlanItem } from "../ipc";
import { listen, speak } from "../lib/voice";
import type { VoiceListeners } from "../lib/voice";
import { Ask } from "./Ask";

/**
 * Голос — это вход, а не отдельный режим: услышанное идёт в тот же поиск, а итог
 * проговаривается вслух. Если слушать нечем — так и говорим.
 */

vi.mock("../ipc", () => ({
  registrySnapshot: async () => ({
      actions: [],
    stats: { actions: 0, domains: 0, verbs: 0, byRisk: {}, byTier: {}, byStatus: {} },
  }),
  listTools: async () => [],
  isTauri: () => true,
  planFor: vi.fn(),
  checkPlan: vi.fn(),
  savePlan: vi.fn(),
  runPlan: vi.fn(),
}));

vi.mock("../lib/voice", async () => {
  const actual = await vi.importActual<typeof import("../lib/voice")>("../lib/voice");
  return {
    ...actual,
    listen: vi.fn(),
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
  };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(planFor).mockReset();
  vi.mocked(listen).mockReset();
  vi.mocked(speak).mockReset();
});

function grantSystemSpeechConsent() {
  fireEvent.click(screen.getByRole("checkbox", { name: /Разрешаю системное распознавание речи/ }));
}

function capture(): VoiceListeners {
  const call = vi.mocked(listen).mock.calls[0];
  if (!call) throw new Error("микрофон не включали");
  const listeners = call[0];
  if (!listeners) throw new Error("слушатели не переданы");
  return listeners;
}

describe("голосовой вход", () => {
  it("поздний ответ старого поиска не затирает новый", async () => {
    let resolveOld!: (value: PlanItem[]) => void;
    let resolveNew!: (value: PlanItem[]) => void;
    vi.mocked(planFor)
      .mockReturnValueOnce(new Promise<PlanItem[]>((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise<PlanItem[]>((resolve) => { resolveNew = resolve; }));

    render(<Ask />);
    const textbox = screen.getByLabelText(/почистить диск от временных файлов/i);
    fireEvent.change(textbox, { target: { value: "старый запрос" } });
    fireEvent.submit(textbox.closest("form")!);
    fireEvent.change(textbox, { target: { value: "новый запрос" } });
    fireEvent.submit(textbox.closest("form")!);

    resolveNew([]);
    await waitFor(() => expect(screen.getByRole("button", { name: /найти/i }).hasAttribute("disabled")).toBe(false));
    resolveOld([]);
    await waitFor(() => expect(planFor).toHaveBeenCalledTimes(2));
    expect((textbox as HTMLInputElement).value).toBe("новый запрос");
  });

  it("не включает системный микрофон без согласия", () => {
    render(<Ask />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    expect(listen).not.toHaveBeenCalled();
    expect(screen.getByText(/Сначала отметьте согласие/)).toBeTruthy();
  });

  it("держим кнопку — слушаем, услышанное сразу идёт в поиск", async () => {
    const stop = vi.fn();
    vi.mocked(listen).mockReturnValue({ stop });
    vi.mocked(planFor).mockResolvedValue([]);

    render(<Ask />);
    grantSystemSpeechConsent();

    const mic = screen.getByRole("button", { name: "Держать и говорить" });
    fireEvent.pointerDown(mic);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Держать и говорить" }).textContent).toContain(
      "слушаю",
    );

    capture().onText("наведи порядок в загрузках");

    await waitFor(() => {
      expect(planFor).toHaveBeenCalledWith("наведи порядок в загрузках", 8);
    });
    expect(
      (screen.getByLabelText(/почистить диск от временных файлов/i) as HTMLInputElement).value,
    ).toBe("наведи порядок в загрузках");

    // Услышали — микрофон выключился сам, ждать отпускания не нужно.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Держать и говорить" }).textContent,
      ).toContain("Держать и говорить");
    });
    expect(stop).not.toHaveBeenCalled();
  });

  it("отпустили кнопку — перестали слушать", () => {
    const stop = vi.fn();
    vi.mocked(listen).mockReturnValue({ stop });

    render(<Ask />);
    grantSystemSpeechConsent();

    const mic = screen.getByRole("button", { name: "Держать и говорить" });
    fireEvent.pointerDown(mic);
    fireEvent.pointerUp(mic);

    expect(stop).toHaveBeenCalled();
  });

  it("Ctrl+Space держит микрофон с рабочего стола", async () => {
    vi.mocked(listen).mockReturnValue({ stop: vi.fn() });

    render(<Ask />);
    grantSystemSpeechConsent();

    fireEvent.keyDown(window, { code: "Space", ctrlKey: true });
    expect(listen).toHaveBeenCalledTimes(1);

    fireEvent.keyUp(window, { code: "Space", ctrlKey: true });
  });

  it("если слушать нечем, причина названа", async () => {
    vi.mocked(listen).mockImplementation((listeners) => {
      listeners.onError("в этом окружении распознавания речи нет — остаётся напечатать");
      return { stop: vi.fn() };
    });

    render(<Ask />);
    grantSystemSpeechConsent();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));

    await waitFor(() => {
      expect(screen.getByText(/распознавания речи нет/)).toBeTruthy();
    });
    // Микрофон не остался «включённым» после отказа.
    expect(
      screen.getByRole("button", { name: "Держать и говорить" }).textContent,
    ).toContain("Держать и говорить");
  });

  it("итог плана проговаривается вслух", async () => {
    vi.mocked(speak).mockReturnValue(true);
    vi.mocked(checkPlan).mockResolvedValue({
      plan: { goal: "диск", source: "human", steps: [{ registry: "files|проверить|размеры и место" }] },
      problems: [],
      questions: [],
      gates: [
        {
          position: 1,
          registry: "files|проверить|размеры и место",
          decision: "allow",
          risk: "read",
          wants_approval: false,
        },
      ],
    });
    vi.mocked(runPlan).mockResolvedValue({
      goal: "диск",
      steps: [
        {
          position: 1,
          registry: "files|проверить|размеры и место",
          status: "ok",
          reason: "",
          evidence: "free_gb=12",
          duration_ms: 20,
        },
      ],
      stopped: null,
      run_id: 1,
      sight: null,
    });

    render(<Ask />);
    grantSystemSpeechConsent();

    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /выполнить план/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /выполнить план/i }));

    await waitFor(() => {
      expect(speak).toHaveBeenCalledWith("план выполнен, шагов: 1");
    });
  });

  it("если проговорить нечем — это видно, а не проглочено", async () => {
    vi.mocked(speak).mockReturnValue(false);
    vi.mocked(checkPlan).mockResolvedValue({
      plan: { goal: "диск", source: "human", steps: [{ registry: "files|проверить|размеры и место" }] },
      problems: [],
      questions: [],
      gates: [
        {
          position: 1,
          registry: "files|проверить|размеры и место",
          decision: "allow",
          risk: "read",
          wants_approval: false,
        },
      ],
    });
    vi.mocked(runPlan).mockResolvedValue({
      goal: "диск",
      steps: [],
      stopped: "шаг 1 не выполнен",
      run_id: 2,
      sight: null,
    });

    render(<Ask />);
    grantSystemSpeechConsent();

    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /выполнить план/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /выполнить план/i }));

    await waitFor(() => {
      expect(screen.getByText(/проговорить не могу/)).toBeTruthy();
    });
  });
});
