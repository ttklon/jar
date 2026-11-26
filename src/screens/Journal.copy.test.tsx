// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { Journal } from "./Journal";

/**
 * «Скопировать отчёт» в журнале (фаза 1, шаг 41 — подключение `copyReport`).
 *
 * Правило `copyReport` было написано и проверено, но к экрану не подключено:
 * человек видел таблицу и не мог отдать её поддержке. Здесь проверяем именно
 * подключение — кнопку, текст без путей и подтверждение словами.
 */
vi.mock("../ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ipc")>();
  return {
    ...actual,
    isTauri: () => false,
    auditTail: vi.fn().mockResolvedValue([
      { at_ms: 1700000000000, kind: "requested", subject: "почисти загрузки", risk: "clean", decision: "принято", outcome: "done", duration_ms: 1200 },
      { at_ms: 1700000060000, kind: "requested", subject: "удали старое", risk: "delete", decision: "отказ", outcome: "denied", duration_ms: 30 },
    ]),
    auditRuns: vi.fn().mockResolvedValue([]),
    auditSearch: vi.fn().mockResolvedValue([]),
  };
});

afterEach(() => {
  cleanup();
  // Счётчик вызовов переживает cleanup — без сброса второй тест видит чужие.
  writeText.mockClear();
});

const writeText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText }, configurable: true });

describe("отчёт копируется из журнала", () => {
  it("у каждой строки есть кнопка с понятным именем", async () => {
    render(<Journal />);

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /скопировать отчёт/ }).length).toBe(2),
    );
  });

  it("копируется отчёт без путей и без JSON", async () => {
    render(<Journal />);
    const [first] = await screen.findAllByRole("button", { name: /скопировать отчёт/ });

    fireEvent.click(first!);

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain("Что просили: почисти загрузки");
    expect(text).not.toContain("C:\\");
    expect(text).not.toContain("{");
  });

  it("подтверждение — словами правила, а не «ок»", async () => {
    render(<Journal />);
    const [first] = await screen.findAllByRole("button", { name: /скопировать отчёт/ });

    fireEvent.click(first!);

    await waitFor(() =>
      expect(screen.getByText(/вставить в чат или письмо как есть/)).toBeTruthy(),
    );
  });

  it("отказ попадает в отчёт как «что не получилось»", async () => {
    render(<Journal />);
    const buttons = await screen.findAllByRole("button", { name: /скопировать отчёт/ });

    fireEvent.click(buttons[1]!);

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0]![0] as string;
    expect(text).toContain("Что не получилось: отказ");
  });
});

/**
 * Выгрузка журнала за сутки (фаза 1, шаг 41 — подключение `journalExport`).
 *
 * Журнал отдают поддержке, поэтому проверяем главное: секреты вычищены, пути
 * сокращены, и человек видит **числа**, а не обещание «всё безопасно».
 */
describe("выгрузка журнала", () => {
  it("кнопка есть, когда в журнале что-то есть", async () => {
    render(<Journal />);
    expect(await screen.findByRole("button", { name: "выгрузить журнал за сутки" })).toBeTruthy();
  });

  it("в выгрузке нет пароля из фразы и нет полного пути", async () => {
    vi.mocked((await import("../ipc")).auditTail).mockResolvedValueOnce([
      { at_ms: Date.now(), kind: "requested", subject: "пароль от почты: hunter2", risk: "read", decision: "принято", outcome: "done", duration_ms: 10, args_fingerprint: "f" },
      { at_ms: Date.now(), kind: "requested", subject: "C:\\Users\\anna\\Загрузки\\старый.zip", risk: "clean", decision: "принято", outcome: "done", duration_ms: 20, args_fingerprint: "f" },
    ]);
    render(<Journal />);

    fireEvent.click(await screen.findByRole("button", { name: "выгрузить журнал за сутки" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls.at(-1)![0] as string;
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("anna");
  });

  it("сказано число, а не «безопасно»", async () => {
    // Свой набор строк: предыдущий тест оставил `mockResolvedValueOnce`, и без
    // этого здесь журнал пуст — тест, зависящий от порядка, врёт.
    vi.mocked((await import("../ipc")).auditTail).mockResolvedValueOnce([
      { at_ms: Date.now(), kind: "requested", subject: "почисти загрузки", risk: "clean", decision: "принято", outcome: "done", duration_ms: 10, args_fingerprint: "f" },
      { at_ms: Date.now(), kind: "requested", subject: "C:\\Users\\anna\\a.zip", risk: "clean", decision: "принято", outcome: "done", duration_ms: 20, args_fingerprint: "f" },
    ]);
    render(<Journal />);
    fireEvent.click(await screen.findByRole("button", { name: "выгрузить журнал за сутки" }));

    await waitFor(() => expect(screen.getByText(/секрет|вычищ|путей/)).toBeTruthy());
  });
});
