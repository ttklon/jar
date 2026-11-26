import { describe, expect, it } from "vitest";
import { check, checks, notDo, samples, text, type Message } from "./errorHelps";

/**
 * Шаг 484: понятное сообщение об ошибке с «что сделать».
 */

const message = (over: Partial<Message> = {}): Message => ({ code: "x", what: "снимок отчёта старее данных", todo: "запустите `python3 tools/report_snapshot.py --write`", where: "data/report.json", ...over });

describe("три части, и ни одна не пропускается", () => {
  it("нормальное сообщение проходит", () => {
    expect(check(message())).toEqual([]);
  });

  it("«stale» — жаргон", () => {
    expect(check(message({ what: "отчёт stale" })).join()).toContain("жаргон «stale»");
  });

  it("«что-то пошло не так» — не говорит, что случилось", () => {
    expect(check(message({ what: "что-то пошло не так" })).join()).toContain("не говорит, что случилось");
  });

  it("нет «что сделать» и нет «где» — оба замечания", () => {
    const got = check(message({ todo: " ", where: "" })).join();
    expect(got).toContain("не сказано, что сделать");
    expect(got).toContain("не сказано, где смотреть");
  });

  it("три команды в «что сделать» — это больше одного действия", () => {
    const got = check(message({ todo: "запустите `a` и потом `b` и ещё `c`" })).join();
    expect(got).toContain("больше одного действия (команд 3)");
  });
});

describe("как читает человек", () => {
  it("что случилось → что сделать → где", () => {
    const got = text(message());
    const lines = got.split("\n");
    expect(lines[0]).toBe("снимок отчёта старее данных");
    expect(lines[1]).toContain("Что сделать:");
    expect(lines[2]).toContain("Где: data/report.json");
  });

  it("образцы для частых проверок проходят собственную проверку", () => {
    for (const sample of samples()) expect(check(sample)).toEqual([]);
  });

  it("у каждого образца есть код", () => {
    expect(samples().every((sample) => sample.code.length > 3)).toBe(true);
  });
});

describe("чего сообщение не делает", () => {
  it("не «см. лог» и не обвиняет человека", () => {
    const got = notDo().join();
    expect(got).toContain("см. лог");
    expect(got).toContain("не обвиняет человека");
    expect(checks()).toHaveLength(3);
  });
});
