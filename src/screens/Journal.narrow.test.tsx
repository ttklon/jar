// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { auditTail, memoryRuns } from "../ipc";
import type { RunRecord } from "../ipc";
import { Journal } from "./Journal";

/**
 * Шаг 378: карточка дела на 600 px не ломается — и это решает **правило**
 * `narrowCard`, а не вёрстка.
 *
 * Дефект. Правило жило в библиотеке и не проверялось никем: ни экран, ни тест
 * его не звали. Строка «всего 2 с · разобрать заново» при узком окне решалась
 * раскладкой — то есть время обрезалось до «09:1», а кнопка уезжала за край.
 * Человек видел, что дело было, и не мог его разобрать.
 *
 * Проверяется то, что видно в jsdom: при узком окне строка **перестраивается**
 * в столбец. Настоящую ширину пикселей jsdom не считает, поэтому здесь
 * проверяется решение правила по ширине окна — а сами пиксели проверяет
 * Chromium (`e2e/zoom.pw.ts`).
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  auditTail: vi.fn(),
  memoryRuns: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const originalWidth = Object.getOwnPropertyDescriptor(globalThis, "innerWidth");

function windowWidth(px: number) {
  Object.defineProperty(globalThis, "innerWidth", { configurable: true, writable: true, value: px });
}

afterEach(() => {
  cleanup();
  vi.mocked(auditTail).mockReset();
  vi.mocked(memoryRuns).mockReset();
  if (originalWidth) Object.defineProperty(globalThis, "innerWidth", originalWidth);
});

function run(): RunRecord {
  return {
    id: 7,
    kind: "tool",
    subject: "Собрать папку под отчёты",
    started_ms: Date.UTC(2026, 10, 8, 9, 0, 0),
    finished_ms: Date.UTC(2026, 10, 8, 9, 0, 2),
    outcome: "ok",
    steps: [],
    session: "s1",
  } as RunRecord;
}

/** Строка с кнопкой «разобрать заново» — та самая, которую проверяет правило. */
function rowOf(button: HTMLElement): HTMLElement {
  // `styles.bar` — родитель кнопки; берём его, а не всю карточку.
  return button.parentElement as HTMLElement;
}

describe("карточка дела на узком окне", () => {
  it("на широком окне строка остаётся в одну линию", async () => {
    windowWidth(1400);
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([run()]);
    render(<Journal />);

    const button = await screen.findByRole("button", { name: /разобрать заново дело 7/ });
    expect(rowOf(button).style.flexDirection).toBe("");
  });

  it("на узком окне строка перестраивается в столбец, а не обрезается", async () => {
    // 540 px — ниже порога: текст времени (406 px) и кнопка (140 px) на одной
    // строке уже не помещаются. На 600 (MIN_WIDTH) они ещё влезают, и лишний
    // перенос там был бы поломкой, а не заботой.
    windowWidth(540);
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([run()]);
    render(<Journal />);

    const button = await screen.findByRole("button", { name: /разобрать заново дело 7/ });
    expect(rowOf(button).style.flexDirection).toBe("column");
  });

  it("кнопка «разобрать заново» остаётся на месте при любой ширине", async () => {
    // Перенос — не удаление: даже в столбце кнопка та же и доступна.
    windowWidth(540);
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([run()]);
    render(<Journal />);

    const button = await screen.findByRole("button", { name: /разобрать заново дело 7/ });
    expect(button).toBeTruthy();
    expect(rowOf(button).style.flexDirection).toBe("column");
  });
});
