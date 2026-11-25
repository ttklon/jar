import { describe, expect, it } from "vitest";
import { decide, forbidden, line, suggest, type Rule } from "./catchUp";

/**
 * Шаг 334: пропущенный запуск (компьютер спал) — сделать или пропустить, по выбору человека.
 *
 * Три ответа разумны — зависит от дела.
 */

const rule = (over: Partial<Rule> = {}): Rule => ({
  what: "отчёт о диске",
  policy: "catchUp",
  dangerous: false,
  missed: 3,
  ...over,
});

describe("выбор — у дела, а не глобальная настройка", () => {
  it("отчёт догоняется", () => {
    const got = decide(rule());
    expect(got.action).toBe("doOnce");
    expect(got.said).toContain("один раз, а не 3 подряд");
  });

  it("напоминание пропускает", () => {
    const got = decide(rule({ policy: "skip", what: "напоминание" }));
    expect(got.action).toBe("skip");
    expect(got.said).toContain("«пропущено»");
  });

  it("«спросить» — один раз и запомнить", () => {
    const got = decide(rule({ policy: "ask" }));
    expect(got.action).toBe("ask");
    expect(got.said).toContain("запомню ответ");
  });

  it("опасное спрашивает при любой политике", () => {
    const got = decide(rule({ dangerous: true, policy: "catchUp" }));
    expect(got.action).toBe("ask");
    expect(got.said).toContain("само не запустится");
  });

  it("пропусков нет — догонять нечего", () => {
    expect(decide(rule({ missed: 0 })).action).toBe("skip");
  });
});

describe("сколько бы ни было пропущено — срабатывание одно", () => {
  it("после недели отпуска не семь отчётов", () => {
    const got = decide(rule({ missed: 7 }));
    expect(got.action).toBe("doOnce");
    expect(got.said).toContain("а не 7 подряд");
  });

  it("в строке видно, что будет дальше", () => {
    expect(line(rule())).toBe("отчёт о диске: пропущено 3, сделаю один раз");
  });
});

describe("подсказка при создании — по роду дела", () => {
  it("опасное — спрашивать", () => {
    expect(suggest(true, false)).toBe("ask");
  });

  it("частое — пропускать", () => {
    expect(suggest(false, true)).toBe("skip");
  });

  it("обычное — догонять", () => {
    expect(suggest(false, false)).toBe("catchUp");
  });
});

describe("чего нельзя ни при каком выборе", () => {
  it("три запрета, включая подмену пропуска успехом", () => {
    const got = forbidden().join();
    expect(got).toContain("буря");
    expect(got).toContain("подменять пропуск успехом");
    expect(got).toContain("без подтверждения");
  });
});
