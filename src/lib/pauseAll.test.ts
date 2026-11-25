import { describe, expect, it } from "vitest";
import { afterReturn, keeps, pauseAll, resume, state } from "./pauseAll";

/**
 * Шаг 338: пауза всех расписаний одной кнопкой — отпуск.
 */

const NOW = Date.UTC(2026, 10, 20);

describe("одна кнопка, всё сразу", () => {
  it("семь правил на паузе до возвращения", () => {
    const got = state(pauseAll(7, NOW, 0), NOW);
    expect(got).toBe("7 расписаний на паузе до вашего возвращения");
  });

  it("склонение: 1 расписание, 2 расписания, 5 расписаний", () => {
    expect(state(pauseAll(1, NOW, 0), NOW)).toContain("1 расписание");
    expect(state(pauseAll(2, NOW, 0), NOW)).toContain("2 расписания");
    expect(state(pauseAll(5, NOW, 0), NOW)).toContain("5 расписаний");
  });

  it("пауза с датой", () => {
    const got = state(pauseAll(3, NOW, NOW + 7 * 86_400_000), NOW);
    expect(got).toContain("до 2026-11-27");
  });

  it("пауза истекла — так и говорим", () => {
    expect(state(pauseAll(3, NOW - 10 * 86_400_000, NOW - 86_400_000), NOW)).toContain("пауза истекла");
  });

  it("ничего не на паузе", () => {
    expect(state(pauseAll(0, NOW, 0), NOW)).toBe("все расписания работают");
  });
});

describe("продолжение — сводка, а не буря", () => {
  it("без пропусков", () => {
    expect(resume(pauseAll(5, NOW, 0), 0)).toBe("5 расписаний снова работает");
  });

  it("с пропусками — догонять не будем", () => {
    const got = resume(pauseAll(5, NOW, 0), 12);
    expect(got).toContain("пропущено 12 запусков");
    expect(got).toContain("догонять не будем");
  });

  it("молчаливое продолжение — проблема", () => {
    expect(afterReturn()).toContain("пауза кончилась");
  });
});

describe("что пауза сохраняет", () => {
  it("четыре вещи, включая доверие и опасное", () => {
    const got = keeps();
    expect(got.length).toBe(4);
    expect(got.join()).toContain("пауза — не удаление");
    expect(got.join()).toContain("доверие сохраняются");
    expect(got.join()).toContain("подтверждать некому");
  });
});
