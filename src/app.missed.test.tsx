// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RunRecord } from "./ipc/types";
import { GONE_MS, KEY } from "./lib/missedWhileAway";
import { WELCOME_KEY } from "./lib/firstRun";

/**
 * Шаг 81: сводка «пока вас не было» видна человеку.
 *
 * Браузерный адаптер запусков не отдаёт вовсе (`memoryRuns` → []), поэтому
 * здесь он подменён: проверяется не «данные пришли», а «человек увидел то, что
 * пропустил». Иначе правило осталось бы в библиотеке — ровно тот дефект, из
 * которого весь этот этап.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));

/** Дело, закончившееся «полчаса назад» — человек его не видел. */
function away(subject: string, outcome: string, finishedAgo: number): RunRecord {
  return {
    id: Math.random(),
    kind: "plan",
    subject,
    started_ms: Date.now() - finishedAgo - 1000,
    finished_ms: Date.now() - finishedAgo,
    outcome,
    steps: [],
    session: "",
  };
}

let runs: RunRecord[] = [];

vi.mock("./ipc", async () => {
  const actual = await vi.importActual<typeof import("./ipc")>("./ipc");
  return {
    ...actual,
    isTauri: () => false,
    memoryRuns: async () => runs,
    engineStatus: async () => ({ found: false, program: null, search_dir: "", running: false, port: null, pid: null }),
  };
});

beforeEach(() => {
  runs = [];
  globalThis.localStorage?.clear?.();
  globalThis.localStorage?.setItem?.(WELCOME_KEY, "1");
});

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear?.();
});

const loaded = () =>
  waitFor(() => expect(screen.getByRole("button", { name: "Держать и говорить" })).toBeTruthy(), {
    timeout: 4000,
  });

describe("сводка «пока вас не было» (шаг 81)", () => {
  it("дела, сделанные без человека, названы при возвращении", async () => {
    // Отметка «видел» — час назад: всё, что закончилось позже, он пропустил.
    globalThis.localStorage?.setItem?.(KEY, String(Date.now() - GONE_MS - 60_000));
    runs = [away("раскладка папки «Загрузки»", "ok", 30_000)];

    render(<App />);
    await loaded();

    const note = await screen.findByText(/пока вас не было/i);
    expect(note.textContent).toContain("раскладка папки");
  });

  it("провал назван провалом, а не спрятан в списке", async () => {
    globalThis.localStorage?.setItem?.(KEY, String(Date.now() - GONE_MS - 60_000));
    runs = [away("уборка", "ok", 40_000), away("отчёт", "failed", 30_000)];

    render(<App />);
    await loaded();

    const note = await screen.findByText(/пока вас не было/i);
    expect(note.textContent).toContain("не получилось");
  });

  it("человек был у экрана — сводки нет", async () => {
    // Отметка свежая: он всё видел, и сообщение было бы шумом.
    globalThis.localStorage?.setItem?.(KEY, String(Date.now() - 1000));
    runs = [away("уборка", "ok", 500)];

    render(<App />);
    await loaded();
    expect(screen.queryByText(/пока вас не было/i)).toBeNull();
  });

  it("сводку можно убрать, и она больше не мешает", async () => {
    globalThis.localStorage?.setItem?.(KEY, String(Date.now() - GONE_MS - 60_000));
    runs = [away("уборка", "ok", 30_000)];

    render(<App />);
    await loaded();
    await screen.findByText(/пока вас не было/i);

    fireEvent.click(screen.getByRole("button", { name: /скрыть сводку/ }));
    await waitFor(() => expect(screen.queryByText(/пока вас не было/i)).toBeNull());
  });

  it("первый запуск без отметки всё равно не молчит о сделанном", async () => {
    // Настоящий дефект, который поймался этим тестом: «когда видел» бралось
    // из памяти, а в памяти при первом кадре «сейчас» — то есть человек
    // «видел» всё, включая то, что случилось до запуска, и сводка не
    // появлялась никогда. Нет отметки — читаем журнал целиком.
    globalThis.localStorage?.removeItem?.(KEY);
    runs = [away("ночная уборка", "ok", 60_000)];

    render(<App />);
    await loaded();

    const note = await screen.findByText(/пока вас не было/i);
    expect(note.textContent).toContain("ночная уборка");
  });

  it("нечего показывать — плашки нет вовсе", async () => {
    runs = [];
    render(<App />);
    await loaded();
    expect(screen.queryByText(/пока вас не было/i)).toBeNull();
  });
});

// Импорт внизу: `vi.mock` поднимается, а `App` должен получить уже подменённый модуль.
import { App } from "./app";
