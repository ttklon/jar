// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { Hands } from "./Hands";

/**
 * Привнесённые руки видны отдельно от встроенных и убираются одной кнопкой.
 * Если их смешать со встроенными, однажды не понять, откуда взялась команда.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  listTools: vi.fn().mockResolvedValue([]),
  customHands: vi.fn(),
  removeCustomHand: vi.fn().mockResolvedValue(undefined),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => cleanup());

describe("привнесённые руки", () => {
  it("показывает свою руку отдельно и говорит, что она не исполняется", async () => {
    const { customHands } = await import("../ipc");
    vi.mocked(customHands).mockResolvedValueOnce([
      {
        key: "storage-backup|проверить|свободное место",
        title: "показать свободное место",
        code: "Get-PSDrive",
        risk: "read",
        source: "черновик модели, проверен в клетке: проба прошла: код 0",
        created_ms: 1,
      },
    ]);

    render(<Hands />);

    await waitFor(() =>
      expect(screen.getAllByText(/показать свободное место/).length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/Пока не исполняются/)).toBeTruthy();
    expect(screen.getByText(/Get-PSDrive/)).toBeTruthy();
  });

  it("убирает руку по слову человека", async () => {
    const { customHands, removeCustomHand } = await import("../ipc");
    vi.mocked(customHands).mockResolvedValueOnce([
      {
        key: "k",
        title: "показать диски",
        code: "Get-PSDrive",
        risk: "read",
        source: "проверен в клетке",
        created_ms: 1,
      },
    ]);

    render(<Hands />);
    const button = await screen.findByText("убрать «показать диски»");
    fireEvent.click(button);

    await waitFor(() => expect(vi.mocked(removeCustomHand)).toHaveBeenCalledWith("k"));
    await waitFor(() => expect(screen.getByText("привнесённых рук нет")).toBeTruthy());
  });

  it("пустой список говорит, что своих рук нет", async () => {
    const { customHands } = await import("../ipc");
    vi.mocked(customHands).mockResolvedValueOnce([]);

    render(<Hands />);
    await waitFor(() => expect(screen.getByText("привнесённых рук нет")).toBeTruthy());
  });
});
