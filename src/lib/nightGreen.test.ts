import { describe, expect, it } from "vitest";
import { alive, BUDGET_SECONDS, checkScenario, checks, morning, notDo, type Run, type Step } from "./nightGreen";

/**
 * Шаг 488: ночи без красного — ночной прогон живого сценария.
 */

const step = (over: Partial<Step> = {}): Step => ({ human: "говорю «почисти загрузки»", expect: "появляется подтверждение с числом файлов", seconds: 30, ...over });
const scenario = (): Step[] => [step(), step({ human: "подтверждаю", expect: "файлы уходят в корзину, не мимо" }), step({ human: "проверяю корзину", expect: "вижу те же файлы, что удалял" })];

describe("живой сценарий, а не вызов функции", () => {
  it("три шага с ожиданиями — проходит", () => {
    expect(checkScenario(scenario())).toEqual([]);
  });

  it("короче трёх шагов — не сценарий", () => {
    expect(checkScenario([step(), step()]).join()).toContain("не сценарий, а вызов");
  });

  it("шаг без ожидания — замечание", () => {
    expect(checkScenario([...scenario(), step({ human: "жду", expect: "ок" })]).join()).toContain("нет ожидания");
  });

  it("слишком долгий шаг — сценарий не успеет", () => {
    expect(checkScenario([...scenario(), step({ human: "жду", seconds: 400 })]).join()).toContain("не успеет за ночь");
  });

  it("сценарий дольше бюджета — утром ответа не будет", () => {
    const long = [step({ seconds: 300 }), step({ seconds: 300 }), step({ seconds: 300 })];
    expect(checkScenario(long).join()).toContain("утром ответа не будет");
  });
});

describe("утренняя строка", () => {
  const run = (over: Partial<Run> = {}): Run => ({ night: "2026-11-20", failedAt: 0, seconds: 95, ...over });

  it("прошло — одна строка без красного", () => {
    const got = morning(run(), scenario());
    expect(got.red).toBe(false);
    expect(got.said).toContain("красного нет");
  });

  it("упало — шаг и что ждали", () => {
    const got = morning(run({ failedAt: 2 }), scenario());
    expect(got.red).toBe(true);
    expect(got.said).toContain("шаг 2 «подтверждаю»");
    expect(got.said).toContain("ждали: файлы уходят в корзину");
  });

  it("упало на несуществующем шаге — хотя бы номер", () => {
    expect(morning(run({ failedAt: 9 }), scenario()).said).toContain("шаг 9");
  });

  it("срок разбора — до вечера, а не «когда-нибудь»", () => {
    expect(morning(run({ failedAt: 1 }), scenario()).said).toContain("до вечера");
  });
});

describe("что делает его живым", () => {
  it("три условия, третье — про экран", () => {
    const got = alive();
    expect(got).toHaveLength(3);
    expect(got[2]).toContain("что видит человек");
  });

  it("не привыкать к красному", () => {
    expect(notDo()[0]).toContain("разбор в тот же день");
    expect(checks()).toHaveLength(3);
    expect(BUDGET_SECONDS).toBe(600);
  });
});
