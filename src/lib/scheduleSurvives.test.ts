import { describe, expect, it } from "vitest";
import { afterSleep, checks, clockWentBack, longSleep, survivesRestart } from "./scheduleSurvives";

/**
 * Шаг 328: расписание переживает перезапуск и сон — иначе оно бесполезно.
 */

describe("перезапуск — расписание не спрашивает, оно просто есть", () => {
  it("в базе — переживёт", () => {
    expect(survivesRestart("database").ok).toBe(true);
    expect(survivesRestart("file").said).toContain("переживёт");
  });

  it("в памяти — названо прямо", () => {
    const got = survivesRestart("memory");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("после выключения компьютера");
  });
});

describe("сон: не больше одного вопроса", () => {
  it("ничего не пропущено", () => {
    expect(afterSleep(0, "ask").runs).toBe(0);
  });

  it("пропущено три — делаю один раз, а не три", () => {
    const got = afterSleep(3, "doNow");
    expect(got.runs).toBe(1);
    expect(got.said).toContain("а не 3 подряд");
  });

  it("после недели отпуска не будет бури", () => {
    expect(afterSleep(7, "doNow").said).toContain("буря");
  });

  it("пропустил — в журнале будет «пропущено»", () => {
    expect(afterSleep(2, "skip").said).toContain("«пропущено»");
  });

  it("спросить — один вопрос и запомнить", () => {
    const got = afterSleep(5, "ask");
    expect(got.runs).toBe(-1);
    expect(got.said).toContain("запомню ответ");
  });
});

describe("часы назад не запускают прошедшее второй раз", () => {
  it("время вперёд — можно", () => {
    expect(clockWentBack(100, 120).run).toBe(true);
  });

  it("время назад — ждём, пока догонят", () => {
    const got = clockWentBack(600, 540);
    expect(got.run).toBe(false);
    expect(got.said).toContain("чтобы не повторить прошедшее");
  });

  it("одинаковая минута — не назад", () => {
    expect(clockWentBack(600, 600).run).toBe(true);
  });
});

describe("сон дольше суток", () => {
  it("меньше суток — обычный вопрос", () => {
    expect(longSleep(5)).toBeNull();
  });

  it("трое суток — очередью не догоняем", () => {
    const got = longSleep(72);
    expect(got).toContain("3 суток");
    expect(got).toContain("очередью");
  });
});

describe("что проверяет тест", () => {
  it("четыре вещи, и все про очередь", () => {
    const got = checks();
    expect(got.length).toBe(4);
    expect(got.join()).toContain("а не очередью");
  });
});
