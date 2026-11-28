// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Build } from "./Build";

/**
 * «Сборка и проверки» (шаги 481/476).
 *
 * Проверку, которая идёт двадцать минут, не запускают. Руководство, которое не
 * укладывается в тридцать минут, обещает больше, чем может.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран «Сборка»", () => {
  it("сумма бюджетов названа, и это ровно пять минут", () => {
    render(<Build />);
    expect(screen.getByText(/всего 300 секунд на всё/)).toBeTruthy();
    // И у каждой части свой бюджет — иначе «весь прогон» не с чем сравнивать.
    expect(screen.getByText(/тесты: 172 с из 180/)).toBeTruthy();
  });

  it("часть за бюджетом названа по имени, а не «прогон медленный»", () => {
    render(<Build />);
    // Сейчас все в бюджете, и это сказано словами, а не пустотой.
    expect(screen.getByText(/прогон \d+ с из 300: все части в своих бюджетах/)).toBeTruthy();
  });

  it("отключать проверку ради скорости — не вариант, и это сказано", () => {
    render(<Build />);
    expect(
      screen.getByText(/не отключать проверку ради скорости: отключённая проверка не ловит ничего/),
    ).toBeTruthy();
  });

  it("рука за 30 минут складывается ровно в 30", () => {
    render(<Build />);
    expect(screen.getByText(/Рука за 30 минут: шагов 5, минут 30 из 30/)).toBeTruthy();
  });

  it("каждый шаг называет, что делать, если не уложился", () => {
    render(<Build />);
    // Пятый шаг: прогон не пропускать — его ловит CI, а не vitest.
    expect(screen.getByText(/прогон не пропускать: неиспользуемый импорт не ловит/)).toBeTruthy();
  });
});
