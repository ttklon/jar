import { describe, expect, it } from "vitest";
import { fixQuery, look, MAX_FIX_TRIES, roundLine, step, type Look } from "./loop";
import type { QueueItem } from "./queue";

/**
 * Петля улучшения решает, что делать дальше, и делает это по правилам, которые можно
 * проверить без машины, без окон и без модели.
 */

const state = (over: Partial<Parameters<typeof step>[0]> = {}) => ({
  rounds: [] as Look[],
  fixes: 0,
  stopped: false,
  left: 5,
  mayStart: true,
  ...over,
});

const deed = (over: Partial<QueueItem> = {}): QueueItem => ({
  id: "1",
  goal: "починить сборку",
  state: "failed",
  note: "шаг упал",
  origin: "доведи проект до максимума",
  ...over,
});

describe("петля улучшения", () => {
  it("«посмотреть» считает сделанное, а не бодрость отчёта", () => {
    expect(look({ completed: 3, steps: 3, stopped: null })).toBe("done");
    expect(look({ completed: 1, steps: 3, stopped: "шаг упал" })).toBe("part");
    expect(look({ completed: 0, steps: 3, stopped: "шаг упал" })).toBe("nothing");
    // Ноль шагов в плане — это не «всё сделано», а пустая работа.
    expect(look({ completed: 0, steps: 0, stopped: null })).toBe("nothing");
  });

  it("первый круг — это вопрос модели, а не догадка очереди", () => {
    const decision = step(state());
    expect(decision.action).toBe("ask");
    expect(decision.why).toContain("первый круг");
  });

  it("сделанный круг ведёт к следующему улучшению — петля не останавливается сама", () => {
    const decision = step(state({ rounds: ["done", "done"] }));
    expect(decision.action).toBe("ask");
    expect(decision.why).toContain("круг 2");
  });

  it("сбой получает одну поправку, а не десять", () => {
    expect(step(state({ rounds: ["done", "nothing"] })).action).toBe("fix");
    expect(step(state({ rounds: ["part"], fixes: 0 })).action).toBe("fix");

    // Поправка уже была — и она ничего не изменила: дальше человек, а не ещё круг.
    const afterFix = step(state({ rounds: ["nothing", "nothing"], fixes: MAX_FIX_TRIES }));
    expect(afterFix.action).toBe("stop");
    expect(afterFix.why).toContain("топчемся");
  });

  it("«стоп» человека сильнее любой возможности машины", () => {
    const decision = step(state({ stopped: true, rounds: ["nothing"], left: 12 }));
    expect(decision.action).toBe("stop");
    expect(decision.why).toContain("остановлено вами");
  });

  it("нет памяти — не начинаем новое, и говорим «нет», а не «помедленнее»", () => {
    const decision = step(state({ mayStart: false }));
    expect(decision.action).toBe("stop");
    expect(decision.why).toContain("«нет»");
  });

  it("потолок в час выбран — следующий круг после него", () => {
    const decision = step(state({ left: 0, rounds: ["done"] }));
    expect(decision.action).toBe("stop");
    expect(decision.why).toContain("дел в час");
  });

  it("вопрос про поправку показывает, что именно не сделалось", () => {
    const query = fixQuery("доведи проект до максимума", [
      deed(),
      deed({ id: "2", goal: "обновить зависимости", state: "done", note: "" }),
    ]);

    expect(query).toContain("доведи проект до максимума");
    expect(query).toContain("починить сборку");
    expect(query).toContain("шаг упал");
    // Сделанное в вопрос про поправку не попадает: чинить надо сбой, а не готовое.
    expect(query).not.toContain("обновить зависимости");
    expect(query).toContain("не переделывают всё заново");
  });

  it("счёт по цели говорит кругами, а не «работаю давно»", () => {
    expect(roundLine("цель", [])).toContain("кругов ещё не было");
    expect(roundLine("порядок в загрузках", ["done", "nothing"])).toBe(
      "цель «порядок в загрузках»: кругов 2, из них сделано 1 — последний ничего не изменил",
    );
    expect(roundLine("цель", ["done"])).toContain("последний сделан");
  });
});
