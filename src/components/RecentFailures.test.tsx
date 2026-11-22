// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { auditTail } from "../ipc";
import { RecentFailures } from "./RecentFailures";
import { recentFailures } from "../i18n/ru";

/**
 * Шаг 345: последние отказы в настройках с «почему».
 *
 * Зачем тест. Карточка читает журнал и переводит его в причинами; три вещи в
 * ней ломаются молча: пустота вместо «отказов не было», текст ошибки вместо
 * причины, и совет, обещающий то, чего приложение не сделает.
 */

vi.mock("../ipc", () => ({
  isTauri: vi.fn(() => true),
  auditTail: vi.fn(),
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

function event(outcome: string, atMs: number, subject = "files|move|Загрузки") {
  return {
    at_ms: atMs,
    kind: "finished" as const,
    subject,
    risk: "read",
    decision: "allow",
    args_fingerprint: "abc",
    outcome,
    duration_ms: 12,
  };
}

describe("последние отказы в настройках", () => {
  it("называет причину словами, а не текстом ошибки", async () => {
    vi.mocked(auditTail).mockResolvedValue([
      event("error: could not resolve host: huggingface.co", 1_700_000_000_000),
    ]);
    render(<RecentFailures />);

    expect(await screen.findByText("нет сети")).toBeTruthy();
    // Совет — про действие.
    expect(screen.getByText(/Проверьте сеть/)).toBeTruthy();
    // Исходная строка тоже видна: «почему» можно проверить, а не принять
    // на слово.
    expect(screen.getByText(/huggingface\.co/)).toBeTruthy();
  });

  it("не больше пяти строк и свежие впереди", async () => {
    vi.mocked(auditTail).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) =>
        event(`error: нет сети ${i}`, 1_700_000_000_000 + i * 60_000),
      ),
    );
    render(<RecentFailures />);

    // Пять строк с одной причиной — это и есть смысл: причины повторяются,
    // поэтому ищем все, а не первую.
    expect(await screen.findAllByText("нет сети")).toHaveLength(5);
    // Свежая — та, что была последней по времени (i = 7).
    expect(screen.getAllByText(/нет сети 7/)).toHaveLength(1);
  });

  it("«отказов не было» — это ответ, а не пустое место", async () => {
    vi.mocked(auditTail).mockResolvedValue([event("ok", 1_700_000_000_000)]);
    render(<RecentFailures />);

    expect(await screen.findByText(recentFailures.empty)).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("ошибка журнала не выдаёт себя за «отказов не было»", async () => {
    // Пустой список после сбоя читался бы как «всё хорошо» — это ложь в самую
    // опасную сторону, как и с сетевым следом.
    vi.mocked(auditTail).mockRejectedValue(new Error("журнал недоступен"));
    render(<RecentFailures />);

    expect(await screen.findByRole("alert")).toBeTruthy();
    // И «отказов не было» тут не написано: это разные утверждения.
    expect(screen.queryByText(recentFailures.empty)).toBeNull();
    expect(screen.getByText(recentFailures.title)).toBeTruthy();
  });
});
