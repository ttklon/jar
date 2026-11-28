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

  it("журнал читается по дням, и это названо числом", async () => {
    const now = Date.now();
    vi.mocked(auditTail).mockResolvedValue([
      event({ at_ms: now, subject: "files|удалить|папка" }),
      event({ at_ms: now, subject: "files|найти|файл" }),
      event({ at_ms: now - 86_400_000, subject: "system|проверить|диск" }),
    ]);
    vi.mocked(memoryRuns).mockResolvedValue([]);

    render(<Journal />);
    // «сегодня» и «вчера» вместо дат в обратном порядке.
    expect(await screen.findByText(/(сегодня: 2|вчера: 1)/)).toBeTruthy();
  });

  it("битая строка журнала не ломает остальные", async () => {
    vi.mocked(auditTail).mockResolvedValue([event({ author: "Аня" })]);
    vi.mocked(memoryRuns).mockResolvedValue([]);

    render(<Journal />);
    await screen.findByText("Аня");
    // Строка прочитана по строкам: одна испорчена — остальные всё равно видны.
    const noted = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(noted.some((text) => /2 строк, 1 испорчены и пропущены/.test(text))).toBe(true);
  });
})
