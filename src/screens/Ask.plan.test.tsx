// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { checkPlan, savePlan } from "../ipc";
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
});

const GOOD = {
  goal: "посмотреть диск",
  source: "human",
  steps: [{ registry: "storage-backup|проверить|свободное место", why: "нужно" }],
};

describe("проверка плана", () => {
  it("чистый план называется исполнимым", async () => {
    vi.mocked(checkPlan).mockResolvedValue({ plan: GOOD, problems: [] });

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
    vi.mocked(checkPlan).mockResolvedValue({ plan: GOOD, problems: [] });
    vi.mocked(savePlan).mockResolvedValue({ plan: GOOD, problems: [] });

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
