import { describe, expect, it } from "vitest";
import { gaps, line, notHere, summarize, whySeparate, type Entry } from "./autoHistory";

/**
 * Шаг 339: история автоматизаций отдельно от ручных дел — для разбора.
 */

const entry = (over: Partial<Entry> = {}): Entry => ({
  rule: "уборка загрузок",
  at: 540,
  outcome: "done",
  effect: "удалено 12 файлов",
  ms: 900,
  ...over,
});

describe("сводка по правилу, а не по времени", () => {
  it("тридцать строк подряд бесполезны — нужна сводка", () => {
    const got = summarize([entry(), entry({ at: 541 }), entry({ at: 542 })]);
    expect(got.length).toBe(1);
    expect(got[0]!.runs).toBe(3);
    expect(got[0]!.done).toBe(3);
  });

  it("порядок — по числу запусков", () => {
    const got = summarize([entry({ rule: "редкое" }), entry(), entry({ at: 541 })]);
    expect(got[0]!.rule).toBe("уборка загрузок");
  });

  it("ошибки и пропуски считаются отдельно", () => {
    const got = summarize([
      entry(),
      entry({ outcome: "failed", effect: "папка занята" }),
      entry({ outcome: "skipped", effect: "файлов не было" }),
    ]);
    expect(got[0]!.failed).toBe(1);
    expect(got[0]!.skipped).toBe(1);
  });

  it("последний эффект — чтобы не читать всё", () => {
    const got = summarize([entry({ effect: "удалено 3 файла" }), entry({ at: 541, effect: "удалено 5 файлов" })]);
    expect(got[0]!.lastEffect).toBe("удалено 5 файлов");
  });
});

describe("в строке — число запусков, а не «успешно»", () => {
  it("запуски, удачные, время и эффект", () => {
    const got = line(summarize([entry(), entry({ at: 541 })])[0]!);
    expect(got).toBe("уборка загрузок: 2 запуска, удачных 2 (1.8 с); последний раз — удалено 12 файлов");
  });

  it("один запуск — «1 запуск», а не «1 запусков»", () => {
    expect(line(summarize([entry()])[0]!)).toContain("1 запуск,");
  });

  it("ошибки видны в строке", () => {
    expect(line(summarize([entry({ outcome: "failed" })])[0]!)).toContain("ошибок 1");
  });
});

describe("зачем отдельно", () => {
  it("три ответа, и все про «что делает сама»", () => {
    const got = whySeparate();
    expect(got.length).toBe(3);
    expect(got.join()).toContain("вперемешку с руками");
  });

  it("ручные дела сюда не попадают", () => {
    expect(notHere()).toContain("ручные дела сюда не попадают");
  });
});

describe("без эффекта разбор не работает", () => {
  it("запись без эффекта ловится", () => {
    expect(gaps([entry({ effect: "  " })])[0]).toContain("нет эффекта");
  });

  it("всё с эффектом — замечаний нет", () => {
    expect(gaps([entry()])).toEqual([]);
  });
});
