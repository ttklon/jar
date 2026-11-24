// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { auditTail } from "../ipc";
import type { AuditEvent } from "../ipc";
import { Journal } from "./Journal";

/**
 * Шаг 343 на экране: «Что болит» — по причинам, а не по времени.
 *
 * Зачем тест. Группировка живёт в `src/lib/journal.ts` и проверена отдельно;
 * здесь проверяется то, чего правило не обещает: что блок действительно стоит
 * на экране, что он называет число и время, и что у здорового журнала его нет.
 * Блок без числа бесполезен, а блок при нуле ошибок — шум.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  auditTail: vi.fn(),
  memoryRuns: vi.fn().mockResolvedValue([]),
  searchEpisodes: vi.fn().mockResolvedValue([]),
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
});

function event(outcome: string, atMs: number): AuditEvent {
  return {
    at_ms: atMs,
    kind: "finished",
    subject: "files|move|Загрузки",
    risk: "read",
    decision: "allow",
    args_fingerprint: "abc",
    outcome,
    duration_ms: 12,
  };
}

describe("«Что болит» в истории", () => {
  it("складывает одинаковые причины и говорит, сколько раз", async () => {
    vi.mocked(auditTail).mockResolvedValue([
      event("error: нет сети", 1_700_000_000_000),
      event("error: could not resolve host", 1_700_000_060_000),
      event("ok", 1_700_000_120_000),
    ]);
    render(<Journal />);

    await screen.findByText("Что болит");
    // Три строки журнала — одна причина и число: «2 раза», а не две строки.
    expect(screen.getByText("нет сети")).toBeTruthy();
    expect(screen.getByText(/2 раза/)).toBeTruthy();
    expect(screen.getByText(/последний в/)).toBeTruthy();
    // Успех — не боль: в блоке его нет. В таблице журнала он остаётся, и это
    // правильно: журнал показывает всё, а «Что болит» — только отказы.
    expect(screen.getByLabelText("Что болит").querySelector("li")?.textContent).not.toContain("ok");
  });

  it("у здорового журнала блока нет", async () => {
    // Блок при нуле ошибок — шум, который через неделю начинают игнорировать.
    vi.mocked(auditTail).mockResolvedValue([event("ok", 1_700_000_000_000)]);
    render(<Journal />);

    // Ищем в таблице журнала: с шага 176 та же строка встречается ещё и в
    // строке «опасное сверху», и это не «болит».
    await screen.findByRole("cell", { name: "files|move|Загрузки" });
    expect(screen.queryByText("Что болит")).toBeNull();
  });

  it("разные причины — разные строки, частое впереди", async () => {
    vi.mocked(auditTail).mockResolvedValue([
      event("error: файл занят", 1_700_000_000_000),
      event("error: не хватает прав", 1_700_000_060_000),
      event("error: нет сети", 1_700_000_120_000),
      event("error: network unreachable", 1_700_000_180_000),
    ]);
    render(<Journal />);

    await screen.findByText("Что болит");
    const pains = screen.getByLabelText("Что болит");
    const items = pains.querySelectorAll("li");
    expect(items).toHaveLength(3);
    // Первым — то, что было дважды.
    expect(items[0]!.textContent).toContain("нет сети");
    expect(items[0]!.textContent).toContain("2 раза");
  });
});
