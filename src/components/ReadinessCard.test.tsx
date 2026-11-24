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
afterEach(() => {
  cleanup();
  mocks.desktop = false;
  vi.clearAllMocks();
  // Журнал первого запуска переживает окно — значит, и тест. Между тестами
  // убираем явно, иначе «скачано» из прошлого теста видно в следующем.
  localStorage.clear();
});

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
    speech_runtime_managed: false,
    speech_runtime_spec: {
      id: "w",
      title: "whisper.cpp (Windows x64, CPU)",
      asset: "whisper-bin-x64.zip",
      url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",
      sha256: "6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb",
      bytes: 8928640,
      license: "MIT",
      source: "GitHub Releases: ggml-org/whisper.cpp, тег b5454",
      program: "whisper-server.exe",
      description: "тест",
    },
    speech_model_spec: {
      id: "wm",
      title: "Whisper base (многоязычная)",
      file: "ggml-base.bin",
      url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
      sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
      bytes: 147951465,
      license: "MIT",
      source: "Hugging Face: ggerganov/whisper.cpp",
      min_ram_gb: 4,
      description: "тест",
    },
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
    expect(screen.getByText(/лицензия: Apache-2.0/)).toBeTruthy();
    expect(screen.getByText(/GitHub Releases: ggml-org\/llama\.cpp/)).toBeTruthy();
    expect(screen.getByText(/Hugging Face: bartowski/)).toBeTruthy();
    // Локальное распознавание — тоже с лицензией и источником, а не безымянной кнопкой.
    expect(screen.getByText("Локальное распознавание речи (необязательно)")).toBeTruthy();
    expect(screen.getByText("whisper.cpp (Windows x64, CPU)")).toBeTruthy();
    expect(screen.getByText("Whisper base (многоязычная)")).toBeTruthy();
    expect(screen.getByText(/GitHub Releases: ggml-org\/whisper\.cpp/)).toBeTruthy();
    expect(screen.getByText(/Hugging Face: ggerganov\/whisper\.cpp/)).toBeTruthy();
    expect(screen.getAllByText(/лицензия: MIT/).length).toBeGreaterThanOrEqual(3);
  });

  it("в браузере кнопок скачивания нет, а оговорка есть", () => {
    render(<ReadinessCard status={status()} error={null} />);

    expect(screen.queryByRole("button", { name: "Скачать модель" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скачать движок" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скачать недостающее и открыть разговор" })).toBeNull();
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
    // Шаг 34: на готовой машине о модели не говорится вовсе. Не отвлекать тем,
    // что сделано, — иначе человек ищет, зачем ему снова качать гигабайт.
    const screenText = document.body.textContent ?? "";
    expect(screenText).not.toMatch(/скачать/i);
    expect(screenText).not.toContain("Qwen2.5 1.5B Instruct");
    // И ни одной кнопки, ведущей к модели: искать нечего.
    expect(screen.queryByRole("button", { name: /скачать|модел/i })).toBeNull();
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
    expect(screen.getAllByText(/Установка не запускает exe/).length).toBeGreaterThanOrEqual(2);
    // Речь — необязательная часть: её кнопки тоже не нажимаются сами.
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Скачать движок распознавания" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Скачать модель распознавания" })).toBeTruthy();
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

  it("в отказе есть кнопка, и она ведёт туда, где видно причину (шаг 25)", async () => {
    mocks.desktop = true;
    mocks.download.mockRejectedValueOnce(new Error("не хватает места на диске"));
    const onToModels = vi.fn();
    render(<ReadinessCard status={status()} error={null} onToModels={onToModels} />);

    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    await waitFor(() => expect(screen.getByText(/скачивание не удалось/)).toBeTruthy());

    // Совет был и раньше, но искать «Модели» приходилось самому. Теперь — кнопка,
    // и подпись называет место, куда она ведёт.
    const act = screen.getByRole("button", { name: "Открыть «Модели»" });
    fireEvent.click(act);
    expect(onToModels).toHaveBeenCalledTimes(1);
    // Ушли разбираться — старый отказ снят, а не висит новым сбоем.
    expect(screen.queryByText(/скачивание не удалось/)).toBeNull();
  });

  it("без пути к «Моделям» кнопки нет: обещать переход некуда", async () => {
    mocks.desktop = true;
    mocks.download.mockRejectedValueOnce(new Error("не хватает места на диске"));
    render(<ReadinessCard status={status()} error={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    await waitFor(() => expect(screen.getByText(/скачивание не удалось/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Открыть «Модели»/ })).toBeNull();
  });

  it("пока модель качается — сказано, что остальное уже работает (шаг 23)", async () => {
    mocks.desktop = true;
    // Загрузка не завершается: нас интересует именно состояние «качается».
    mocks.download.mockImplementation(() => new Promise<void>(() => undefined));
    render(<ReadinessCard status={status()} error={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    await waitFor(() => expect(screen.getByText(/Качаю /)).toBeTruthy());

    // Не «подождите», а что именно доступно прямо сейчас.
    const line = screen.getByText(/Качаю /).textContent ?? "";
    expect(line).toMatch(/не блокирует/);
    expect(line).toMatch(/реестр дел работает без модели/);
  });

  it("после скачивания журнал говорит, что было при первом запуске (шаг 40)", async () => {
    mocks.desktop = true;
    mocks.download.mockResolvedValueOnce(undefined);
    render(<ReadinessCard status={status()} error={null} />);

    // До скачивания журнала нет: пустая карточка выглядела бы потерянным отчётом.
    expect(screen.queryByText("что было при первом запуске")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    await waitFor(() => expect(screen.getByText("что было при первом запуске")).toBeTruthy());
    expect(screen.getByText(/скачано: модель разговора/)).toBeTruthy();
  });

  it("журнал переживает перезапуск — иначе он не нужен", () => {
    // Прошлый запуск оставил след, карточка уже молчит: всё на месте.
    localStorage.setItem(
      "zshelper.firstRun.log",
      JSON.stringify([{ what: "deferred", item: "модель распознавания", why: "не хватает места" }]),
    );
    render(<ReadinessCard status={status({ engine_found: true, model_present: true })} error={null} />);

    // Именно ради этого случая журнал и существует: карточка говорит «готово»,
    // а человек помнит, что что-то откладывал, и хочет проверить.
    expect(screen.getByText("что было при первом запуске")).toBeTruthy();
    expect(screen.getByText(/отложено: модель распознавания/)).toBeTruthy();
  });

  it("позволяет отменить ожидающую загрузку", async () => {
    mocks.desktop = true;
    let reject!: (reason: Error) => void;
    mocks.download.mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
    mocks.cancel.mockImplementationOnce(async () => { reject(new Error("скачивание отменено человеком")); });
    render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));
    // Одна «Отменить» на экран и имя файла рядом (шаг 22): человек должен знать,
    // что именно остановит, а не нажимать наугад.
    const cancel = screen.getByRole("button", { name: "Отменить" });
    expect(cancel.parentElement?.textContent).toContain("Qwen2.5-1.5B-Instruct");
    fireEvent.click(cancel);
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
    expect(screen.getAllByText(/Недостаточно свободного места/).length).toBeGreaterThanOrEqual(1);
    // Кнопка модели распознавания тоже заблокирована: место известно и его мало.
    const speechModel = screen.getByRole("button", { name: "Скачать модель распознавания" }) as HTMLButtonElement;
    expect(speechModel.disabled).toBe(true);
    fireEvent.click(speechModel);
    expect(mocks.download).not.toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByText(/готово: .*llama-server\.exe/)).toBeTruthy());
    expect(mocks.runtime).toHaveBeenCalledWith("llama");
    expect(mocks.runtime).toHaveBeenCalledOnce();
    expect(mocks.smoke).not.toHaveBeenCalled();
  });

  it("неподдерживаемая архитектура не получает кнопку установки", () => {
    mocks.desktop = true;
    render(<ReadinessCard status={status({ runtime_supported: false })} error={null} />);
    expect(screen.queryByRole("button", { name: "Скачать движок" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скачать движок распознавания" })).toBeNull();
    expect(screen.getAllByText(/только в приложении на Windows x64/).length).toBe(2);
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
    expect(mocks.remove).toHaveBeenCalledWith("llama");
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

describe("локальное распознавание — необязательная часть разговора", () => {
  it("когда всё на месте, секции речи нет; готовность от неё не зависит", () => {
    render(
      <ReadinessCard
        status={status({
          engine_found: true,
          model_present: true,
          ready: true,
          missing: [],
          speech_found: true,
          speech_model: "ggml-base.bin",
        })}
        error={null}
      />,
    );
    expect(screen.getByText("Компоненты найдены")).toBeTruthy();
    expect(screen.queryByText("Локальное распознавание речи (необязательно)")).toBeNull();
  });

  it("в браузере кнопок речи нет, а объяснение — на карточке", () => {
    render(<ReadinessCard status={status()} error={null} />);
    expect(screen.queryByRole("button", { name: "Скачать движок распознавания" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Скачать модель распознавания" })).toBeNull();
    expect(screen.getByText("Локальное распознавание речи (необязательно)")).toBeTruthy();
    expect(screen.getByText(/не покидает компьютер/)).toBeTruthy();
  });

  it("клик ставит именно whisper и не трогает движок разговора", async () => {
    mocks.desktop = true;
    mocks.runtime.mockResolvedValueOnce({
      program: "sidecars/whisper-cpp/Release/whisper-server.exe",
    });
    render(<ReadinessCard status={status()} error={null} />);
    expect(mocks.runtime).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Скачать движок распознавания" }));
    await waitFor(() =>
      expect(screen.getByText(/готово: .*whisper-server\.exe/)).toBeTruthy(),
    );
    expect(mocks.runtime).toHaveBeenCalledWith("whisper");
    expect(mocks.runtime).toHaveBeenCalledOnce();
    expect(mocks.smoke).not.toHaveBeenCalled();
  });

  it("модель распознавания качается по pinned-ссылке с эталонным хешем", async () => {
    mocks.desktop = true;
    mocks.download.mockResolvedValueOnce({ name: "ggml-base.bin", bytes: 1, sha256: "x", verified: true });
    const props = status();
    render(<ReadinessCard status={props} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать модель распознавания" }));
    await waitFor(() => expect(screen.getByText(/готово: ggml-base\.bin/)).toBeTruthy());
    expect(mocks.download).toHaveBeenCalledWith(
      props.speech_model_spec.url,
      props.speech_model_spec.file,
      props.speech_model_spec.sha256,
    );
  });

  it("движок распознавания есть, модели нет — предлагается только модель", () => {
    mocks.desktop = true;
    render(
      <ReadinessCard
        status={status({ speech_found: true, speech_model: null })}
        error={null}
      />,
    );
    expect(screen.queryByRole("button", { name: "Скачать движок распознавания" })).toBeNull();
    expect(screen.getByRole("button", { name: "Скачать модель распознавания" })).toBeTruthy();
  });

  it("ошибка установки whisper не называется готовностью и не мешает повтору", async () => {
    mocks.desktop = true;
    mocks.runtime.mockRejectedValueOnce(new Error("размер или SHA-256 архива движка не совпал"));
    render(<ReadinessCard status={status()} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать движок распознавания" }));
    await waitFor(() =>
      expect(screen.getByText(/SHA-256 архива движка не совпал/)).toBeTruthy(),
    );
    expect(screen.queryByText(/готово:/)).toBeNull();
    const retry = screen.getByRole("button", { name: "Скачать движок распознавания" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
  });

  it("удаление управляемого whisper — только после подтверждения", async () => {
    mocks.desktop = true;
    mocks.remove.mockResolvedValueOnce(undefined);
    render(
      <ReadinessCard
        status={status({
          speech_runtime_managed: true,
          speech_found: true,
          speech_model: "ggml-base.bin",
        })}
        error={null}
      />,
    );
    // Всё установлено — секции «не хватает» нет, но управляемый движок
    // распознавания можно убрать осознанно, как и движок разговора.
    expect(screen.queryByText("Локальное распознавание речи (необязательно)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Удалить движок распознавания" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Удалить движок распознавания" }));
    fireEvent.click(screen.getByRole("button", { name: "Удалить движок распознавания" }));
    await waitFor(() => expect(screen.getByText("движок распознавания удалён")).toBeTruthy());
    expect(mocks.remove).toHaveBeenCalledWith("whisper");
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

  it("одна кнопка качает по порядку и запускает проверку только после скачивания", async () => {
    mocks.desktop = true;
    const order: string[] = [];
    mocks.runtime.mockImplementation(async (kind: string) => {
      order.push(kind);
      return { program: kind };
    });
    mocks.download.mockImplementation(async (_url: string, name: string) => {
      order.push(name);
      return { name, bytes: 1, sha256: "a".repeat(64), verified: true };
    });
    mocks.smoke.mockImplementation(async () => {
      order.push("smoke");
      return { ok: true, answer: "да", note: "текст", model: null, port: 1 };
    });
    const onToVoice = vi.fn();
    render(<ReadinessCard status={status()} error={null} onToVoice={onToVoice} />);

    expect(mocks.runtime).not.toHaveBeenCalled();
    expect(mocks.smoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Скачать недостающее и открыть разговор" }));

    await waitFor(() => expect(onToVoice).toHaveBeenCalledOnce());
    expect(order).toEqual([
      "llama",
      "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
      "whisper",
      "ggml-base.bin",
      "smoke",
    ]);
  });

  it("снятая речь не качает whisper, но разговор всё равно открывает", async () => {
    mocks.desktop = true;
    const order: string[] = [];
    mocks.runtime.mockImplementation(async (kind: string) => {
      order.push(kind);
      return { program: kind };
    });
    mocks.download.mockImplementation(async (_url: string, name: string) => {
      order.push(name);
      return { name, bytes: 1, sha256: "a".repeat(64), verified: true };
    });
    mocks.smoke.mockImplementation(async () => {
      order.push("smoke");
      return { ok: true, answer: "да", note: "текст", model: null, port: 1 };
    });
    const onToVoice = vi.fn();
    render(<ReadinessCard status={status()} error={null} onToVoice={onToVoice} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Включить локальное распознавание/ }));
    fireEvent.click(screen.getByRole("button", { name: "Скачать недостающее и открыть разговор" }));
    await waitFor(() => expect(onToVoice).toHaveBeenCalledOnce());
    expect(order).toEqual(["llama", "Qwen2.5-1.5B-Instruct-Q4_K_M.gguf", "smoke"]);
  });

  it("ошибка на первом шаге не запускает движок", async () => {
    mocks.desktop = true;
    mocks.runtime.mockRejectedValueOnce(new Error("сеть недоступна"));
    const onToVoice = vi.fn();
    render(<ReadinessCard status={status()} error={null} onToVoice={onToVoice} />);
    fireEvent.click(screen.getByRole("button", { name: "Скачать недостающее и открыть разговор" }));
    await waitFor(() => expect(screen.getByText(/сеть недоступна/)).toBeTruthy());
    expect(mocks.smoke).not.toHaveBeenCalled();
    expect(onToVoice).not.toHaveBeenCalled();
  });

  it("нехватка места не предлагает один заход", () => {
    mocks.desktop = true;
    render(<ReadinessCard status={status({ free_bytes: 1000 })} error={null} />);
    expect(screen.queryByRole("button", { name: "Скачать недостающее и открыть разговор" })).toBeNull();
    expect(screen.getByText(/Одним заходом не подготовить/)).toBeTruthy();
    expect(mocks.download).not.toHaveBeenCalled();
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
      // Шаг 221: шаг опроса больше не константа 500 — он зависит от класса машины
      // (без профиля — 1500). Тест не должен знать это число: он проверяет
      // **смысл** — пока запрос не вернулся, второй не уходит.
      const card = render(<ReadinessCard status={status({ download_name: "m.gguf" })} error={null} />);
      // Три шага опроса при первом висящем запросе: если бы наложение было
      // возможно, вызовов стало бы три, а не один.
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      expect(mocks.progress).toHaveBeenCalledOnce();
      // Вернулся — опрос продолжается: «не накладывать» не значит «замолчать».
      const before = mocks.progress.mock.calls.length;
      await act(async () => { finish(100); });
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(mocks.progress.mock.calls.length).toBeGreaterThan(before);
      card.unmount();
    } finally { vi.useRealTimers(); }
  });

  it("при выключенной сети объясняет, а не обвиняет", async () => {
    // Шаг 210: нарочно выключенная сеть — не сбой. Без этой проверки человек
    // видел бы «скачивание не удалось» и решил, что приложение сломалось.
    mocks.desktop = true;
    Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
    render(<ReadinessCard status={status()} error={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Скачать модель" }));

    await waitFor(() => expect(screen.getByText(/без сети не получится/)).toBeTruthy());
    // И ни одного сетевого вызова: узнали заранее, а не после таймаута.
    expect(mocks.download).not.toHaveBeenCalled();

    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  });

  it("отказ без сети называет ту кнопку, которую нажали", async () => {
    // Найденный дефект (шаг 143): на все четыре вида скачивания стоял один текст
    // «скачать модель». Человек жал «Скачать движок распознавания», а читал про
    // модель — и шёл искать, при чём тут модель, вместо «нужна сеть».
    mocks.desktop = true;
    Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
    render(<ReadinessCard status={status({ speech_found: false })} error={null} />);

    const button = screen.getByRole("button", { name: "Скачать движок распознавания" });
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/скачать распознавание речи/)).toBeTruthy());
    // Именно про распознавание: текст про модель здесь был бы ответом на другое
    // действие, и человек искал бы несуществующую связь.
    expect(screen.queryByText(/скачать модель: без сети/)).toBeNull();
    // И до скачивания не дошло: узнали заранее, а не после таймаута.
    expect(mocks.runtime).not.toHaveBeenCalled();

    Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  });
});

describe("обещание «без сети ни одного провала, кроме названного» видно (шаг 220)", () => {
  it("до первого скачивания сказано, что запросов наружу не было", () => {
    // Пустота читалась бы как «не смотрели». Ответ — словом и числом: ноль.
    render(<ReadinessCard status={status()} error={null} />);
    expect(screen.getByTestId("offline-promise").textContent).toContain("не стучалось вовсе");
  });
});

describe("частота замеров идёт от машины (шаг 221)", () => {
  it("на слабой машине опрос реже, и это сказано", async () => {
    vi.useFakeTimers();
    try {
      mocks.desktop = true;
      mocks.progress.mockResolvedValue(200);
      const weak = { cores: 2, ramMb: 4096, gpu: { found: false, vramMb: 0, name: null }, disk: "hdd" as const, at: 0 };
      const card = render(<ReadinessCard status={status({ download_name: "m.gguf" })} error={null} profile={weak} />);
      // 2 секунды при шаге 3 с — ни одного опроса; при прежних 500 мс их было бы
      // четыре. Здесь важно именно число: иначе «редко» останется словом.
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(mocks.progress).toHaveBeenCalledTimes(0);
      card.unmount();
    } finally { vi.useRealTimers(); }

    // И объяснение на экране: молчаливое «редко» читается как «подвисает».
    const weak = { cores: 2, ramMb: 4096, gpu: { found: false, vramMb: 0, name: null }, disk: "hdd" as const, at: 0 };
    render(<ReadinessCard status={status()} error={null} profile={weak} />);
    expect(screen.getByText(/замеры раз в 3 секунды/)).toBeTruthy();
  });

  it("на сильной машине — раз в секунду", async () => {
    vi.useFakeTimers();
    try {
      mocks.desktop = true;
      mocks.progress.mockResolvedValue(200);
      const strong = { cores: 16, ramMb: 65536, gpu: { found: true, vramMb: 16384, name: "RTX" }, disk: "ssd" as const, at: 0 };
      const card = render(<ReadinessCard status={status({ download_name: "m.gguf" })} error={null} profile={strong} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
      expect(mocks.progress.mock.calls.length).toBeGreaterThanOrEqual(1);
      card.unmount();
    } finally { vi.useRealTimers(); }
  });
});
