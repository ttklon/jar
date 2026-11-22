// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { listModels, startEngine } from "../ipc";
import type { ModelFile } from "../ipc";
import { Models } from "./Models";

/**
 * Шаги 348 и 350: повреждённая модель ловится до запуска и объясняется словами.
 *
 * Зачем тест. Ядро теперь сверяет хеш модели перед запуском движка — но если
 * экран съест причину и покажет «не удалось запустить», человек останется без
 * ответа на вопрос «что делать». Проверяем не то, что ошибка есть, а то, что
 * в ней видно **что случилось** и **что с этим делать**.
 */

vi.mock("../ipc", () => ({
  networkAddresses: async () => [],
  readinessStatus: async () => {
    throw new Error("статус недоступен в этом тесте");
  },
  isTauri: () => true,
  listModels: vi.fn(),
  verifyModel: vi.fn(),
  downloadModel: vi.fn(),
  removeModel: vi.fn(),
  // `found: true` — иначе блок запуска не рисуется вовсе и тест проверяет не
  // тот путь (первая версия искала кнопку, которой не было).
  engineStatus: vi.fn().mockResolvedValue({
    found: true,
    program: "C:/Data/sidecars/llama-server.exe",
    search_dir: "C:/Data/sidecars",
    running: false,
    port: 0,
    pid: 0,
    model: "",
    note: "",
  }),
  startEngine: vi.fn(),
  stopEngine: vi.fn(),
  listRoles: vi.fn().mockResolvedValue([]),
  assignRole: vi.fn(),
  clearRole: vi.fn(),
  removeEverything: vi.fn(),
  probeNetwork: vi.fn().mockResolvedValue([]),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(startEngine).mockReset();
});

const FILE: ModelFile = {
  name: "model.gguf",
  size_bytes: 986048768,
  ok: true,
  note: "GGUF v3, 291 тензор",
  version: 3,
  tensors: 291,
  architecture: "qwen2",
  quant: "Q4_K_M",
  hash: "abc",
};

beforeEach(() => {
  // Поля — как у ядра: `items`, а не `files`, иначе экран не находит модель
  // для запуска и тест проверяет не тот путь.
  vi.mocked(listModels).mockResolvedValue({
    dir: "C:/Data/models",
    items: [FILE],
    error: null,
    total_bytes: FILE.size_bytes,
    free_bytes: 50 * 1024 * 1024 * 1024,
  });
});

describe("повреждённая модель до запуска", () => {
  it("показывает причину и что сделать, а не «не удалось запустить»", async () => {
    vi.mocked(startEngine).mockRejectedValue(
      new Error(
        "файл модели повреждён или подменён: ожидали abc, получили def. " +
          "Скачайте модель заново: «Модели» → «Скачать модель»",
      ),
    );
    render(<Models />);

    const start = await screen.findByRole("button", { name: /Запустить/ });
    fireEvent.click(start);

    // На экране может быть несколько alert (готовность, движок). Ищем именно
    // ответ на запуск, а не первый alert подряд.
    const alert = await screen.findByText(/повреждён/);
    const text = alert.textContent ?? "";
    // Что случилось.
    expect(text).toContain("повреждён");
    // Что делать.
    expect(text).toContain("Скачайте модель заново");
    // И что это не загадка: названы оба хеша.
    expect(text).toContain("ожидали abc");
  });

  it("про запуск, который не удался, сказано честно: движок не работает", async () => {
    // После отказа движок не должен выглядеть запущенным — иначе человек
    // будет ждать ответа от процесса, которого нет.
    vi.mocked(startEngine).mockRejectedValue(new Error("файл модели повреждён"));
    render(<Models />);

    fireEvent.click(await screen.findByRole("button", { name: /Запустить/ }));
    await screen.findByText(/повреждён/);

    // Кнопка снова доступна: повтор после скачивания — обычный путь.
    expect(screen.getByRole("button", { name: /Запустить/ })).toBeTruthy();
  });
});
