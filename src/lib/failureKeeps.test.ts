import { describe, expect, it } from "vitest";
import { line, resumable, tell, type StepReport } from "./failureKeeps";

/**
 * Шаг 119: сбой шага не скрывает, что уже сделано до него.
 *
 * Отчёт начинался с провала, и человек шёл делать заново то, что уже сделано.
 */
const steps: StepReport[] = [
  { position: 1, what: "создать папку Отчёты", answer: "сделано" },
  { position: 2, what: "перенести 12 файлов", answer: "сделано" },
  { position: 3, what: "удалить исходники", answer: "не сделано", reason: "нет прав" },
];
const tally = { done: 2, notDone: 1, unknown: 0, total: 5 };

describe("сначала сделанное, потом провал", () => {
  it("первая строка — сделанное, а не ошибка", () => {
    // «Ошибка» первой строкой прячет работу.
    const said = tell(steps, tally).said;
    expect(said[0]).toContain("сделано до сбоя: 2");
  });

  it("сделанное названо предметами, а не числом без предметов", () => {
    const said = tell(steps, tally).said[0] ?? "";
    expect(said).toContain("создать папку Отчёты");
    expect(said).toContain("перенести 12 файлов");
  });

  it("провал назван номером и причиной", () => {
    const said = tell(steps, tally).said.join(" ");
    expect(said).toContain("шаг 3 «удалить исходники» — нет прав");
  });

  it("что не начиналось — тоже сказано", () => {
    expect(tell(steps, tally).said.join(" ")).toContain("не начиналось: 2");
  });
});

describe("неизвестное — отдельно от провала", () => {
  it("неизвестные идут своей строкой", () => {
    const withUnsure: StepReport[] = [...steps, { position: 4, what: "проверить", answer: "неизвестно" }];
    const said = tell(withUnsure, { ...tally, unknown: 1 }).said.join(" ");
    expect(said).toContain("неизвестно: 1 — шаг 4");
  });

  it("неизвестное мешает продолжать: иначе отчёт станет неправдой", () => {
    const withUnsure: StepReport[] = [
      { position: 1, what: "папка", answer: "сделано" },
      { position: 2, what: "файлы", answer: "неизвестно" },
      { position: 3, what: "удаление", answer: "не сделано" },
    ];
    const got = resumable(tell(withUnsure, { done: 1, notDone: 1, unknown: 1, total: 3 }));
    expect(got.ok).toBe(false);
    expect(got.why).toContain("неизвестные шаги");
  });
});

describe("дальше — предложение, а не только констатация", () => {
  it("продолжить с провала, а не с начала", () => {
    const next = tell(steps, tally).next.join(" ");
    expect(next).toContain("продолжить с шага 3");
    expect(next).toContain("сделанное до него останется");
  });

  it("откат назван отдельным решением, а не единственным", () => {
    expect(tell(steps, tally).next.join(" ")).toContain("отдельное решение");
  });

  it("ничего не сделано — так и сказано, без похвалы за пустоту", () => {
    const nothing: StepReport[] = [{ position: 1, what: "папка", answer: "не сделано", reason: "нет места" }];
    const got = tell(nothing, { done: 0, notDone: 1, unknown: 0, total: 1 });
    expect(got.said[0]).toBe("до сбоя ничего не сделано");
    expect(got.next[0]).toContain("повторить шаг 1");
  });
});

describe("строка для ленты — со сделанным впереди", () => {
  it("сделано, сбой, неизвестно, не начиналось", () => {
    const withUnsure: StepReport[] = [...steps, { position: 4, what: "проверить", answer: "неизвестно" }];
    expect(line(tell(withUnsure, { done: 2, notDone: 1, unknown: 1, total: 5 }))).toBe(
      "сделано 2, сбой на шаге 3, неизвестно 1, не начиналось 1",
    );
  });

  it("шагов не было — так и сказано", () => {
    expect(line(tell([], { done: 0, notDone: 0, unknown: 0, total: 0 }))).toBe("шагов не было");
  });
});

describe("продолжение возможно только после известного", () => {
  it("всё до провала сделано — можно", () => {
    expect(resumable(tell(steps, tally)).ok).toBe(true);
  });

  it("провала нет — продолжать нечего", () => {
    expect(resumable(tell([steps[0]!], { done: 1, notDone: 0, unknown: 0, total: 1 })).ok).toBe(false);
  });
});
