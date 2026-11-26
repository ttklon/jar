import { describe, expect, it } from "vitest";
import { check, checks, notDo, revisit, text, type Decision } from "./decisionLog";

/**
 * Шаг 497: журнал решений — почему так, а не иначе.
 */

const decision = (over: Partial<Decision> = {}): Decision => ({
  what: "журнал пишется в JSONL, а не в SQLite",
  why: "вместо базы — файл, потому что журнал должен читаться без программы и не блокироваться при записи",
  cost: "нет индексов: поиск по суткам идёт перебором, медленно на сотнях тысяч строк",
  revisit: "если журнал перевалит за миллион строк — перебор станет заметным",
  ...over,
});

describe("причина называет альтернативу", () => {
  it("правильное решение проходит", () => {
    expect(check(decision())).toEqual([]);
  });

  it("«так исторически сложилось» — не причина", () => {
    expect(check(decision({ why: "так исторически сложилось, и менять страшно" })).join()).toContain("не причина");
  });

  it("«так проще» — тоже", () => {
    expect(check(decision({ why: "так проще, потому что меньше кода" })).join()).toContain("не причина");
  });

  it("причина без альтернативы — замечание", () => {
    expect(check(decision({ why: "журнал должен читаться без программы и быстро писаться" })).join()).toContain("причина без альтернативы");
  });

  it("цена и условие пересмотра обязательны", () => {
    const got = check(decision({ cost: " ", revisit: "когда-нибудь" })).join();
    expect(got).toContain("не сказано, чем платим");
    expect(got).toContain("при каком условии пересмотреть");
  });
});

describe("условие пересмотра срабатывает", () => {
  it("событие совпало — решение в списке", () => {
    expect(revisit([decision()], ["журнал перевалил за миллион строк, перебор стал заметен"])).toHaveLength(1);
  });

  it("нет события — не пересматриваем", () => {
    expect(revisit([decision()], ["вышла новая версия Windows"])).toEqual([]);
  });
});

describe("строка журнала — в порядке чтения", () => {
  it("что → почему → цена → пересмотреть", () => {
    const lines = text(decision()).split("\n");
    expect(lines[0]).toContain("JSONL");
    expect(lines[1]).toContain("Почему:");
    expect(lines[2]).toContain("Цена:");
    expect(lines[3]).toContain("Пересмотреть:");
  });

  it("решение без цены отменяется первым", () => {
    expect(notDo()[1]).toContain("выглядит бесплатным");
    expect(checks()).toHaveLength(3);
  });
});
