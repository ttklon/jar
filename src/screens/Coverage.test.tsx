// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Coverage } from "./Coverage";

/**
 * «Покрытие» (шаг 487).
 *
 * Процент покрытия — самый обманчивый показатель в проекте: «94%» звучит как
 * ответ, а скрывает файл, которого не проверяли ни разу.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран «Покрытие»", () => {
  it("рядом со средним стоит худший модуль по имени", () => {
    render(<Coverage />);
    expect(screen.getByText(/среднее \d+%, но смотрите худший: /)).toBeTruthy();
    // Именно имя, а не молчаливое «есть непокрытые места».
    expect(screen.getByText(/src-tauri\/src\/people\.rs \(20%\)/)).toBeTruthy();
  });

  it("исполнен без утверждений — назван «исполнен», а не «проверен»", () => {
    render(<Coverage />);
    expect(screen.getByText(/src\/lib\/logReader\.ts — 99% · исполнен/)).toBeTruthy();
    expect(
      screen.getByText(/строки исполнялись, но ни одного утверждения — это не проверка/),
    ).toBeTruthy();
  });

  it("модуль ниже порога называется отдельной тревогой", () => {
    render(<Coverage />);
    expect(
      screen.getByText(/src-tauri\/src\/people\.rs: покрыто 20% \(ниже 50%\)/),
    ).toBeTruthy();
    // И теста нет — покрытие могло быть случайным.
    expect(screen.getByText(/src-tauri\/src\/people\.rs: тест его не импортирует/)).toBeTruthy();
  });

  it("не гонится за ста процентами, и это сказано как запрет", () => {
    render(<Coverage />);
    expect(screen.getByText(/не гонится за 100%: обработчики невозможных состояний/)).toBeTruthy();
    expect(screen.getByText(/не считает исполнение проверкой/)).toBeTruthy();
  });

  it("на здоровых модулях проблем нет — но худший всё равно назван", () => {
    render(<Coverage />);
    fireEvent.click(screen.getByRole("button", { name: "с проблемными модулями" }));
    expect(screen.getByText("Модули выше порога, и у каждого есть утверждения")).toBeTruthy();
    // Даже когда всё хорошо, худший модуль остаётся рядом со средним.
    const said = screen.getByText(/смотрите худший/).textContent ?? "";
    expect(said).toMatch(/худший: src\/lib\/planCheck\.ts \(90%\)/);
  });
});
