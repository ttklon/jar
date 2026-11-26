import { describe, expect, it } from "vitest";
import { afterRestart, mustSave, notDo, save, type Need } from "./shutdownSave";

/**
 * Шаг 458: завершение работы системы — корректно сохранить незавершённое.
 */

const need = (over: Partial<Need> = {}): Need => ({ step: 3, said: "почисти загрузки", draft: "", ...over });

describe("выключение не блокируем никогда", () => {
  it("даже если запись не удалась", () => {
    const got = save(need({ deed: "уборка" }), false);
    expect(got.allow).toBe(true);
    expect(got.said).toContain("выключению не мешаю");
  });

  it("и когда всё удалось", () => {
    expect(save(need({ deed: "уборка" }), true).allow).toBe(true);
  });
});

describe("сохраняем только то, что нужно для продолжения", () => {
  it("дело с шагом и фразу", () => {
    const got = save(need({ deed: "уборка" }), true);
    expect(got.saved).toContain("дело «уборка» на шаге 3");
    expect(got.saved).toContain("фраза");
  });

  it("незаконченная фраза в поле — отдельно", () => {
    const got = save(need({ draft: "почисти загруз" }), true);
    expect(got.saved).toContain("незаконченная фраза в поле");
  });

  it("поле совпадает с фразой — не дублируем", () => {
    expect(save(need({ draft: "почисти загрузки" }), true).saved).not.toContain("незаконченная фраза в поле");
  });

  it("сохранять нечего — так и говорим", () => {
    expect(save(need({ said: "  " }), true).said).toContain("сохранять нечего");
  });
});

describe("после включения — по ответу человека", () => {
  it("говорим, что на месте, и ждём ответа", () => {
    const got = afterRestart(save(need({ deed: "уборка" }), true));
    expect(got).toContain("по вашему ответу");
  });

  it("ничего не сохранено — молчим", () => {
    expect(afterRestart(save(need({ said: "" }), true))).toBe("");
  });
});

describe("обязательный минимум и три запрета", () => {
  it("три вещи", () => {
    expect(mustSave()).toHaveLength(3);
  });

  it("никаких отчётов целиком — у нас секунды", () => {
    expect(notDo().join()).toContain("у нас секунды");
  });
});
