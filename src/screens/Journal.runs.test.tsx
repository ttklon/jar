// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { auditTail, memoryRuns } from "../ipc";
import type { RunRecord } from "../ipc";
import { Journal } from "./Journal";

/**
 * Память и журнал — два разных источника, и экран обязан показывать оба.
 * Здесь проверяется именно память: запуск, его шаги и честное «идёт» вместо
 * придуманной длительности.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  auditTail: vi.fn(),
  memoryRuns: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(auditTail).mockReset();
  vi.mocked(memoryRuns).mockReset();
});

function run(patch: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 7,
    kind: "tool",
    subject: "files|создать|папку",
    started_ms: Date.UTC(2026, 10, 8, 9, 0, 0),
    finished_ms: Date.UTC(2026, 10, 8, 9, 0, 2),
    outcome: "ok",
    steps: [
      {
        position: 0,
        tool: "files|создать|папку",
        ok: true,
        reason: "папка создана",
        evidence: "path_exists",
      },
    ],
    ...patch,
  };
}

describe("экран «История»: запуски из памяти", () => {
  it("показывает запуск, его шаг и длительность", async () => {
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([run()]);

    render(<Journal />);

    await waitFor(() => {
      expect(screen.getByText("files|создать|папку")).toBeTruthy();
    });
    expect(screen.getByText(/инструмент/)).toBeTruthy();
    expect(screen.getByText(/path_exists/)).toBeTruthy();
    expect(screen.getByText(/2000 мс/)).toBeTruthy();
  });

  it("незакрытый запуск говорит «идёт», а не ноль миллисекунд", async () => {
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([
      run({ finished_ms: null, outcome: "running", steps: [] }),
    ]);

    render(<Journal />);

    await waitFor(() => {
      expect(screen.getByText(/идёт/)).toBeTruthy();
    });
    expect(screen.getByText(/без шагов/)).toBeTruthy();
  });

  it("сломанная память не скрывает журнал", async () => {
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockRejectedValue(new Error("база занята"));

    render(<Journal />);

    await waitFor(() => {
      expect(screen.getByText(/Пока пусто — запусков ещё не было/)).toBeTruthy();
    });
  });
});
