// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeedCard } from "./DeedCard";
import type { Deed } from "../lib/deed";

/**
 * Шаг 361. Проверяется то, за что карточку и делали: лента не превращается в
 * простыню, доказательство видно, а кнопки есть только у того, что они делают.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function deed(patch: Partial<Deed> = {}): Deed {
  return {
    id: 7,
    subject: "разобрать «Загрузки» по папкам",
    kind: "plan",
    startedMs: Date.UTC(2026, 10, 20, 12, 34),
    finishedMs: Date.UTC(2026, 10, 20, 12, 35),
    outcome: "ok",
    steps: [
      { position: 1, tool: "files|создать|папку", ok: true, evidence: "folder-created" },
      { position: 2, tool: "files|перенести|файлы", ok: true },
    ],
    ...patch,
  };
}

describe("карточка дела", () => {
  it("в ленте она одна строка, а подробности — по нажатию", () => {
    // Лента из развёрнутых карточек — простыня, в которой не найти «что было
    // вчера». Поэтому по умолчанию видна только строка.
    render(<DeedCard deed={deed()} />);
    expect(screen.getByRole("button", { name: /разобрать «Загрузки»/ })).toBeTruthy();
    expect(screen.queryByText(/Вид дела/)).toBeNull();
    expect(screen.queryByText(/folder-created/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /разобрать «Загрузки»/ }));
    expect(screen.getByText("разобрать «Загрузки» по папкам")).toBeTruthy();
    expect(screen.getByText(/folder-created/)).toBeTruthy();
  });

  it("у шага без доказательства написано «не проверено», а не пусто", () => {
    // Пустота читалась бы как «проверка прошла молча».
    render(<DeedCard deed={deed()} startOpen />);
    expect(screen.getByText(/не проверено/)).toBeTruthy();
  });

  it("пропущенный шаг не выдаётся за выполненный", () => {
    render(
      <DeedCard
        deed={deed({
          outcome: "failed",
          finishedMs: 1,
          steps: [
            { position: 1, tool: "files|создать|папку", ok: true, status: "skipped", reason: "сделано раньше" },
            { position: 2, tool: "files|перенести|файлы", ok: false, reason: "нет прав" },
          ],
        })}
        startOpen
      />,
    );
    expect(screen.getByText(/сделано раньше/)).toBeTruthy();
    expect(screen.getByText(/нет прав/)).toBeTruthy();
  });

  it("у готового дела нет кнопки «Отменить»", () => {
    // Отменять нечего, а человек будет жать и ждать.
    const onCancel = vi.fn();
    render(<DeedCard deed={deed()} onCancel={onCancel} startOpen />);
    expect(screen.queryByRole("button", { name: "Отменить" })).toBeNull();
  });

  it("у идущего дела «Отменить» есть и работает", () => {
    const onCancel = vi.fn();
    render(
      <DeedCard
        deed={deed({ outcome: "running", finishedMs: null })}
        onCancel={onCancel}
        startOpen
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("«Повторить» есть у плана и нет у скачивания — с причиной", () => {
    const onRepeat = vi.fn();
    render(<DeedCard deed={deed()} onRepeat={onRepeat} startOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRepeat).toHaveBeenCalledTimes(1);
    cleanup();

    render(
      <DeedCard
        deed={deed({ kind: "download", subject: "модель", steps: [] })}
        onRepeat={onRepeat}
        startOpen
      />,
    );
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
    expect(screen.getByText(/Повторить нельзя/)).toBeTruthy();
  });

  it("во время идущего дела повтор не предлагается", () => {
    render(
      <DeedCard deed={deed({ outcome: "running", finishedMs: null })} onRepeat={vi.fn()} startOpen />,
    );
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
    // «Ещё идёт» звучит и в причине, и в строке — обе правдивы.
    expect(screen.getAllByText(/ещё идёт/).length).toBeGreaterThan(0);
  });

  it("отчёт копируется текстом, а не скриншотом", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<DeedCard deed={deed()} startOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Скопировать отчёт" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const payload = String(writeText.mock.calls[0]?.[0]);
    expect(payload).toContain("Дело: разобрать «Загрузки» по папкам");
    expect(payload).toContain("доказательство: folder-created");
    // И человеку сказано, что копирование удалось, — а не тишина.
    expect(await screen.findByText(/отчёт скопирован/)).toBeTruthy();
  });

  it("из дела есть переход к откату — но только у дела со сессией", () => {
    // Шаг 364. Откат отменяет работу сессии; у дела без сессии вести некуда,
    // и кнопка, которая приведёт к чужому, хуже её отсутствия.
    const onOpenUndo = vi.fn();
    render(
      <DeedCard
        deed={deed({ session: "2026-11-20T12:34" })}
        onOpenUndo={onOpenUndo}
        startOpen
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Откатить эту сессию" }));
    expect(onOpenUndo).toHaveBeenCalledTimes(1);
    cleanup();

    render(<DeedCard deed={deed()} onOpenUndo={onOpenUndo} startOpen />);
    expect(screen.queryByRole("button", { name: "Откатить эту сессию" })).toBeNull();
  });

  it("без обработчика ссылок нет: обещать переход некуда", () => {
    render(<DeedCard deed={deed({ session: "s" })} startOpen />);
    expect(screen.queryByRole("button", { name: "Откатить эту сессию" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Показать в журнале" })).toBeNull();
  });

  it("без буфера обмена не делается вид, что скопировали", async () => {
    vi.stubGlobal("navigator", {});
    render(<DeedCard deed={deed()} startOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Скопировать отчёт" }));
    expect(await screen.findByText(/буфер обмена недоступен/)).toBeTruthy();
  });
});
