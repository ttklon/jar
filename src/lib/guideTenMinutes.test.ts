import { describe, expect, it } from "vitest";
import { checks, firstMust, fits, format, LIMITS, minutes, type Section } from "./guideTenMinutes";

/**
 * Шаг 461: GUIDE читается за 10 минут и отвечает «что сказать, чтобы получить X».
 */

const section = (over: Partial<Section> = {}): Section => ({
  ask: "как почистить загрузки?",
  say: "почисти загрузки от старых файлов",
  get: "покажу список до удаления и спрошу",
  ...over,
});

describe("десять минут — число, а не обещание", () => {
  it("200 слов в минуту", () => {
    expect(minutes(200)).toBe(1);
    expect(minutes(1000)).toBe(5);
    expect(minutes(2100)).toBe(11);
  });

  it("короткое руководство влезает", () => {
    const got = fits([section(), section()]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("войдёт в 10 минут");
  });

  it("11 минут — названное нарушение с числом слов", () => {
    const big = section({ say: Array.from({ length: 500 }, () => "слово").join(" ") });
    const got = fits([big, big, big, big, big]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("мин вместо 10");
  });

  it("21 вопрос — тоже нарушение", () => {
    const many = Array.from({ length: 21 }, () => section());
    expect(fits(many).said).toContain("больше 20 за десять минут не прочитать");
  });

  it("пределы названы числами", () => {
    expect(LIMITS.minutes).toBe(10);
    expect(LIMITS.sections).toBe(20);
  });
});

describe("раздел — про человека, а не про функцию", () => {
  it("три поля: вопрос, фраза, результат", () => {
    expect(format()).toHaveLength(3);
  });

  it("первый раздел — самая частая просьба", () => {
    expect(firstMust()).toContain("а не «что такое ZShelper»");
  });
});

describe("чего руководство не делает", () => {
  it("не выдумывает ответ: нет — так и пишет", () => {
    expect(checks()).toHaveLength(4);
    expect(checks().join()).toContain("если ответа нет — сказано, а не выдумано");
  });
});
