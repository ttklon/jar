// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DownloadBar, useDownloadProgress } from "./DownloadBar";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  progress: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("../ipc", () => ({
  readinessStatus: mocks.status,
  downloadProgress: mocks.progress,
  cancelDownload: mocks.cancel,
}));

function Harness() {
  const progress = useDownloadProgress();
  return <DownloadBar progress={progress} />;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("загрузка видна с любого экрана (шаг 33)", () => {
  it("без загрузки не рисуется ничего и нет опроса в фоне", async () => {
    vi.useFakeTimers();
    mocks.status.mockResolvedValue({ download_name: null } as never);

    const { unmount } = render(<Harness />);
    // Первый тик сказал «качать нечего» — таймер снят.
    await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5000);
    // Простой не стоит ничего: шаг 384 — фоновая работа без дела запрещена.
    expect(mocks.status).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    unmount();
  });

  it("во время загрузки назван файл и есть отмена", async () => {
    mocks.status.mockResolvedValue({ download_name: "Qwen2.5-1.5B.gguf" } as never);
    mocks.progress.mockResolvedValue(40 * 1024 * 1024);

    render(<Harness />);

    // Имя файла — а не «идёт загрузка»: иначе человек не знает, что качается.
    await waitFor(() => expect(screen.getByText(/Qwen2\.5-1\.5B\.gguf/)).toBeTruthy());
    expect(screen.getByText(/40 МБ/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeTruthy();
  });

  it("размер неизвестен — сказано «качаю», без выдуманных нулей", async () => {
    mocks.status.mockResolvedValue({ download_name: "модель.gguf" } as never);
    mocks.progress.mockResolvedValue(null);

    render(<Harness />);
    await waitFor(() => expect(screen.getByText("качаю модель.gguf")).toBeTruthy());
    // «0 МБ» было бы утверждением о прогрессе, которого нет.
    expect(screen.queryByText(/0 МБ/)).toBeNull();
  });

  it("статус не прочитался — полоска молчит, а не падает", async () => {
    mocks.status.mockRejectedValue(new Error("нет связи с ядром"));

    render(<Harness />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
