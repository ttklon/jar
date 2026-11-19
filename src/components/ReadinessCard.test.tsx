// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReadinessCard } from "./ReadinessCard";
import type { ReadinessStatus } from "../ipc";

/**
 * Карточка готовности — единственное место, где человек видит, чего не хватает для
 * первого разговора. Поэтому тесты проверяют смысл, а не вёрстку: пустая установка
 * называет оба компонента, настроенная — готова, в браузере кнопок скачивания нет.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const mocks = vi.hoisted(() => ({
  desktop: false,
  runtime: vi.fn(), remove: vi.fn(), stop: vi.fn(),
  download: vi.fn(), cancel: vi.fn(), smoke: vi.fn(), progress: vi.fn(),
}));
vi.mock("../ipc", async (importOriginal) => ({
  ...await importOriginal<typeof import("../ipc")>(),
  isTauri: () => mocks.desktop,
  downloadModel: mocks.download,
  downloadRuntime: mocks.runtime,
  removeRuntime: mocks.remove,
  cancelDownload: mocks.cancel,
  smokeCheck: mocks.smoke,
  stopEngine: mocks.stop,
  downloadProgress: mocks.progress,
}));
afterEach(() => { cleanup(); mocks.desktop = false; vi.clearAllMocks(); });

function status(partial: Partial<ReadinessStatus> = {}): ReadinessStatus {
  return {
    download_name: null,
    runtime_managed: false,
    runtime_supported: true,
    engine_found: false,
    engine_running: false,
    engine_program: null,
    engine_search_dir: "sidecars",
    model_present: false,
    model_name: null,
    model_bytes: 0,
    models_dir: "models",
    free_bytes: null,
    speech_found: false,
    speech_model: null,
    speech_search_dir: "sidecars",
    model_spec: {
      id: "m",
      title: "Qwen2.5 1.5B Instruct (Q4_K_M)",
      file: "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
      url: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
      sha256: "1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370",
      bytes: 986048768,
      license: "Apache-2.0",
      source: "Hugging Face: bartowski/Qwen2.5-1.5B-Instruct-GGUF",
      min_ram_gb: 4,
      description: "тест",
    },
    runtime_spec: {
      id: "r",
      title: "llama.cpp (Windows x64, CPU)",
      asset: "llama-b12535-bin-win-cpu-x64.zip",
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b12535/llama-b12535-bin-win-cpu-x64.zip",
      sha256: "595522a63267853c71460c0d5f021d44a0642852f28e65532ddaab65c584aab1",
      bytes: 25696689,
      license: "MIT",
      source: "GitHub Releases: ggml-org/llama.cpp, тег b12535",
      program: "llama-server.exe",
      description: "тест",
    },
    ready: false,
    missing: ["engine", "model"],
    ...partial,
  };
}

describe("карточка готовности", () => {
  it("пустая установка называет и движок, и модель с источником и лицензией", () => {
    render(<ReadinessCard status={status()} error={null} />);

    expect(screen.getByText("Чтобы начать разговор, нужно…")).toBeTruthy();
    expect(screen.getByText("llama.cpp (Windows x64, CPU)")).toBeTruthy();
    expect(screen.getByText("Qwen2.5 1.5B Instruct (Q4_K_M)")).toBeTruthy();
    expect(screen.getByText(/лицензия: MIT/)).toBeTruthy();
    expect(screen.getByText(/лицензия: Apache-2.0/)).toBeTruthy();
    expect(screen.getByText(/GitHub Releases: ggml-org\/llama\.cpp/)).toBeTruthy();
    expect(screen.getByText(/Hugging Face: bartowski/)).toBeTruthy();
  });

  it("в браузере кнопок скачивания нет, а оговорка есть", () => {
    render(<ReadinessCard status={status()} error={null} />);

    expect(screen.queryByRole("button", { name: "Скачать модель" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скачать движок" })).toBeNull();
    expect(screen.getByText(/В браузере машины нет/)).toBeTruthy();
  });

  it("настроенная машина готова и предлагает проверить разговор", () => {
    render(
      <ReadinessCard
        status={status({ engine_found: true, model_present: true, ready: true, missing: [] })}
        error={null}
      />,
    );

    expect(screen.getByText("Компоненты найдены")).toBeTruthy();
    expect(screen.queryByText("Чтобы начать разговор, нужно…")).toBeNull();
  });

  it("частичная установка называет только недостающее", () => {
    render(
      <ReadinessCard
        status={status({ engine_found: true, missing: ["model"] })}
        error={null}
      />,
    );

    expect(screen.queryByText("llama.cpp (Windows x64, CPU)")).toBeNull();
    expect(screen.getByText("Qwen2.5 1.5B Instruct (Q4_K_M)")).toBeTruthy();
  });

  it("читает статус сама, когда его не дали", async () => {
    render(<ReadinessCard />);

    await waitFor(() => {
      expect(screen.getByText("Чтобы начать разговор, нужно…")).toBeTruthy();
    });
  });
});

describe("явные действия desktop-карточки", () => {
  it("не скачивает и не запускает без согласия", () => {
    mocks.desktop = true;
    render(<ReadinessCard status={status()} error={null} />);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.smoke).not.toHaveBeenCalled();
    expect(mocks.runtime).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Скачать движок" })).toBeTruthy();
    expect(screen.getByText(/Установка не запускает exe/)).toBeTruthy();
  });

  it("передаёт эталонный хеш и показывает ошибку с возможностью повторить", async () => {
    mocks.desktop = true;
    mocks.download.mockRejectedValueOnce(new Error("хеш не совпал"));
    render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    await waitFor(() => expect(screen.getByText(/скачивание не удалось: хеш не совпал/)).toBeTruthy());
    expect(mocks.download).toHaveBeenCalledWith(status().model_spec.url, status().model_spec.file, status().model_spec.sha256);
    expect((screen.getByRole("button", { name: "Скачать модель" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("позволяет отменить ожидающую загрузку", async () => {
    mocks.desktop = true;
    let reject!: (reason: Error) => void;
    mocks.download.mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
    mocks.cancel.mockImplementationOnce(async () => { reject(new Error("скачивание отменено человеком")); });
    render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    await waitFor(() => expect(screen.getByText(/скачивание отменено, недокачанный файл убран/)).toBeTruthy());
    expect(mocks.cancel).toHaveBeenCalledOnce();
  });

  it("smoke — отдельное явное действие; не обещает проверенный микрофон", async () => {
    mocks.desktop = true;
    mocks.smoke.mockResolvedValueOnce({ ok: true, answer: "готово", note: "текст", model: null, port: 1234 });
    const props = status({ engine_found: true, model_present: true });
    const { unmount } = render(<ReadinessCard status={props} error={null} />);
    expect(mocks.smoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Запустить локальный движок и проверить разговор" }));
    await waitFor(() => expect(screen.getByText(/микрофон и распознавание этим не проверены/)).toBeTruthy());
    unmount();
    render(<ReadinessCard status={props} error={null} />);
    expect(screen.queryByText(/модель ответила:/)).toBeNull();
    expect(mocks.smoke).toHaveBeenCalledOnce();
  });
});

describe("недоступные условия", () => {
  it("не начинает загрузку при известной нехватке места", () => {
    mocks.desktop = true;
    render(<ReadinessCard status={status({ free_bytes: 1 })} error={null} />);
    const button = screen.getByRole("button", { name: "Скачать модель" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(screen.getByText(/Недостаточно свободного места/)).toBeTruthy();
  });

  it("неудачный smoke не называется работающим разговором", async () => {
    mocks.desktop = true;
    mocks.smoke.mockResolvedValueOnce({ ok: false, answer: null, note: "пустой ответ", model: null, port: 1234 });
    render(<ReadinessCard status={status({ engine_found: true, model_present: true })} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Запустить локальный движок и проверить разговор" }));
    await waitFor(() => expect(screen.getByText(/разговор не подтверждён: пустой ответ/)).toBeTruthy());
    expect(screen.queryByText(/модель ответила:/)).toBeNull();
  });

  it("читает запрет микрофона без запроса записи", async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, "permissions");
    const query = vi.fn().mockResolvedValue({ state: "denied", addEventListener: vi.fn(), removeEventListener: vi.fn() });
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query } });
    try {
      const { unmount } = render(<ReadinessCard status={status()} error={null} />);
      await waitFor(() => expect(screen.getByText(/Доступ к микрофону запрещён/)).toBeTruthy());
      expect(query).toHaveBeenCalledWith({ name: "microphone" });
      unmount();
    } finally {
      if (original) Object.defineProperty(navigator, "permissions", original);
      else Reflect.deleteProperty(navigator, "permissions");
    }
  });
});

describe("Windows x64 runtime: модель окружения, не настоящая ОС", () => {
  it("отказ пользователя ничего не устанавливает; клик устанавливает, но не запускает", async () => {
    mocks.desktop = true;
    mocks.runtime.mockResolvedValueOnce({ program: "sidecars/version/bin/llama-server.exe" });
    render(<ReadinessCard status={status()} error={null} />);
    expect(mocks.runtime).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Скачать движок" }));
    await waitFor(() => expect(screen.getByText(/готово: llama-server.exe/)).toBeTruthy());
    expect(mocks.runtime).toHaveBeenCalledOnce();
    expect(mocks.smoke).not.toHaveBeenCalled();
  });

  it("неподдерживаемая архитектура не получает кнопку установки", () => {
    mocks.desktop = true;
    render(<ReadinessCard status={status({ runtime_supported: false })} error={null} />);
    expect(screen.queryByRole("button", { name: "Скачать движок" })).toBeNull();
    expect(screen.getByText(/только в приложении на Windows x64/)).toBeTruthy();
  });

  it("неверный хеш runtime — ошибка и повтор, не найденный движок", async () => {
    mocks.desktop = true;
    mocks.runtime.mockRejectedValueOnce(new Error("SHA-256 архива движка не совпал"));
    render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать движок" }));
    await waitFor(() => expect(screen.getByText(/скачивание не удалось: SHA-256/)).toBeTruthy());
    expect(mocks.smoke).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Скачать движок" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("удаляет только управляемый runtime после подтверждения", async () => {
    mocks.desktop = true;
    mocks.remove.mockResolvedValueOnce(undefined);
    render(<ReadinessCard status={status({ runtime_managed: true, engine_found: true })} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Удалить движок" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Удалить движок" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить движок" }));
    await waitFor(() => expect(screen.getByText("движок удалён")).toBeTruthy());
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("не предлагает удалять ручной exe и блокирует удаление работающего", () => {
    mocks.desktop = true;
    const { rerender } = render(<ReadinessCard status={status({ engine_found: true })} error={null} />);
    expect(screen.queryByRole("button", { name: "Удалить движок" })).toBeNull();
    rerender(<ReadinessCard status={status({ engine_found: true, engine_running: true, runtime_managed: true })} error={null} />);
    expect((screen.getByRole("button", { name: "Удалить движок" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("уход со страницы не превращает поздний результат загрузки в запуск", async () => {
    mocks.desktop = true;
    let finish!: (v: { program: string }) => void;
    mocks.runtime.mockReturnValueOnce(new Promise((yes) => { finish = yes; }));
    const { unmount } = render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать движок" }));
    unmount();
    finish({ program: "llama-server.exe" });
    await Promise.resolve();
    expect(mocks.smoke).not.toHaveBeenCalled();
  });
});

it("остановка во время smoke не принимает поздний ответ за успех", async () => {
  mocks.desktop = true;
  let finish!: (v: unknown) => void;
  mocks.smoke.mockReturnValueOnce(new Promise((yes) => { finish = yes; }));
  mocks.stop.mockResolvedValueOnce({ running: false });
  render(<ReadinessCard status={status({ engine_found: true, model_present: true })} error={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Запустить локальный движок и проверить разговор" }));
  fireEvent.click(screen.getByRole("button", { name: "Остановить локальный движок" }));
  await waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  finish({ ok: true, answer: "поздний ответ", model: null, port: 1, note: "" });
  await Promise.resolve();
  expect(screen.queryByText(/поздний ответ/)).toBeNull();
});

it("возврат к сохранённому экрану перечитывает статус без перемонтирования голоса", async () => {
  const refresh = vi.fn();
  const { rerender } = render(<ReadinessCard active={false} onRefresh={refresh} />);
  expect(refresh).not.toHaveBeenCalled();
  rerender(<ReadinessCard active={true} onRefresh={refresh} />);
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  rerender(<ReadinessCard active={false} onRefresh={refresh} />);
  rerender(<ReadinessCard active={true} onRefresh={refresh} />);
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  expect(mocks.smoke).not.toHaveBeenCalled();
});

it("после повторного открытия показывает загрузку ядра и позволяет отменить её", async () => {
  mocks.desktop = true;
  mocks.progress.mockResolvedValue(100);
  mocks.cancel.mockResolvedValueOnce(undefined);
  render(<ReadinessCard status={status({ download_name: "llama-b12535-bin-win-cpu-x64.zip" })} error={null} />);
  expect(screen.getByText(/В ядре продолжается подготовка:/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Скачать движок" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
  await waitFor(() => expect(mocks.cancel).toHaveBeenCalledOnce());
  expect(mocks.runtime).not.toHaveBeenCalled();
});

describe("ошибки восстановления не подменяются успехом отмены", () => {
  it("не скрывает оставшийся временный файл за словом «отменено»", async () => {
    mocks.desktop = true;
    mocks.download.mockRejectedValueOnce(new Error("скачивание отменено человеком; временный файл не убран: m.gguf.part"));
    render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    await waitFor(() => expect(screen.getByText(/временный файл не убран: m.gguf.part/)).toBeTruthy());
    expect(screen.queryByText("скачивание отменено, недокачанный файл убран")).toBeNull();
  });

  it("таймаут распаковки не считается пользовательской отменой", async () => {
    mocks.desktop = true;
    mocks.runtime.mockRejectedValueOnce(new Error("распаковка превысила 120 секунд; повторите установку"));
    render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать движок" }));
    await waitFor(() => expect(screen.getByText(/распаковка превысила 120 секунд/)).toBeTruthy());
    expect(screen.queryByText("скачивание отменено, недокачанный файл убран")).toBeNull();
  });

  it("перечитывает файлы и при частичном успехе публикации", async () => {
    mocks.desktop = true;
    const refresh = vi.fn();
    mocks.runtime.mockRejectedValueOnce(new Error("движок установлен, но временный каталог не убран"));
    render(<ReadinessCard status={status()} error={null} onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать движок" }));
    await waitFor(() => expect(screen.getByText(/движок установлен, но временный каталог не убран/)).toBeTruthy());
    expect(refresh).toHaveBeenCalledOnce();
    expect(mocks.smoke).not.toHaveBeenCalled();
  });

  it("не накладывает запросы прогресса друг на друга", async () => {
    vi.useFakeTimers();
    try {
      mocks.desktop = true;
      let finish!: (value: number) => void;
      mocks.progress.mockResolvedValue(200).mockReturnValueOnce(new Promise((yes) => { finish = yes; }));
      const { unmount } = render(<ReadinessCard status={status({ download_name: "m.gguf" })} error={null} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(mocks.progress).toHaveBeenCalledOnce();
      await act(async () => { finish(100); });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(mocks.progress).toHaveBeenCalledTimes(2);
      unmount();
    } finally { vi.useRealTimers(); }
  });
});
