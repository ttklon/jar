// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { checkPlan, runPlan, savePlan } from "../ipc";
import { Ask } from "./Ask";

/**
 * Проверка плана — это то, что должно случиться до первого шага. Экран обязан
 * показать проблемы списком и не давать сохранить невалидный план.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  planFor: vi.fn().mockResolvedValue([]),
  checkPlan: vi.fn(),
  savePlan: vi.fn(),
  runPlan: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(checkPlan).mockReset();
  vi.mocked(savePlan).mockReset();
  vi.mocked(runPlan).mockReset();
});

const GOOD_GATES = [
  {
    position: 1,
    registry: "storage-backup|проверить|свободное место",
    decision: "allow" as const,
    risk: "read",
    wants_approval: false,
  },
];

const GOOD = {
  goal: "посмотреть диск",
  source: "human",
  steps: [{ registry: "storage-backup|проверить|свободное место", why: "нужно" }],
};

describe("проверка плана", () => {
  it("чистый план называется исполнимым", async () => {
    vi.mocked(checkPlan).mockResolvedValue({ plan: GOOD, problems: [], gates: GOOD_GATES });

    render(<Ask />);

    fireEvent.change(screen.getByLabelText(/проверить план/i), {
      target: { value: JSON.stringify(GOOD) },
    });
    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/план исполним: 1 шагов/i)).toBeTruthy();
    });
  });

  it("проблемы перечислены по шагам и с причиной", async () => {
    vi.mocked(checkPlan).mockResolvedValue({
      plan: GOOD,
      gates: GOOD_GATES,
      problems: [
        {
          position: 1,
          registry: "files|найти|по содержимому",
          problem: "у этого действия нет инструмента",
        },
      ],
    });

    render(<Ask />);

    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/проблем: 1/i)).toBeTruthy();
    });
    expect(screen.getByText(/шаг 1: files\|найти\|по содержимому — у этого действия нет инструмента/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /сохранить в памяти/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("битый JSON объясняется, а не молчит", async () => {
    vi.mocked(checkPlan).mockResolvedValue({
      plan: null,
      gates: [],
      problems: [{ position: 0, registry: "", problem: "план не разбирается как JSON" }],
    });

    render(<Ask />);

    fireEvent.change(screen.getByLabelText(/проверить план/i), {
      target: { value: "не json" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));

    await waitFor(() => {
      expect(screen.getByText(/план не разбирается как JSON/)).toBeTruthy();
    });
  });

  it("сохранение говорит, что план запомнен", async () => {
    vi.mocked(checkPlan).mockResolvedValue({ plan: GOOD, problems: [], gates: GOOD_GATES });
    vi.mocked(savePlan).mockResolvedValue({ plan: GOOD, problems: [], gates: GOOD_GATES });

    render(<Ask />);

    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /сохранить в памяти/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /сохранить в памяти/i }));

    await waitFor(() => {
      expect(screen.getByText(/план сохранён в памяти/i)).toBeTruthy();
    });
  });
});

const RISKY = {
  goal: "убери дубликаты",
  source: "model",
  steps: [
    { registry: "files|проверить|дубликаты по хэшу", why: "сначала найти" },
    { registry: "files|удалить|в корзину", why: "потом убрать" },
  ],
};

const RISKY_GATES = [
  {
    position: 1,
    registry: "files|проверить|дубликаты по хэшу",
    decision: "allow" as const,
    risk: "read",
    wants_approval: false,
  },
  {
    position: 2,
    registry: "files|удалить|в корзину",
    decision: "confirm" as const,
    risk: "destructive",
    wants_approval: true,
  },
];

describe("запуск плана", () => {
  it("шаг с риском не запускается без разрешения, а с разрешением — запускается", async () => {
    vi.mocked(checkPlan).mockResolvedValue({
      plan: RISKY,
      problems: [],
      gates: RISKY_GATES,
    });
    vi.mocked(runPlan).mockResolvedValue({
      goal: RISKY.goal,
      steps: [
        {
          position: 1,
          registry: "files|проверить|дубликаты по хэшу",
          status: "ok",
          reason: "",
          evidence: "duplicates=2",
          duration_ms: 12,
        },
        {
          position: 2,
          registry: "files|удалить|в корзину",
          status: "ok",
          reason: "",
          evidence: "trashed=2",
          duration_ms: 30,
        },
      ],
      stopped: null,
      run_id: 9,
    });

    render(<Ask />);

    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /выполнить план/i })).toBeTruthy();
    });

    const run = screen.getByRole("button", { name: /выполнить план/i }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("разрешить шаг 2"));
    await waitFor(() => {
      expect(run.disabled).toBe(false);
    });

    fireEvent.click(run);

    await waitFor(() => {
      expect(screen.getByText(/что получилось/i)).toBeTruthy();
    });
    expect(runPlan).toHaveBeenCalledWith(JSON.stringify(RISKY), [2]);
    expect(screen.getByText(/trashed=2/)).toBeTruthy();
    expect(screen.queryByText(/остановлено/)).toBeNull();
  });

  it("остановка плана называется причиной, а не молчанием", async () => {
    vi.mocked(checkPlan).mockResolvedValue({ plan: GOOD, problems: [], gates: GOOD_GATES });
    vi.mocked(runPlan).mockResolvedValue({
      goal: GOOD.goal,
      steps: [
        {
          position: 1,
          registry: "storage-backup|проверить|свободное место",
          status: "failed",
          reason: "powershell не ответил",
          evidence: "failed",
          duration_ms: 500,
        },
      ],
      stopped: "шаг 1 не выполнен: powershell не ответил",
      run_id: 10,
    });

    render(<Ask />);

    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /выполнить план/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /выполнить план/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/остановлено: шаг 1 не выполнен: powershell не ответил/),
      ).toBeTruthy();
    });
  });

  it("отказ ядра виден как отказ, а не как пустой отчёт", async () => {
    vi.mocked(checkPlan).mockResolvedValue({ plan: GOOD, problems: [], gates: GOOD_GATES });
    vi.mocked(runPlan).mockRejectedValue(
      new Error("план не запущен: шаг 1 требует подтверждения человеком"),
    );

    render(<Ask />);

    fireEvent.click(screen.getByRole("button", { name: /^проверить$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /выполнить план/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /выполнить план/i }));

    await waitFor(() => {
      expect(screen.getByText(/план не запущен: шаг 1 требует подтверждения/)).toBeTruthy();
    });
  });
});
