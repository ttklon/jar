// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MonitorCard } from "./MonitorCard";

/**
 * «Окно и экраны» (шаг 228/66).
 *
 * Настоящий дефект: окно, сохранённое на внешнем мониторе, после его
 * отключения открывается за пределами рабочего стола — окна не видно, а в
 * панели задач оно есть.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("карточка «Окно и экраны»", () => {
  it("после отключения монитора окно возвращается с причиной, а не молча", () => {
    render(<MonitorCard />);
    expect(
      screen.getByText(/окно было за пределами экранов \(видно 0%\) — вернул на главный монитор/),
    ).toBeTruthy();
    // Окно не схлопнулось в точку.
    expect(screen.getByText(/окно: 140, 50 · 1000×700/)).toBeTruthy();
  });

  it("на двух экранах окно остаётся там, где его оставили", () => {
    render(<MonitorCard />);
    fireEvent.click(screen.getByRole("button", { name: "ноутбук и монитор" }));
    expect(
      screen.getByText("окно там, где его оставили: оно видно, и двигать его незачем"),
    ).toBeTruthy();
  });

  it("подсказка не уезжает на соседний экран", () => {
    render(<MonitorCard />);
    fireEvent.click(screen.getByRole("button", { name: "ноутбук и монитор" }));
    // Подсказка осталась на СВОЁМ экране — том, где цель находится в основном.
    // Справа не влезает (цель у правого края второго экрана), поэтому встала
    // слева: 1200 − 320 = 880? Нет — цель на втором экране, и слева от неё
    // всё ещё второй экран. Если бы экран выбирался «первый пересечённый»,
    // подсказка уехала бы на 880, то есть на ноутбук за 1280 пикселей от окна.
    const line = screen.getByText(/подсказка не уезжает на соседний экран/).textContent ?? "";
    const [, x] = /(\d+), (\d+),/.exec(line) ?? [];
    expect(Number(x)).toBe(1400);
    expect(Number(x)).toBeGreaterThanOrEqual(1280);
  });

  it("четверть названа числом, а не «немного»", () => {
    render(<MonitorCard />);
    expect(screen.getByText(/хотя бы 25%/)).toBeTruthy();
  });
});
