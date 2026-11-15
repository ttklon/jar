// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { undoApply, undoReport } from "../ipc";
import type { UndoPreview } from "../ipc";
import { UndoCard } from "./Undo";

/**
 * Откат — единственное место, где приложение само возвращает файлы. Поэтому проверяется
 * не вёрстка, а три правила: список виден до нажатия, нажатие требует второго щелчка,
 * и итог говорит числами, а не словом «успешно».
 */

vi.mock("../ipc", () => ({
  undoReport: vi.fn(),
  undoApply: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(undoReport).mockReset();
  vi.mocked(undoApply).mockReset();
});

const NOTE =
  "откатываются переносы и переименования этой сессии; запись в файл, копия, сжатие, " +
  "скачивание и корзина — нет";

function preview(patch: Partial<UndoPreview> = {}): UndoPreview {
  return {
    session: "abc",
    note: NOTE,
    steps: [
      {
        entry: { at: 1, session: "abc", kind: "move", from: "C:\\a\\файл.txt", to: "C:\\b\\файл.txt" },
        refusal: null,
      },
    ],
    ...patch,
  };
}

describe("карточка отката", () => {
  it("показывает, что вернётся, до нажатия — и оговорку рядом", async () => {
    vi.mocked(undoReport).mockResolvedValue(preview());

    render(<UndoCard />);

    await waitFor(() =>
      expect(screen.getByText(/перенос: C:\\a\\файл.txt → C:\\b\\файл.txt/)).toBeTruthy(),
    );
    expect(
      screen.getByText(/запись в файл, копия, сжатие, скачивание и корзина — нет/),
    ).toBeTruthy();
    // Ни один шаг ещё не выполнен.
    expect(undoApply).not.toHaveBeenCalled();
  });

  it("требует второго щелчка: первый только взводит кнопку", async () => {
    vi.mocked(undoReport).mockResolvedValue(preview());
    vi.mocked(undoApply).mockResolvedValue({ session: "abc", undone: 1, refused: [] });

    render(<UndoCard />);

    fireEvent.click(await screen.findByRole("button", { name: "Откатить дел: 1" }));
    expect(undoApply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Точно откатить?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Точно откатить?" }));

    await waitFor(() => expect(undoApply).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("откачено дел: 1")).toBeTruthy();
  });

  it("«не надо» отменяет взвод и ничего не делает", async () => {
    vi.mocked(undoReport).mockResolvedValue(preview());

    render(<UndoCard />);

    fireEvent.click(await screen.findByRole("button", { name: "Откатить дел: 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Не надо" }));

    expect(undoApply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Откатить дел: 1" })).toBeTruthy();
  });

  it("шаг с причиной показан, но кнопки для него нет", async () => {
    vi.mocked(undoReport).mockResolvedValue(
      preview({
        steps: [
          {
            entry: { at: 2, session: "abc", kind: "move", from: "C:\\a", to: "C:\\b" },
            refusal: "старое место занято: C:\\a — перезаписывать не буду",
          },
        ],
      }),
    );

    render(<UndoCard />);

    await waitFor(() =>
      expect(screen.getByText(/старое место занято/)).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: /Откатить дел/ })).toBeNull();
  });

  it("пустая сессия говорит «откатывать нечего», а не показывает пустой список", async () => {
    vi.mocked(undoReport).mockResolvedValue(preview({ steps: [] }));

    render(<UndoCard />);

    await waitFor(() => expect(screen.getByText(/откатывать нечего/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Откатить дел/ })).toBeNull();
  });

  it("недоступный журнал назван причиной, а не пустым списком", async () => {
    vi.mocked(undoReport).mockRejectedValue(new Error("журнал отката не открыт"));

    render(<UndoCard />);

    await waitFor(() =>
      expect(screen.getByText(/журнал отката недоступен: журнал отката не открыт/)).toBeTruthy(),
    );
  });

  it("отказ в итоге перечислен: сколько и почему", async () => {
    vi.mocked(undoReport).mockResolvedValue(preview());
    vi.mocked(undoApply).mockResolvedValue({
      session: "abc",
      undone: 0,
      refused: ["перенос: C:\\a → C:\\b: старое место занято"],
    });

    render(<UndoCard />);

    fireEvent.click(await screen.findByRole("button", { name: "Откатить дел: 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Точно откатить?" }));

    await waitFor(() => expect(screen.getByText("не откатилось: 1")).toBeTruthy());
    // Причина отказа пришла из ядра и показана как есть.
    expect(screen.getAllByText(/старое место занято/).length).toBeGreaterThan(0);
  });
});
