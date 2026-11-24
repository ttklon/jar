// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Catalog } from "./Catalog";
import { RISK_LABEL, t } from "../i18n/ru";
import type { Action, RegistrySnapshot } from "../ipc";

/**
 * Шаг 255: `Catalog` был в списке «не покрыто» — а это единственный экран, где
 * человек видит **все** действия реестра и может отфильтровать опасные.
 *
 * Здесь важны две вещи, и обе ломаются молча: фильтр по риску действительно
 * фильтрует (а не подсвечивает), и состояние фильтра видно диктору
 * (`aria-pressed`), а не только цветом.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

function action(over: Partial<Action> = {}): Action {
  return {
    id: "files-001",
    domain: "files",
    object: "папку",
    example: "создай папку",
    verb: "создавать",
    implementation: ["fs.mkdir"],
    tier: "T1",
    risk: "write-local",
    status: "v1",
    human: "может",
    human_code: "can",
    notes: "",
    ...over,
  } as Action;
}

function snapshot(actions: Action[]): RegistrySnapshot {
  return {
    actions,
    stats: {
      actions: actions.length,
      domains: 1,
      verbs: 1,
      byRisk: { read: 0, "write-local": 0, external: 0, destructive: 0, identity: 0, money: 0 },
      byTier: { T0: 0, T1: 0, T2: 0, T3: 0 },
      byStatus: { v1: 0, v2: 0, never: 0, later: 0 },
    },
  };
}

const TWO = [
  action({ id: "a", example: "создай папку", risk: "write-local" }),
  action({ id: "b", example: "удали папку", risk: "destructive" }),
];

describe("фильтр по риску фильтрует, а не подсвечивает", () => {
  it("опасный остаётся, безопасный уходит", () => {
    render(<Catalog snapshot={snapshot(TWO)} />);
    expect(screen.getByText("создай папку")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: RISK_LABEL.destructive }));
    expect(screen.getByText("удали папку")).toBeTruthy();
    // «Создай папку» безопасное — при фильтре «разрушает» его быть не должно.
    expect(screen.queryByText("создай папку")).toBeNull();
  });

  it("состояние фильтра видно диктору, а не только цветом", () => {
    render(<Catalog snapshot={snapshot(TWO)} />);
    const chip = screen.getByRole("button", { name: RISK_LABEL.destructive });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip);
    expect(screen.getByRole("button", { name: RISK_LABEL.destructive }).getAttribute("aria-pressed")).toBe("true");
  });

  it("повторное нажатие снимает фильтр — иначе фильтр необратим", () => {
    render(<Catalog snapshot={snapshot(TWO)} />);
    const chip = () => screen.getByRole("button", { name: RISK_LABEL.destructive });
    fireEvent.click(chip());
    fireEvent.click(chip());
    expect(chip().getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("создай папку")).toBeTruthy();
  });

  it("поиск и фильтр работают вместе, а не отменяют друг друга", () => {
    render(<Catalog snapshot={snapshot(TWO)} />);
    fireEvent.click(screen.getByRole("button", { name: RISK_LABEL.destructive }));
    fireEvent.change(screen.getByRole("textbox", { name: t.searchPlaceholder }), {
      target: { value: "удали" },
    });
    expect(screen.getByText("удали папку")).toBeTruthy();
  });

  it("пустой результат — сказано словами, а не пустой экран", () => {
    render(<Catalog snapshot={snapshot(TWO)} />);
    fireEvent.change(screen.getByRole("textbox", { name: t.searchPlaceholder }), {
      target: { value: "жжж ккк щщщ" },
    });
    expect(screen.getByText(t.emptyResult)).toBeTruthy();
    // И выход рядом: пустой фильтр без кнопки «сбросить» — тупик. Кнопок две
    // (у фильтров и в пустом состоянии) — обе ведут к одному, и это нормально:
    // в пустоте человек не должен искать, где именно сбрасывать.
    fireEvent.click(screen.getAllByRole("button", { name: t.resetFilters })[0]!);
    expect(screen.getByText("создай папку")).toBeTruthy();
  });

  it("заголовок первого уровня на месте", () => {
    render(<Catalog snapshot={snapshot(TWO)} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t.catalogTitle);
  });
});
