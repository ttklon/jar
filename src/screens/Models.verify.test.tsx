// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { downloadModel, listModels, removeModel, verifyModel } from "../ipc";
import type { ModelFile, ModelsView } from "../ipc";
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
  downloadModel: vi.fn(),
  removeModel: vi.fn(),
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
  vi.mocked(downloadModel).mockReset();
  vi.mocked(removeModel).mockReset();
});

/** Ответ ядра в одном месте: у модели есть размер папки и место на диске. */
function view(items: ModelFile[], total: number): ModelsView {
  return {
    dir: "C:/models",
    items,
    error: null,
    total_bytes: total,
    free_bytes: 42_000_000_000,
  };
}

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
    vi.mocked(listModels).mockResolvedValue(view([FILE], 1_100_000_000));
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
      ...view([{ ...FILE, hash: "aa".repeat(32) }], 1_100_000_000),
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

  it("скачивание без эталона так и говорит: хеш записан, а не проверен", async () => {
    vi.mocked(listModels).mockResolvedValue(view([], 0));
    vi.mocked(downloadModel).mockResolvedValue({
      name: "qwen3-1.7b.gguf",
      bytes: 1_100_000_000,
      sha256: "c".repeat(64),
      verified: false,
    });

    render(<Models />);

    const [urlInput] = screen.getAllByRole("textbox");
    fireEvent.change(urlInput!, {
      target: { value: "https://huggingface.co/x/resolve/main/model.gguf" },
    });
    fireEvent.change(screen.getByLabelText(/имя файла/i), {
      target: { value: "qwen3-1.7b.gguf" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^скачать$/i }));

    await waitFor(() => {
      expect(screen.getByText(/эталона не было — хеш записан/i)).toBeTruthy();
    });
    expect(vi.mocked(downloadModel)).toHaveBeenCalledWith(
      "https://huggingface.co/x/resolve/main/model.gguf",
      "qwen3-1.7b.gguf",
      undefined,
    );
  });

  it("без ссылки скачивание не начинается", async () => {
    vi.mocked(listModels).mockResolvedValue(view([], 0));

    render(<Models />);

    fireEvent.click(screen.getByRole("button", { name: /^скачать$/i }));

    await waitFor(() => {
      expect(screen.getByText(/укажите ссылку/i)).toBeTruthy();
    });
    expect(vi.mocked(downloadModel)).not.toHaveBeenCalled();
  });

  it("ошибка сверки показывается как ошибка", async () => {
    vi.mocked(listModels).mockResolvedValue(view([FILE], 1_100_000_000));
    vi.mocked(verifyModel).mockRejectedValue(new Error("файла нет: qwen3-1.7b.gguf"));

    render(<Models />);

    fireEvent.click(await screen.findByRole("button", { name: /сверить хеш/i }));

    await waitFor(() => {
      expect(screen.getByText(/сверка не удалась/i)).toBeTruthy();
    });
  });
});

describe("удаление файла модели", () => {
  it("спрашивает подтверждение и удаляет только после ответа", async () => {
    vi.mocked(listModels).mockResolvedValue(view([FILE], 1_100_000_000));
    vi.mocked(removeModel).mockResolvedValue(undefined);

    render(<Models />);

    fireEvent.click(await screen.findByRole("button", { name: /^удалить$/i }));

    // Пока человек не ответил, ничего не удаляется.
    expect(screen.getByText(/удалить файл модели\?/i)).toBeTruthy();
    expect(vi.mocked(removeModel)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /удалить файл/i }));

    await waitFor(() => {
      expect(vi.mocked(removeModel)).toHaveBeenCalledWith("qwen3-1.7b.gguf");
    });
    await waitFor(() => {
      expect(vi.mocked(listModels)).toHaveBeenCalledTimes(2);
    });
  });

  it("«оставить» ничего не удаляет", async () => {
    vi.mocked(listModels).mockResolvedValue(view([FILE], 1_100_000_000));

    render(<Models />);

    fireEvent.click(await screen.findByRole("button", { name: /^удалить$/i }));
    fireEvent.click(screen.getByRole("button", { name: /оставить/i }));

    await waitFor(() => {
      expect(screen.queryByText(/удалить файл модели\?/i)).toBeNull();
    });
    expect(vi.mocked(removeModel)).not.toHaveBeenCalled();
  });

  it("показывает занятое место и свободное на диске", async () => {
    vi.mocked(listModels).mockResolvedValue(view([FILE], 1_100_000_000));

    render(<Models />);

    await waitFor(() => {
      expect(screen.getByText(/модели занимают 1\.0 ГБ/i)).toBeTruthy();
    });
    expect(screen.getByText(/свободно на диске 39\.1 ГБ/i)).toBeTruthy();
  });
});
