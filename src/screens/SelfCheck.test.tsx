// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { selfCheck } from "../ipc";
import type { SelfCheckVerdict } from "../ipc";
import { SelfCheckCard } from "./SelfCheck";

/**
 * Карточка «Проверка себя». Проверяется не вёрстка, а три обещания: проверки идут по кнопке,
 * провал виден с причиной, а в браузере честно сказано, что проверять нечего.
 */

vi.mock("../ipc", () => ({
  selfCheck: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(selfCheck).mockReset();
});

function verdict(patch: Partial<SelfCheckVerdict> = {}): SelfCheckVerdict {
  return {
    name: "Подтверждение одноразовое",
    promise: "одно подтверждение — одно действие",
    passed: true,
    detail: "первое сработало, второе отклонено",
    ms: 3,
    ...patch,
  };
}

describe("карточка «Проверка себя»", () => {
  it("не запускает проверки сама: сначала кнопка", () => {
    render(<SelfCheckCard />);

    expect(selfCheck).not.toHaveBeenCalled();
    expect(screen.getByText(/по кнопке, а не сами/)).toBeTruthy();
  });

  it("по кнопке показывает итоги и считает прошедшие", async () => {
    vi.mocked(selfCheck).mockResolvedValue([verdict(), verdict({ name: "«Стоп» останавливает" })]);

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() => expect(screen.getByText("проверок прошло: 2 из 2")).toBeTruthy());
    expect(screen.getByText("Подтверждение одноразовое")).toBeTruthy();
    // Два одинаковых обещания в списке — значит ищем все, а не первое.
    expect(screen.getAllByText(/одно подтверждение — одно действие/)).toHaveLength(2);
    expect(screen.getAllByText("✓")).toHaveLength(2);
  });

  it("провал остаётся в списке с причиной, а не прячется", async () => {
    vi.mocked(selfCheck).mockResolvedValue([
      verdict(),
      verdict({
        name: "«Стоп» останавливает",
        passed: false,
        detail: "отмена не сработала за 8.2 с",
      }),
    ]);

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() =>
      expect(screen.getByText(/проверок прошло: 1 из 2/)).toBeTruthy(),
    );
    expect(screen.getByText("не подтвердилось")).toBeTruthy();
    expect(screen.getByText("отмена не сработала за 8.2 с")).toBeTruthy();
    expect(screen.getByText("✗")).toBeTruthy();
  });

  it("в браузере говорит, что проверять нечего", async () => {
    vi.mocked(selfCheck).mockResolvedValue([]);

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() =>
      expect(screen.getByText(/в браузере проверять нечего/)).toBeTruthy(),
    );
  });

  it("ошибку запуска называет, а не показывает пустой список", async () => {
    vi.mocked(selfCheck).mockRejectedValue(new Error("ядро не ответило"));

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() =>
      expect(screen.getByText(/проверки не запустились: ядро не ответило/)).toBeTruthy(),
    );
  });
});
