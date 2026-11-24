import { describe, expect, it } from "vitest";
import { continues, enough, mark, MAX_REPEATS, repeatOf, report } from "./repeatHand";

/**
 * Шаг 144: повтор руки — только если шаг безопасно повторить.
 *
 * Двойное удаление хуже отказа: повтор «удалить файл» может задеть второй файл.
 */
describe("безопасное повторяется само", () => {
  it("чтение — без вопроса", () => {
    const got = repeatOf("read", "таймаут");
    expect(got.auto).toBe(true);
    expect(got.ask).toBe(false);
    expect(got.said).toContain("чтение безопасно");
  });
});

describe("необратимое не повторяется само", () => {
  it("удаление — вопрос с причиной про второй объект", () => {
    const got = repeatOf("destructive", "удалить файл");
    expect(got.auto).toBe(false);
    expect(got.ask).toBe(true);
    expect(got.said).toContain("может удалить второй объект, а не этот");
  });

  it("вопрос называет причину, а не только «повторить?»", () => {
    expect(repeatOf("money", "оплата").said).toContain("списать или войти второй раз");
  });

  it("неизвестный риск — незнание не разрешение", () => {
    expect(repeatOf("unknown" as never, "что-то").ask).toBe(true);
  });

  it("запись говорит, что перезапишет", () => {
    expect(repeatOf("write-local", "файл отчёта").said).toContain("перезапишет");
  });
});

describe("в отчёте видно, чем был повтор", () => {
  it("безопасный повтор не прячется", () => {
    expect(report("read", 2, false)).toContain("без вопроса: шаг безопасен");
  });

  it("необратимый — только «с вашего слова»", () => {
    expect(report("destructive", 1, true)).toBe("повторено 1 раза, и каждый — с вашего слова");
  });

  it("не повторяли — молчим", () => {
    expect(report("read", 0, false)).toBe("");
  });
});

describe("отказ повтора — не отказ дела", () => {
  it("шаг ждёт слова, остальные идут", () => {
    const got = continues(true, true);
    expect(got.continue).toBe(true);
    expect(got.said).toContain("один шаг не отменяет дело");
  });

  it("пометка о повторе называет, чего ждём", () => {
    expect(mark("destructive", "удалить")).toContain("повтор требует слова");
    expect(mark("read", "читать")).toBe("");
  });
});

describe("«пока не получится» — не правило", () => {
  it("после трёх повторов — стоп", () => {
    expect(enough(MAX_REPEATS).stop).toBe(true);
    expect(enough(MAX_REPEATS).said).toContain("это уже не сбой, а неверный шаг");
  });

  it("до трёх — повторяем", () => {
    expect(enough(2).stop).toBe(false);
  });
});
