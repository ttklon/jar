import { describe, expect, it } from "vitest";
import { check, checks, level, MAX_RISKS, notDo, ordered, summary, type Risk } from "./riskShortList";

/**
 * Шаг 493: свести открытые риски в один короткий список.
 */

const risk = (over: Partial<Risk> = {}): Risk => ({ what: "модель не запускается на 4 ГБ", likely: "средняя", hurt: "сильно", doing: "проверяем на слабой машине при приёмке", review: "2026-12-01", ...over });

describe("важность считается, а не оценивается", () => {
  it("три ступени на три", () => {
    expect(level(risk({ likely: "низкая", hurt: "мало" }))).toBe(0);
    expect(level(risk({ likely: "высокая", hurt: "сильно" }))).toBe(4);
    expect(level(risk())).toBe(3);
  });

  it("в списке верхние — первыми", () => {
    const got = ordered([risk({ what: "мелочь", likely: "низкая", hurt: "мало" }), risk({ what: "беда", likely: "высокая", hurt: "сильно" })]);
    expect(got[0]!.what).toBe("беда");
  });
});

describe("короткий — значит короткий", () => {
  it("больше десяти — в такой не смотрят", () => {
    const many = Array.from({ length: MAX_RISKS + 1 }, (_, i) => risk({ what: `риск ${i}` }));
    expect(check(many).join()).toContain("а больше 10 не читают");
  });

  it("ровно десять — можно", () => {
    const ten = Array.from({ length: MAX_RISKS }, (_, i) => risk({ what: `риск ${i}` }));
    expect(check(ten)).toEqual([]);
  });

  it("повтор, пустое «что делаем», кривая дата — замечания", () => {
    const got = check([risk(), risk(), risk({ what: "другой", doing: "ждём", review: "1 декабря" })]).join();
    expect(got).toContain("повторяется");
    expect(got).toContain("не сказано, что делаем сейчас");
    expect(got).toContain("не по форме");
  });
});

describe("сводка — три факта", () => {
  it("пустой список — это тоже записано", () => {
    expect(summary([])).toContain("список пуст, и это записано");
  });

  it("страшный и ближайший пересмотр", () => {
    const got = summary([risk({ review: "2027-01-01" }), risk({ what: "беда", likely: "высокая", hurt: "сильно", review: "2026-12-15" })]);
    expect(got).toContain("рисков 2");
    expect(got).toContain("самый страшный: «беда»");
    expect(got).toContain("ближайший пересмотр 2026-12-15");
  });
});

describe("чего список не делает", () => {
  it("не пишет «средне»", () => {
    expect(notDo()[1]).toContain("два разных вопроса");
    expect(checks()).toHaveLength(3);
  });
});
