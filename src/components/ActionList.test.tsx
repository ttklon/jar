// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ActionList } from "./ActionList";
import { RISK_LABEL, ask } from "../i18n/ru";
import type { PlanItem } from "../ipc";

/**
 * Шаг 255: `ActionList` был в списке «не покрыто тестами».
 *
 * Это список того, что приложение **собирается сделать**. Здесь важны три вещи, и
 * каждая ломается молча: риск виден у каждого пункта; «есть рука» и «нет руки» не
 * выглядят одинаково (иначе человек жмёт и получает отказ); причина решения стоит
 * рядом, а не в документации.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

function item(partial: Partial<PlanItem> = {}): PlanItem {
  return {
    key: "files-001",
    example: "создай папку",
    risk: "write-local",
    decision: "allow",
    decision_reason: "обычное действие на этом компьютере",
    needs_token: false,
    tool: "files",
    score: 0.9,
    ...partial,
  };
}

describe("риск у каждого пункта, а не у списка", () => {
  it("у двух пунктов с разным риском — два разных слова", () => {
    // Риск на весь список сразу — это «где-то опасно»: человек не знает, где.
    render(
      <ActionList
        items={[item(), item({ key: "files-006", example: "удали папку", risk: "destructive" })]}
      />,
    );
    expect(screen.getByText("создай папку")).toBeTruthy();
    expect(screen.getByText("удали папку")).toBeTruthy();
    // Слова рисков разные — иначе опасный пункт не отличить от безопасного.
    expect(screen.getByText(RISK_LABEL.destructive)).toBeTruthy();
    expect(screen.getByText(RISK_LABEL["write-local"])).toBeTruthy();
  });
});

describe("«есть рука» и «нет руки» не выглядят одинаково", () => {
  it("пункт без инструмента назван, а не спрятан", () => {
    // Иначе человек жмёт и получает отказ вместо действия.
    render(<ActionList items={[item({ tool: null })]} />);
    expect(screen.getByText(ask.noHand)).toBeTruthy();
  });

  it("пункт с инструментом назван своим словом", () => {
    render(<ActionList items={[item()]} />);
    expect(screen.getByText(ask.canRun)).toBeTruthy();
    expect(screen.queryByText(ask.noHand)).toBeNull();
  });
});

describe("причина решения стоит рядом, а не в документации", () => {
  it("показана причина, а не только оценка", () => {
    render(<ActionList items={[item({ decision_reason: "нужно подтверждение человека" })]} />);
    expect(screen.getByText("нужно подтверждение человека")).toBeTruthy();
  });

  it("пустой список — пусто, а не карточка с «ничего не найдено»", () => {
    const { container } = render(<ActionList items={[]} />);
    // Пустое состояние — дело экрана: он знает, что искали и почему пусто.
    expect(container.textContent).toBe("");
  });
});
