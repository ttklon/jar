// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Schedule } from "./Schedule";

/**
 * Экран «Расписание» (шаги 321 и 327).
 *
 * Проверяется глазами человека: фразу говорят словами, непонятная фраза не
 * превращается в правило, список приходит из ядра, пауза и отмена стоят на
 * строке и объясняются словами.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

type Row = { id: string; what: string; cadence: string; minute: number; paused: boolean; when: string };

let rows: Row[] = [];
const tauri = vi.fn(() => true);

vi.mock("../ipc", () => ({
  isTauri: () => tauri(),
  schedules: async () => rows,
  scheduleAdd: async (what: string, cadence: string, minute: number) => {
    const when = cadence === "hourly" ? "каждый час в :00" : `каждый день в ${String(Math.floor(minute / 60)).padStart(2, "0")}:00`;
    rows = [...rows, { id: `${cadence}:${minute}:${what}`, what, cadence, minute, paused: false, when }];
    return rows;
  },
  schedulePause: async (id: string, paused: boolean) => {
    rows = rows.map((row) => (row.id === id ? { ...row, paused } : row));
    return rows;
  },
  scheduleRemove: async (id: string) => {
    rows = rows.filter((row) => row.id !== id);
    return rows;
  },
}));

beforeEach(() => {
  rows = [];
  tauri.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("экран расписания", () => {
  it("пустой список говорит об этом словами, а не пустым экраном", async () => {
    render(<Schedule />);
    expect(await screen.findByText(/расписаний нет: скажите «каждый день в 9/)).toBeTruthy();
  });

  it("фраза человека становится расписанием и подтверждается словами", async () => {
    render(<Schedule />);
    await screen.findByText(/расписаний нет/);

    fireEvent.change(screen.getByLabelText("расписание фразой"), {
      target: { value: "каждый день в 9 — отчёт о диске" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/добавлено: каждый день в 09:00 — отчёт о диске/));
    // Список показывает то же, что вернуло ядро (подпись строки — словами правила).
    expect(screen.getByText(/\[включено\]; последний раз ещё не запускалось/)).toBeTruthy();
    expect(screen.getByText(/всего 1, на паузе 0/)).toBeTruthy();
  });

  it("непонятная фраза — вопрос, а не правило, которое молча не сработает", async () => {
    render(<Schedule />);
    await screen.findByText(/расписаний нет/);

    fireEvent.change(screen.getByLabelText("расписание фразой"), { target: { value: "отчёт о диске" } });
    fireEvent.click(screen.getByRole("button", { name: "добавить" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/не понял, когда/));
    expect(rows).toHaveLength(0);
  });

  it("пауза и отмена стоят на строке и объясняются словами", async () => {
    rows = [{ id: "daily:540:отчёт", what: "отчёт о диске", cadence: "daily", minute: 540, paused: false, when: "каждый день в 09:00" }];
    render(<Schedule />);
    await screen.findByText(/\[включено\]; последний раз ещё не запускалось/);

    fireEvent.click(screen.getByRole("button", { name: "пауза" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/на паузе: срабатывать не будет/));
    expect(screen.getByText(/на паузе 1/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "отменить: отчёт о диске" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/отменено: «отчёт о диске»/));
    expect(rows).toHaveLength(0);
  });

  it("в браузере не обещает расписание: список ведёт приложение", async () => {
    tauri.mockReturnValue(false);
    render(<Schedule />);
    expect(await screen.findByText(/в браузере расписаний нет/)).toBeTruthy();
  });
});
