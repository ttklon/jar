import { describe, expect, it } from "vitest";
import { causes, notDo, text, why, type Failure } from "./whyScreen";

/**
 * Шаг 422: понятный «почему» для каждого отказа — на экране.
 */

const failure = (know: Failure["know"] = {}): Failure => ({ doing: "почисти загрузки", code: "E1", know });

describe("причина первой строкой, действие одно", () => {
  it("нет сети", () => {
    const got = why(failure({ offline: true }));
    expect(got.cause).toBe("«почисти загрузки» не выполнено: нет сети");
    expect(got.action).toContain("остальное работает и без неё");
  });

  it("нет места", () => {
    expect(why(failure({ noSpace: true })).action).toContain("пары гигабайт");
  });

  it("нет прав — с объяснением, а не «access denied»", () => {
    expect(why(failure({ permission: true })).cause).toContain("Windows не пустил");
  });

  it("модель не скачана", () => {
    expect(why(failure({ modelMissing: true })).action).toContain("скачайте модель");
  });

  it("не уложилось во время — и «это наша ошибка»", () => {
    expect(why(failure({ timeout: true })).action).toContain("это наша ошибка");
  });

  it("неизвестная причина — так и говорим, без «что-то пошло не так»", () => {
    const got = why(failure());
    expect(got.cause).toContain("причину определить не удалось");
    expect(got.action).toContain("пришлите отчёт");
  });
});

describe("порядок: с чего человеку начинать", () => {
  it("сеть важнее модели: без сети модель и не скачается", () => {
    expect(why(failure({ offline: true, modelMissing: true })).cause).toContain("нет сети");
  });

  it("место раньше прав", () => {
    expect(why(failure({ noSpace: true, permission: true })).cause).toContain("нет места");
  });
});

describe("код отдельно, текст двумя строками", () => {
  it("код не в причине", () => {
    const got = why(failure({ offline: true }));
    expect(got.cause).not.toContain("E1");
    expect(got.code).toBe("E1");
  });

  it("две строки на экране", () => {
    expect(text(failure({ noSpace: true })).split("\n")).toHaveLength(2);
  });
});

describe("чего «почему» не делает", () => {
  it("никаких «попробуйте позже»", () => {
    const got = notDo().join();
    expect(got).toContain("попробуйте позже");
    expect(got).toContain("человек делает одно");
  });

  it("шесть причин, шестая — честная неизвестность", () => {
    expect(causes()).toHaveLength(6);
  });
});
