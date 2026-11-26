// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeekStatsCard, summaryOf, toDeeds } from "./WeekStatsCard";

/**
 * Шаг 44: «как у меня дела» — числа за неделю, а не процент плана.
 *
 * Два модуля говорили об одном (myStats и weekCounters); здесь проверяется
 * сводка и то, что отмены не выдают себя за отказы.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

vi.mock("../ipc", () => ({
  memoryRuns: vi.fn().mockResolvedValue([]),
}));

afterEach(cleanup);

const now = new Date(2026, 10, 20, 12).getTime();

describe("как у меня дела", () => {
  it("отмена не считается отказом", () => {
    const deeds = toDeeds([
      { started_ms: now, outcome: "ok", finished_ms: now + 1 },
      { started_ms: now, outcome: "cancelled", finished_ms: now + 1 },
      { started_ms: now, outcome: "failed", finished_ms: now + 1 },
    ]);
    const got = summaryOf(
      [
        { started_ms: now, outcome: "ok", finished_ms: now + 1 },
        { started_ms: now, outcome: "cancelled", finished_ms: now + 1 },
        { started_ms: now, outcome: "failed", finished_ms: now + 1 },
      ],
      now,
    );
    expect([got.now.done, got.now.failed, got.now.cancelled]).toEqual([1, 1, 1]);
    expect(deeds).toHaveLength(3);
  });

  it("сэкономленное время не выдумывается: его нет, и строка не появляется", () => {
    const got = summaryOf([{ started_ms: now, outcome: "ok", finished_ms: now + 1 }], now);
    expect(got.now.savedMs).toBeNull();
    expect(got.now.said).not.toMatch(/сэкономлено/);
  });

  it("пустая неделя — «нечего считать», а не аккуратный ноль", () => {
    const got = summaryOf([], now);
    expect(got.now.said).toBe("пока нечего считать: дел за неделю не было");
  });

  it("карточка называет себя и не показывает процентов", () => {
    render(<WeekStatsCard />);
    expect(screen.getByText("Как у меня дела")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
