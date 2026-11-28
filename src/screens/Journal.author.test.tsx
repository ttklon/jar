// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { auditTail, memoryRuns } from "../ipc";
import type { AuditEvent } from "../ipc";
import { Journal } from "./Journal";

/**
 * Шаг 414/71: журнал показывает, чей профиль выполнил дело.
 *
 * Дефект, который это закрывает: журнал помнит, кто **попросил**, и не помнит,
 * от чьего имени **выполнено**. А это разные вещи: расписание хозяина сработало,
 * когда его профиль был в отпуске, — и дело выполнил профиль сына. Без автора
 * журнал говорит «попросила Аня» и врёт про исполнение.
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

function event(patch: Partial<AuditEvent> = {}): AuditEvent {
  return {
    at_ms: Date.now(),
    kind: "requested",
    subject: "files|удалить|папка",
    risk: "dangerous",
    decision: "allow",
    args_fingerprint: "abc",
    outcome: "ok",
    duration_ms: 12,
    ...patch,
  };
}

describe("журнал: кто выполнил", () => {
  it("автор назван, если он известен", async () => {
    vi.mocked(auditTail).mockResolvedValue([event({ author: "Аня" })]);
    vi.mocked(memoryRuns).mockResolvedValue([]);

    render(<Journal />);
    expect(await screen.findByText("кто выполнил")).toBeTruthy();
    expect(screen.getByText("Аня")).toBeTruthy();
  });

  it("нет автора — сказано «профилей тогда не было», а не подставлено «я»", async () => {
    vi.mocked(auditTail).mockResolvedValue([event()]);
    vi.mocked(memoryRuns).mockResolvedValue([]);

    render(<Journal />);
    await screen.findByText("кто выполнил");
    // Догадка в журнале хуже пустоты: подставить «я» значит переписать историю.
    expect(screen.getByText("профилей тогда не было")).toBeTruthy();
  });
});
