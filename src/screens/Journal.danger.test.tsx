// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { auditTail } from "../ipc";
import type { AuditEvent } from "../ipc";
import { Journal } from "./Journal";

/**
 * Шаг 166 на экране: журнал отвечает не только «что случилось», но и «что из
 * опасного **реально** проверено».
 *
 * Дефект: чтобы это узнать, человек листал двадцать строк и складывал в голове,
 * и «запросили и отказали» выглядело как «проверяли».
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

function event(over: Partial<AuditEvent>): AuditEvent {
  return {
    at_ms: 1_700_000_000_000,
    kind: "finished",
    subject: "files|удалить|папку",
    risk: "destructive",
    decision: "allow",
    args_fingerprint: "abc",
    outcome: "ok",
    duration_ms: 12,
    ...over,
  };
}

describe("опасное выше обычного в журнале (шаг 176)", () => {
  it("опасное сверху, обычное ниже, и это видно по порядку строк", async () => {
    // Дефект: плоская лента отвечает «что было позже», а спрашивают «не случилось
    // ли чего». Старое удаление должно стоять выше свежего чтения.
    vi.mocked(auditTail).mockResolvedValue([
      event({ at_ms: 1_700_000_900_000, subject: "files|прочитать|файл", risk: "read", kind: "finished" }),
      event({ at_ms: 1_700_000_100_000, subject: "files|удалить|папку", risk: "destructive", kind: "finished" }),
    ]);
    render(<Journal />);

    // Сказано числом, сколько смотреть.
    await screen.findByText(/опасных 1 из 2 — они сверху, остальное ниже по времени/);
    // И первой строкой — ответ, а не загадка.
    expect(screen.getByText(/сверху опасное: «files\|удалить\|папку» \(destructive\) — ok/)).toBeTruthy();

    // Порядок в таблице: опасное раньше обычного, хотя оно старше.
    const cells = screen.getAllByRole("cell").filter((cell) => cell.textContent?.includes("|"));
    expect(cells[0]!.textContent).toBe("files|удалить|папку");
    expect(cells[1]!.textContent).toBe("files|прочитать|файл");
  });

  it("опасного нет — сказано прямо, чтобы не листали зря", async () => {
    vi.mocked(auditTail).mockResolvedValue([event({ subject: "files|прочитать|файл", risk: "read" })]);
    render(<Journal />);
    await screen.findByText(/опасного нет: 1 событие — все обычные, читать подряд незачем/);
    expect(screen.getByText(/опасного не было: последнее — обычное «files\|прочитать\|файл»/)).toBeTruthy();
  });
});

describe("аудит опасных рук в журнале", () => {
  it("называет, сколько опасного проверено запуском, а сколько нет", async () => {
    vi.mocked(auditTail).mockResolvedValue([
      event({ kind: "started", outcome: "" }),
      event({ kind: "finished", outcome: "ok" }),
      // Политика отказала — это **не** проверка.
      event({ subject: "money|оплатить|счёт", risk: "money", kind: "denied", outcome: "denied: policy" }),
    ]);
    render(<Journal />);

    await screen.findByText("Что проверено из опасного");
    expect(screen.getByText("опасных рук: 2, проверено запуском: 1, ни разу не запускали: 1")).toBeTruthy();
    // И по строке на руку: «не проверено» — так и сказано, а не пустое место.
    expect(screen.getByText(/файлы|files\|удалить\|папку: запускали 1 раз, удачно 1/)).toBeTruthy();
    expect(screen.getByText(/money\|оплатить\|счёт: не проверено — политика отказала 1 раз/)).toBeTruthy();
  });

  it("упавший запуск — проверка, и это видно числом", async () => {
    vi.mocked(auditTail).mockResolvedValue([
      event({ kind: "started", outcome: "" }),
      event({ kind: "finished", outcome: "error: файл занят" }),
    ]);
    render(<Journal />);

    await screen.findByText("Что проверено из опасного");
    expect(screen.getByText(/запускали 1 раз, с ошибкой 1/)).toBeTruthy();
    expect(screen.getByText("опасных рук: 1, проверено запуском: 1, ни разу не запускали: 0")).toBeTruthy();
  });

  it("безопасное в опасный список не попадает: иначе список перестают читать", async () => {
    vi.mocked(auditTail).mockResolvedValue([
      event({ subject: "files|прочитать|размер", risk: "read", kind: "started", outcome: "" }),
      event({ subject: "files|прочитать|размер", risk: "read", kind: "finished", outcome: "ok" }),
    ]);
    render(<Journal />);

    await screen.findByText("Что проверено из опасного");
    expect(screen.getByText("опасных рук в журнале нет — проверять нечего")).toBeTruthy();
  });
});
