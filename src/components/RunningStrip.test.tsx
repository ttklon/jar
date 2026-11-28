// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RunningStrip, stripOf } from "./RunningStrip";
import type { Running } from "../lib/runningGlobally";

/**
 * Плашка «что сейчас происходит» (шаги 367/376).
 *
 * Два дефекта, и оба про «забыть»: идущее дело человек не видит, уйдя с экрана
 * дел; а ждущее ответа не закончится вовсе — оно стоит молча.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

function item(patch: Partial<Running> = {}): Running {
  return { what: "уборка загрузок", done: 2, total: 7, waiting: false, cancellable: true, ...patch };
}

describe("плашка на всех экранах", () => {
  it("ничего не идёт — плашки нет, а не пустая полоска", () => {
    render(<RunningStrip running={[]} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("идущее дело называет шаг, а не просто «работает»", () => {
    render(<RunningStrip running={[item()]} />);
    expect(screen.getByText("уборка загрузок: шаг 2 из 7")).toBeTruthy();
  });

  it("ждущее ответа важнее идущего", () => {
    const strip = stripOf([item(), item({ what: "почистить диск", waiting: true })], 0);
    expect(strip?.waiting).toBe(true);
    expect(strip?.text).toMatch(/почистить диск: ждёт ответа/);
  });

  it("несколько дел — одна строка, а не стопка плашек", () => {
    render(<RunningStrip running={[item(), item({ what: "почистить диск" })]} />);
    expect(screen.getByText(/2 дела идут: уборка загрузок, почистить диск/)).toBeTruthy();
  });

  it("напоминание появляется не сразу, а с числом минут", () => {
    // До пяти минут — молчание: повтор каждую минуту приучает закрывать не читая.
    expect(stripOf([item({ waiting: true })], 3)?.extra).toBeNull();
    expect(stripOf([item({ waiting: true })], 7)?.extra).toMatch(/несколько минут/);
    expect(stripOf([item({ waiting: true })], 40)?.extra).toMatch(/дело не идёт без вашего ответа/);
  });

  it("сказано, что плашка видна и в настройках", () => {
    render(<RunningStrip running={[item()]} />);
    expect(screen.getByText(/видно: на всех экранах, включая настройки и память/)).toBeTruthy();
  });
});
