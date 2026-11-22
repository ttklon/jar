// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { auditTail, memoryRuns } from "../ipc";
import type { RunRecord } from "../ipc";
import { Journal } from "./Journal";

/**
 * Память и журнал — два разных источника, и экран обязан показывать оба.
 * Здесь проверяется именно память: запуск, его шаги и честное «идёт» вместо
 * придуманной длительности.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  auditTail: vi.fn(),
  memoryRuns: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(auditTail).mockReset();
  vi.mocked(memoryRuns).mockReset();
});

function run(patch: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 7,
    kind: "tool",
    // Тема — словами человека, а не ключом инструмента: иначе она совпадает
    // с именем шага, и по экрану не понять, где что.
    subject: "Собрать папку под отчёты",
    started_ms: Date.UTC(2026, 10, 8, 9, 0, 0),
    finished_ms: Date.UTC(2026, 10, 8, 9, 0, 2),
    outcome: "ok",
    steps: [
      {
        position: 0,
        tool: "files|создать|папку",
        ok: true,
        reason: "папка создана",
        evidence: "path_exists",
      },
    ],
    ...patch,
  };
}

describe("экран «История»: запуски из памяти", () => {
  it("показывает запуск, его шаг и длительность", async () => {
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([run()]);

    render(<Journal />);

    await waitFor(() => {
      expect(screen.getByText("files|создать|папку")).toBeTruthy();
    });
    expect(screen.getByText(/инструмент/)).toBeTruthy();
    expect(screen.getByText(/path_exists/)).toBeTruthy();
    expect(screen.getByText(/2000 мс/)).toBeTruthy();
  });

  it("незакрытый запуск говорит «идёт», а не ноль миллисекунд", async () => {
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([
      run({ finished_ms: null, outcome: "running", steps: [] }),
    ]);

    render(<Journal />);

    await waitFor(() => {
      // «Идёт» звучит и в строке дела, и в причине «повторить нельзя».
      expect(screen.getAllByText(/идёт/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/без шагов/)).toBeTruthy();
  });

  it("пустой экран дел — приглашение, а не тупик", async () => {
    // Шаг 366: «Пока пусто» без продолжения оставляет человека без выхода.
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([]);
    const onOpenAsk = vi.fn();

    render(<Journal onOpenAsk={onOpenAsk} />);

    await waitFor(() => {
      expect(screen.getByText(/Пока пусто — запусков ещё не было/)).toBeTruthy();
    });
    // Сказано и что это за место, и что делать дальше, и как это звучит.
    // Все три нужны: без первого непонятно, куда попал; без второго —
    // тупик; без третьего — неясно, какой фразой начинать.
    expect(screen.getByText(/Здесь появятся дела/)).toBeTruthy();
    expect(screen.getByText(/Скажите первое дело словами/)).toBeTruthy();
    expect(screen.getByLabelText("Разбери «Загрузки» по папкам")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Открыть «Спросить»" }));
    expect(onOpenAsk).toHaveBeenCalledTimes(1);

    // Поле — пример, а не форма: нажатие тоже ведёт туда, где работает.
    fireEvent.click(screen.getByLabelText("Разбери «Загрузки» по папкам"));
    expect(onOpenAsk).toHaveBeenCalledTimes(2);
  });

  it("лента из нескольких дел — строки, а подробности по нажатию", async () => {
    // Шаг 362: развёрнутые карточки превращают ленту в простыню, в которой
    // «что было вчера про диск» не найти.
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([
      run({ id: 1, subject: "Уборка в Загрузках" }),
      run({ id: 2, subject: "Собрать отчёт за неделю", steps: [] }),
    ]);

    render(<Journal />);

    await waitFor(() => {
      // В свёрнутой строке тема внутри кнопки — берём её как имя кнопки.
      expect(screen.getByRole("button", { name: /Уборка в Загрузках/ })).toBeTruthy();
    });
    // Подробностей в ленте нет, пока не нажали.
    expect(screen.queryByText("files|создать|папку")).toBeNull();
    expect(screen.queryByText(/Вид дела/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Уборка в Загрузках/ }));
    expect(screen.getByText("files|создать|папку")).toBeTruthy();
    expect(screen.getByText(/Вид дела/)).toBeTruthy();
    // Второе дело при этом остаётся свёрнутым: раскрытие — по одному.
    expect(screen.getByRole("button", { name: /Собрать отчёт за неделю/ })).toBeTruthy();
  });

  it("сломанная память не скрывает журнал", async () => {
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockRejectedValue(new Error("база занята"));

    render(<Journal />);

    await waitFor(() => {
      expect(screen.getByText(/Пока пусто — запусков ещё не было/)).toBeTruthy();
    });
  });
});
