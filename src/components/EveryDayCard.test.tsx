// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EveryDayCard, doneOf } from "./EveryDayCard";
import type { RunRecord } from "../ipc";

/**
 * «Каждый день в это время» (шаги 332/329).
 *
 * Два дефекта, которые закрывает правило: форма расписания («настройте крон») и
 * тихий запуск в первый месяц.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

let runs: RunRecord[] = [];
let added: { what: string; cadence: string; minute: number }[] = [];

vi.mock("../ipc", () => ({
  isTauri: () => true,
  memoryRuns: async () => runs,
  scheduleAdd: async (what: string, cadence: string, minute: number) => {
    added.push({ what, cadence, minute });
    return [{ id: "1", what, cadence, minute, paused: false, policy: "ask", when: "каждый день" }];
  },
}));

afterEach(() => {
  cleanup();
  runs = [];
  added = [];
});

function run(patch: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 1,
    kind: "tool",
    subject: "уборка загрузок",
    started_ms: new Date(2026, 10, 20, 9, 12).getTime(),
    finished_ms: new Date(2026, 10, 20, 9, 13).getTime(),
    outcome: "ok",
    steps: [{ position: 1, tool: "files|удалить|загрузки", ok: true, reason: "", evidence: "C:\\Users\\me\\Downloads" }],
    ...patch,
  };
}

describe("карточка «Каждый день»", () => {
  it("без выполненного дела кнопки нет: пустой список — не место для формы", async () => {
    render(<EveryDayCard />);
    expect(
      await screen.findByText(/кнопка появляется после первого дела, а не в пустом списке/),
    ).toBeTruthy();
  });

  it("время берётся из дела, а не из «круглого» часа", async () => {
    runs = [run()];
    render(<EveryDayCard />);
    // Дело было в 09:12 — правило будет в 09:12.
    expect(await screen.findByText(/каждый день в 09:12: уборка загрузок/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Каждый день в 09:12" })).toBeTruthy();
  });

  it("путь в деле назван заранее: файла завтра может не быть", async () => {
    runs = [run()];
    render(<EveryDayCard />);
    expect(
      await screen.findByText(/если его не будет, дело пропустится с причиной, а не упадёт/),
    ).toBeTruthy();
  });

  it("нажатие создаёт расписание по-настоящему", async () => {
    runs = [run()];
    render(<EveryDayCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Каждый день в/ }));

    await waitFor(() => expect(added.length).toBe(1));
    expect(added[0]?.cadence).toBe("daily");
    expect(await screen.findByText(/правило создано/)).toBeTruthy();
  });

  it("неподтверждённое дело не автоматизируется", () => {
    // Никогда не подтверждали — значит повторять нечего.
    expect(doneOf(run({ outcome: "denied" })).confirmed).toBe(false);
    expect(doneOf(run()).confirmed).toBe(true);
  });

  it("первый месяц правило показывает себя, а не спрашивает", async () => {
    runs = [run()];
    render(<EveryDayCard />);
    expect(
      await screen.findByText(/в первый месяц автоматизация показывает себя, а не спрашивает разрешения/),
    ).toBeTruthy();
  });

  it("месяц без показов — не зрелость", async () => {
    runs = [run()];
    render(<EveryDayCard />);
    expect(
      await screen.findByText(/срабатывало 1 раз: нужен 5 показов — месяц прошёл, а опыта почти нет/),
    ).toBeTruthy();
  });
});
