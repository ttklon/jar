// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { auditTail, memoryRuns } from "../ipc";
import type { AuditEvent, RunRecord } from "../ipc";
import { Journal } from "./Journal";

/**
 * Шаг 372: фильтры журнала — «сегодня», «вчера», «только ошибки».
 *
 * Проверяется не вёрстка, а два правила: фильтры **складываются** и пустой
 * результат говорит, что был фильтр, а не «дел нет».
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

afterEach(() => {
  cleanup();
  vi.mocked(auditTail).mockReset();
  vi.mocked(memoryRuns).mockReset();
});

function event(patch: Partial<AuditEvent> = {}): AuditEvent {
  return {
    at_ms: Date.now(),
    kind: "requested",
    subject: "files|удалить|папка",
    risk: "dangerous",
    decision: "allow",
    args_fingerprint: "fp",
    outcome: "ok",
    duration_ms: 4,
    ...patch,
  };
}

function run(patch: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 1,
    kind: "tool",
    subject: "убрать временные файлы",
    started_ms: Date.now(),
    finished_ms: Date.now(),
    outcome: "failed",
    steps: [],
    ...patch,
  };
}

describe("время дела", () => {
  it("называет общее время и честно говорит, что по шагам его не мерили", async () => {
    // Шаг 49: «40 секунд» без разбивки лучше выдуманной разбивки, но молчать
    // про общее нельзя — именно оно вызывает «почему так долго».
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([
      run({ started_ms: 1_000, finished_ms: 41_000, steps: [{ position: 0, tool: "files|найти|файл", ok: true, reason: "", evidence: "ok" }] }),
    ]);

    render(<Journal />);
    expect(await screen.findByText(/всего 40 с/)).toBeTruthy();
    expect(screen.getByText(/шаг без времени: сумма не может сойтись с общим/)).toBeTruthy();
  });

  it("идущее дело не получает выдуманную длительность", async () => {
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([run({ finished_ms: null, outcome: "running" })]);

    render(<Journal />);
    expect(await screen.findByText(/время не мерили: дело ещё идёт/)).toBeTruthy();
  });
});

describe("разобрать заново", () => {
  it("кнопка есть у каждого дела и говорит, что сделала", async () => {
    // Шаг 45: разбор вчерашнего провала не трогает мир — поэтому это отдельная
    // кнопка рядом с карточкой, а не «повторить» в ряду действий дела.
    vi.mocked(auditTail).mockResolvedValue([]);
    vi.mocked(memoryRuns).mockResolvedValue([run()]);

    render(<Journal />);
    const button = await screen.findByRole("button", { name: "разобрать заново дело 1" });
    fireEvent.click(button);
    expect(await screen.findByText(/воспроизведено/)).toBeTruthy();
  });
});

describe("фильтры журнала", () => {
  it("«только ошибки» показывает провал запуска, хотя у события всё хорошо", async () => {
    // Иначе «что сломалось» отвечало бы половиной: отказы видны, провалы дел — нет.
    vi.mocked(auditTail).mockResolvedValue([event({ outcome: "ok" })]);
    vi.mocked(memoryRuns).mockResolvedValue([run({ outcome: "failed" })]);

    render(<Journal />);
    fireEvent.click(await screen.findByRole("button", { name: "только ошибки" }));

    expect((await screen.findAllByText(/убрать временные файлы/)).length).toBeGreaterThan(0);
    expect(screen.getByText(/только ошибки: 1 из 2/)).toBeTruthy();
    // Событие с хорошим исходом ушло из таблицы — фильтр действительно режет.
    expect(screen.queryByText("files|удалить|папка")).toBeNull();
  });

  it("фильтры складываются: «сегодня» и «только ошибки» — два условия", async () => {
    const old = Date.now() - 3 * 24 * 60 * 60 * 1000;
    vi.mocked(auditTail).mockResolvedValue([event({ at_ms: old, outcome: "failed" })]);
    vi.mocked(memoryRuns).mockResolvedValue([]);

    render(<Journal />);
    fireEvent.click(await screen.findByRole("button", { name: "сегодня" }));
    fireEvent.click(screen.getByRole("button", { name: "только ошибки" }));

    // Старая ошибка не проходит по «сегодня», и подпись называет оба условия.
    expect(await screen.findByText(/по фильтру «сегодня, ошибки» ничего; всего дел 1/)).toBeTruthy();
  });

  it("пустой результат не выдаётся за «дел нет»", async () => {
    vi.mocked(auditTail).mockResolvedValue([event({ risk: "safe", outcome: "ok" })]);
    vi.mocked(memoryRuns).mockResolvedValue([]);

    render(<Journal />);
    fireEvent.click(await screen.findByRole("button", { name: "только опасные" }));

    expect(await screen.findByText(/по фильтру «только опасные» ничего; всего дел 1/)).toBeTruthy();
    // И это не то же самое, что «дел ещё нет».
    expect(screen.queryByText(/дел ещё нет: скажите первое дело/)).toBeNull();
  });
});
