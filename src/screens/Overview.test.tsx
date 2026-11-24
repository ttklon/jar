// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Overview } from "./Overview";
import { t } from "../i18n/ru";
import type { RegistrySnapshot } from "../ipc";

/**
 * Шаг 255: `Overview` был в списке «не покрыто тестами» — и это первый экран,
 * который человек видит.
 *
 * Проверяется число, ради которого он существует: **сколько действий требует
 * человека** (`identity` + `money`). Ошибка здесь не падает: экран просто
 * показывает не то число, и никто не замечает — а именно оно отвечает на вопрос
 * «сколько тут опасного, если я нажму».
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

function snapshot(byRisk: Record<string, number> = {}): RegistrySnapshot {
  const risk = { read: 0, "write-local": 0, external: 0, destructive: 0, identity: 0, money: 0, ...byRisk };
  return {
    actions: [],
    stats: {
      actions: Object.values(risk).reduce((a, b) => a + b, 0),
      domains: 49,
      verbs: 207,
      byRisk: risk as RegistrySnapshot["stats"]["byRisk"],
      byTier: { T0: 0, T1: 0, T2: 0, T3: 0 },
      byStatus: { v1: 0, v2: 0, never: 0, later: 0 },
    },
  };
}

describe("первое число на первом экране", () => {
  it("требует человека = identity + money, а не что попало", () => {
    // 7 подписей и 4 денежных — 11, а не 7 и не 4.
    render(<Overview snapshot={snapshot({ identity: 7, money: 4, destructive: 67 })} />);
    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText(t.statManual)).toBeTruthy();
  });

  it("ноль — тоже ответ, а не пустое место", () => {
    render(<Overview snapshot={snapshot({})} />);
    // Четыре карточки, и у каждой число: пропущенная карточка читается как сбой.
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(t.statManual)).toBeTruthy();
  });

  it("все четыре счётчика названы словами, а не только цифрами", () => {
    render(<Overview snapshot={snapshot({ read: 311 })} />);
    for (const label of [t.statActions, t.statDomains, t.statVerbs, t.statManual]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("заголовок экрана — первого уровня: диктор знает, куда попал", () => {
    render(<Overview snapshot={snapshot()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t.overviewTitle);
  });
});
