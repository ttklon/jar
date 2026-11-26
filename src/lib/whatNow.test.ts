import { describe, expect, it } from "vitest";
import { answer, duration, estimate, notWhere, safe, type Now } from "./whatNow";

/**
 * Шаг 427: кнопка «покажи, что ты сейчас делаешь».
 */

const nowMs = new Date(2026, 10, 20, 9, 12).getTime();
const now = (over: Partial<Now> = {}): Now => ({ deed: "уборка загрузок", total: 7, step: 2, doing: "удаление старых файлов", since: nowMs - 12_000, ...over });

describe("отвечает про сейчас, а не про потом", () => {
  it("где дело в целом и что именно делаем", () => {
    const got = answer(now(), nowMs);
    expect(got).toContain("шаг 3 из 7");
    expect(got).toContain("удаление старых файлов");
    expect(got).toContain("12 с");
  });

  it("ждём человека — самая частая ситуация", () => {
    const got = answer(now({ waitingFor: "удалить 12 файлов?" }), nowMs);
    expect(got).toContain("ждёт вашего ответа");
    expect(got).toContain("удалить 12 файлов?");
  });

  it("ничего не идёт — «жду фразу», а не пусто", () => {
    expect(answer({}, nowMs)).toBe("сейчас ничего не делаю: жду вашу фразу");
  });

  it("без времени — без вранья про секунды", () => {
    expect(answer(now({ since: undefined }), nowMs)).not.toContain("(undefined)");
  });
});

describe("сколько осталось", () => {
  it("последний шаг — так и сказано", () => {
    expect(estimate(now({ step: 6 }))).toBe("это последний шаг");
  });

  it("осталось два", () => {
    expect(estimate(now({ step: 4 }))).toBe("осталось 2 шага");
  });

  it("ждём человека — зависит от него", () => {
    expect(estimate(now({ waitingFor: "да?" }))).toContain("зависит от вас");
  });

  it("шаги неизвестны — оценки нет, а не «скоро»", () => {
    expect(estimate({ deed: "x" })).toContain("оценки нет");
  });
});

describe("длительность по-человечески", () => {
  it("только начал, секунды, минуты", () => {
    expect(duration(300)).toBe("только начал");
    expect(duration(45_000)).toBe("45 с");
    expect(duration(125_000)).toBe("2 мин 5 с");
  });
});

describe("кнопка только читает", () => {
  it("не останавливает и не ускоряет", () => {
    expect(safe()).toContain("ничего не меняет");
  });

  it("смотрит не в журнал и не в модель", () => {
    const got = notWhere().join();
    expect(got).toContain("мгновенным");
  });
});
