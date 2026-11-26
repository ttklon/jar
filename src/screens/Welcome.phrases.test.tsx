// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Welcome } from "./Welcome";
import { NEEDED, phrases } from "../lib/starterPage";

/**
 * Шаг 8: «двадцать фраз, которые точно работают» — на первом экране.
 *
 * Проверяется не вёрстка, а обещание страницы: фраз действительно двадцать, они
 * видны до всякой настройки, и рядом с каждой группой сказано, что произойдёт.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("первый экран: двадцать фраз", () => {
  it("все двадцать фраз правила видны на первом экране", () => {
    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);
    const all = phrases();
    expect(all).toHaveLength(NEEDED);
    for (const phrase of all) {
      expect(screen.getByText(`«${phrase}»`)).toBeTruthy();
    }
  });

  it("фразы сгруппированы по тому, что человек хочет, и у группы сказано, что будет", () => {
    render(<Welcome source="ядро" onStart={() => {}} onOpen={() => {}} />);
    expect(screen.getByText("навести порядок")).toBeTruthy();
    expect(screen.getByText(/файлы разложены или удалены в корзину/)).toBeTruthy();
  });
});
