// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { listModels, verifyModel } from "../ipc";
import { Models } from "./Models";

/**
 * Сверка хеша — единственное действие на экране «Модели» и единственное место, где
 * интерфейс говорит про содержимое файла. Проверяется, что он спрашивает ядро и
 * показывает именно тот вердикт, который пришёл, а не «всё хорошо» по умолчанию.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  listModels: vi.fn(),
  verifyModel: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(listModels).mockReset();
  vi.mocked(verifyModel).mockReset();
});

const FILE = {
  name: "qwen3-1.7b.gguf",
  size_bytes: 1_100_000_000,
  ok: true,
  note: "заголовок GGUF прочитан",
  version: 3,
  tensors: 291,
  architecture: "qwen3",
  quant: "Q4_K_M",
  hash: null,
};

describe("сверка хеша на экране «Модели»", () => {
  it("первая сверка показывает, что хеш записан впервые", async () => {
    vi.mocked(listModels).mockResolvedValue({ dir: "C:/models", items: [FILE], error: null });
    vi.mocked(verifyModel).mockResolvedValue({
      name: FILE.name,
      actual: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      previous: null,
      verdict: "first",
    });

    render(<Models />);

    const button = await screen.findByRole("button", { name: /сверить хеш/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/хеш записан впервые/i)).toBeTruthy();
    });
    expect(screen.getByText("ba7816bf8f01")).toBeTruthy();
  });

  it("изменённый файл называется изменённым, а не совпавшим", async () => {
    vi.mocked(listModels).mockResolvedValue({
      dir: "C:/models",
      items: [{ ...FILE, hash: "aa".repeat(32) }],
      error: null,
    });
    vi.mocked(verifyModel).mockResolvedValue({
      name: FILE.name,
      actual: "bb".repeat(32),
      previous: "aa".repeat(32),
      verdict: "changed",
    });

    render(<Models />);

    fireEvent.click(await screen.findByRole("button", { name: /сверить хеш/i }));

    await waitFor(() => {
      expect(screen.getByText(/файл изменился с прошлой сверки/i)).toBeTruthy();
    });
    expect(screen.queryByText(/совпадает с прошлым/i)).toBeNull();
  });

  it("ошибка сверки показывается как ошибка", async () => {
    vi.mocked(listModels).mockResolvedValue({ dir: "C:/models", items: [FILE], error: null });
    vi.mocked(verifyModel).mockRejectedValue(new Error("файла нет: qwen3-1.7b.gguf"));

    render(<Models />);

    fireEvent.click(await screen.findByRole("button", { name: /сверить хеш/i }));

    await waitFor(() => {
      expect(screen.getByText(/сверка не удалась/i)).toBeTruthy();
    });
  });
});
