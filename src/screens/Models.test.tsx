// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Models } from "./Models";

/**
 * В браузере папки моделей нет. Экран обязан сказать это прямо, а не показывать
 * пустую таблицу с видом «моделей не установлено» — это разные утверждения.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран «Модели»", () => {
  it("честно говорит, что папку видит только приложение", async () => {
    render(<Models />);

    await waitFor(() => {
      expect(screen.getByText(/в браузере файлов на диске нет/i)).toBeTruthy();
    });
    expect(screen.queryByText(/положите файл сами/i)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("объясняет, где лежат модели и как указать другую папку", async () => {
    render(<Models />);

    await waitFor(() => {
      expect(screen.getByText(/ZSHELPER_MODELS_DIR/)).toBeTruthy();
    });
  });
});
