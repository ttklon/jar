// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { resourceReport } from "../ipc";
import { ResourceReportCard } from "./ResourceReport";
import type { ResourceReport } from "../ipc";

/**
 * Шаг 400. Проверяется не вёрстка, а три обещания: число стоит рядом с
 * порогом, «не измерено» не выдаётся за «хорошо», а превышение не выглядит
 * поломкой.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  resourceReport: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(resourceReport).mockReset();
});

function report(patch: Partial<ResourceReport> = {}): ResourceReport {
  return {
    metrics: [
      {
        name: "старт до окна",
        value: 1.8,
        unit: "с",
        budget: 3,
        within: true,
        how: "засечка от запуска процесса до первого ответа окна",
      },
      {
        name: "память в простое",
        value: 214,
        unit: "МБ",
        budget: 150,
        within: false,
        how: "tasklist: рабочий набор процесса, не пиковый",
      },
    ],
    over: 1,
    unknown: 0,
    summary: "за обещанным порогом: память в простое. Это не поломка, но приложение стало тяжелее, чем обещало",
    ...patch,
  };
}

describe("карточка «где приложение тратит ресурсы»", () => {
  it("число стоит рядом с порогом, а не само по себе", async () => {
    // «214 МБ» без «при обещанных 150» ничего не говорит.
    vi.mocked(resourceReport).mockResolvedValue(report());
    render(<ResourceReportCard />);

    await screen.findByText("память в простое");
    expect(screen.getByText("214 МБ")).toBeTruthy();
    expect(screen.getByText("при обещанных 150 МБ")).toBeTruthy();
    expect(screen.getByText("1.80 с")).toBeTruthy();
    expect(screen.getByText("при обещанных 3.0 с")).toBeTruthy();
  });

  it("в пределах и за порогом названы разными словами", async () => {
    vi.mocked(resourceReport).mockResolvedValue(report());
    render(<ResourceReportCard />);

    await screen.findByText("за порогом");
    expect(screen.getByText("в пределах")).toBeTruthy();
  });

  it("превышение не называется поломкой", async () => {
    // Красный цвет здесь значил бы «сломалось», и человек привык бы его
    // игнорировать. Это факт, а не падение.
    vi.mocked(resourceReport).mockResolvedValue(report());
    render(<ResourceReportCard />);

    const summary = await screen.findByText(/за обещанным порогом/);
    expect(summary.textContent).toContain("не поломка");
    expect(summary.textContent).not.toContain("ошибк");
  });

  it("неизмеренное сказано словами, а не пустой зелёной строкой", async () => {
    vi.mocked(resourceReport).mockResolvedValue(
      report({
        metrics: [
          {
            name: "память в простое",
            value: null,
            unit: "МБ",
            budget: null,
            within: null,
            how: "не Windows: счётчик памяти недоступен",
          },
        ],
        over: 0,
        unknown: 1,
        summary: "измерений нет: считать нечем, и это честнее выдуманных цифр",
      }),
    );
    render(<ResourceReportCard />);

    await screen.findByText("не измерено");
    // И причина рядом: «не измерено» без причины — загадка.
    expect(screen.getByText(/счётчик памяти недоступен/)).toBeTruthy();
    expect(screen.queryByText("в пределах")).toBeNull();
  });

  it("ошибку измерения называет, а не показывает пусто", async () => {
    vi.mocked(resourceReport).mockRejectedValue(new Error("ядро не ответило"));
    render(<ResourceReportCard />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ядро не ответило");
  });

  it("по кнопке измеряет заново", async () => {
    vi.mocked(resourceReport).mockResolvedValue(report());
    render(<ResourceReportCard />);
    await screen.findByText("память в простое");
    expect(resourceReport).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Измерить заново" }));
    await waitFor(() => expect(resourceReport).toHaveBeenCalledTimes(2));
  });
});
