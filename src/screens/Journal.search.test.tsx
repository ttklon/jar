// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { memoryRuns, searchEpisodes } from "../ipc";
import type { Episode } from "../ipc";
import { Journal } from "./Journal";

/**
 * Поиск по памяти отвечает честно: находит по слову, говорит, какие слова совпали, и
 * не делает вид, что пустой ответ — это ошибка.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  auditTail: vi.fn().mockResolvedValue([]),
  memoryRuns: vi.fn().mockResolvedValue([]),
  searchEpisodes: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(searchEpisodes).mockReset();
});

const EPISODE: Episode = {
  matched: ["загрузки", "хэшу"],
  run: {
    id: 7,
    kind: "tool",
    subject: "Уборка в Загрузках",
    started_ms: 1_700_000_000_000,
    finished_ms: 1_700_000_002_000,
    outcome: "ok",
    steps: [
      {
        position: 1,
        tool: "files|проверить|дубликаты по хэшу",
        ok: true,
        reason: "",
        evidence: "duplicates=3",
      },
    ],
  },
};

describe("поиск по памяти", () => {
  it("найденный запуск показывает совпавшие слова и шаги", async () => {
    vi.mocked(searchEpisodes).mockResolvedValue([EPISODE]);

    render(<Journal />);

    fireEvent.change(screen.getByLabelText("Что я уже делал?"), {
      target: { value: "загрузки хэшу" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => {
      expect(screen.getByText("совпало: загрузки, хэшу")).toBeTruthy();
    });
    expect(screen.getByText("Уборка в Загрузках")).toBeTruthy();
    expect(screen.getByText(/duplicates=3/)).toBeTruthy();
    expect(searchEpisodes).toHaveBeenCalledWith("загрузки хэшу");
  });

  it("пустой ответ называется ответом, а не ошибкой", async () => {
    vi.mocked(searchEpisodes).mockResolvedValue([]);

    render(<Journal />);

    fireEvent.change(screen.getByLabelText("Что я уже делал?"), {
      target: { value: "телепорт" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => {
      expect(screen.getByText(/ничего не нашлось/)).toBeTruthy();
    });
    expect(screen.getByText(/найдено запусков: 0/)).toBeTruthy();
  });

  it("пустой запрос не ходит в память", async () => {
    render(<Journal />);

    fireEvent.change(screen.getByLabelText("Что я уже делал?"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(searchEpisodes).not.toHaveBeenCalled();
    expect(vi.mocked(memoryRuns)).toHaveBeenCalled();
  });
});
