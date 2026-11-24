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
  runCustomHand: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => cleanup());

describe("привнесённые руки", () => {
  it("показывает свою руку отдельно и говорит, как она исполняется", async () => {
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
    expect(screen.getByText(/только в клетке и только там, где встроенной руки нет/)).toBeTruthy();
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

  it("запускает свою руку только в клетке и показывает отчёт", async () => {
    const { customHands, runCustomHand } = await import("../ipc");
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
    vi.mocked(runCustomHand).mockResolvedValueOnce({
      key: "k",
      ran: true,
      ok: true,
      exit_code: 0,
      stdout: "Name Free\nC 42",
      stderr: "",
      timed_out: false,
      cell: "клетка: AppContainer, без сети",
      duration_ms: 90,
      note: "проба прошла: код 0",
      created_ms: 2,
    });

    render(<Hands />);
    fireEvent.click(await screen.findByText("Запустить в клетке"));

    await waitFor(() => expect(vi.mocked(runCustomHand)).toHaveBeenCalledWith("k"));
    await waitFor(() => expect(screen.getByText(/AppContainer, без сети/)).toBeTruthy());
  });

  it("без клетки запуск не состоялся — и это сказано, а не замазано", async () => {
    const { customHands, runCustomHand } = await import("../ipc");
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
    vi.mocked(runCustomHand).mockRejectedValueOnce(
      new Error("клетка не открылась: ERROR_BAD_ENVIRONMENT; чужой текст без забора не запускается — ничего не выполнялось"),
    );

    render(<Hands />);
    fireEvent.click(await screen.findByText("Запустить в клетке"));

    await waitFor(() => expect(screen.getByText(/запуск не состоялся/)).toBeTruthy());
    expect(screen.getByText(/ERROR_BAD_ENVIRONMENT/)).toBeTruthy();
  });

  it("выход за разрешённую папку виден на экране рук и объяснён (шаг 170)", async () => {
    // Дефект: `..` в пути выводил наружу, и человек узнавал об этом отказом после
    // запуска, а не до него.
    localStorage.setItem("jar.folders", JSON.stringify({ folders: ["C:\\Фото"], except: [] }));
    const { customHands } = await import("../ipc");
    vi.mocked(customHands).mockResolvedValueOnce([
      {
        key: "k",
        title: "почистить фото",
        code: "Remove-Item 'C:\\Фото\\..\\Windows\\a.dll'",
        risk: "destructive",
        source: "проверен в клетке",
        created_ms: 1,
      },
    ]);

    render(<Hands />);
    // Причина названа словами, а не «нельзя».
    await waitFor(() => expect(screen.getByText(/^отказ: вне выбранных папок/)).toBeTruthy());
    expect(screen.getByText(/не внутри C:\\Фото/)).toBeTruthy();
    localStorage.removeItem("jar.folders");
  });

  it("путь внутри разрешённой папки отказа не получает — иначе предупреждение станет шумом", async () => {
    localStorage.setItem("jar.folders", JSON.stringify({ folders: ["C:\\Фото"], except: [] }));
    const { customHands } = await import("../ipc");
    vi.mocked(customHands).mockResolvedValueOnce([
      {
        key: "k",
        title: "переименовать фото",
        code: "Rename-Item 'C:\\Фото\\a.jpg' 'b.jpg'",
        risk: "write-local",
        source: "проверен в клетке",
        created_ms: 1,
      },
    ]);

    render(<Hands />);
    await waitFor(() => expect(screen.getByText(/Rename-Item/)).toBeTruthy());
    expect(screen.queryByText(/^отказ: вне выбранных папок/)).toBeNull();
    localStorage.removeItem("jar.folders");
  });

  it("пустой список говорит, что своих рук нет", async () => {
    const { customHands } = await import("../ipc");
    vi.mocked(customHands).mockResolvedValueOnce([]);

    render(<Hands />);
    await waitFor(() => expect(screen.getByText("привнесённых рук нет")).toBeTruthy());
  });
});
