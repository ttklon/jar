// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TrustCard, trustFrom } from "./TrustCard";
import { mayRunQuietly } from "../lib/earnedTrust";

/**
 * Шаг 50: доверие зарабатывается делом, и это видно словами.
 *
 * Правило earnedTrust существовало и не было подключено: человек после недели
 * работы не знал, спросят его завтра или сделают молча.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

const DAY = 86_400_000;
const now = new Date(2026, 10, 20, 12).getTime();

describe("доверие из дел", () => {
  it("два удачных дела одного вида — уже привычка", () => {
    const got = trustFrom([
      { subject: "почистить загрузки", outcome: "ok", started_ms: now - DAY },
      { subject: "почистить загрузки", outcome: "ok", started_ms: now - 2 * DAY },
    ]);
    expect(mayRunQuietly(got.get("почистить загрузки") ?? null, now).ok).toBe(true);
  });

  it("одно дело — случайность, и это сказано числом", () => {
    const got = trustFrom([{ subject: "почистить загрузки", outcome: "ok", started_ms: now - DAY }]);
    const verdict = mayRunQuietly(got.get("почистить загрузки") ?? null, now);
    expect(verdict.ok).toBe(false);
    expect(verdict.said).toMatch(/подтверждали 1 раз — нужно 2/);
  });

  it("отмена после подтверждений обнуляет счёт", () => {
    // Отмена — не наказание, а сигнал: человек не хотел, чтобы это делалось само.
    const got = trustFrom([
      { subject: "чистить", outcome: "ok", started_ms: now - 3 * DAY },
      { subject: "чистить", outcome: "ok", started_ms: now - 2 * DAY },
      { subject: "чистить", outcome: "cancelled", started_ms: now - DAY },
      { subject: "чистить", outcome: "ok", started_ms: now - 1000 },
    ]);
    const entry = got.get("чистить");
    expect(entry?.cancelledAt).toBe(now - DAY);
    expect(mayRunQuietly(entry ?? null, now).ok).toBe(false);
  });

  it("провал не считается подтверждением", () => {
    const got = trustFrom([
      { subject: "чистить", outcome: "failed", started_ms: now - DAY },
      { subject: "чистить", outcome: "failed", started_ms: now - 2 * DAY },
    ]);
    expect(mayRunQuietly(got.get("чистить") ?? null, now).ok).toBe(false);
  });

  it("пустая история — «спросит подтверждение», а не молчание", () => {
    render(<TrustCard history={new Map()} />);
    expect(screen.getByText(/каждое дело спросит подтверждение/)).toBeTruthy();
  });

  it("карточка называет правило и почему", () => {
    const entry = { kind: "чистить", confirmed: 1, lastAt: now - DAY, cancelledAt: 0 };
    render(<TrustCard history={new Map([["чистить", entry]])} />);
    expect(screen.getByText(/«чистить»/)).toBeTruthy();
    expect(screen.getAllByText(/один раз это случайность/).length).toBeGreaterThan(0);
  });
});
