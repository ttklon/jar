import { describe, expect, it } from "vitest";
import { check, order, proofs, verify, type Report } from "./reportStructure";

/**
 * Шаг 380: тест — отчёт дела содержит цель, шаги, доказательства и отмену.
 */

const step = (name: string, proof = "12 файлов") => ({ name, detail: "удалено", proof });
const report = (over: Partial<Report> = {}): Report => ({
  goal: "почисти загрузки",
  steps: [step("просмотр"), step("удаление", "удалено 12, 340 МБ")],
  cancellable: true,
  cancelSaid: "остальные шаги не выполнятся",
  ...over,
});

describe("четыре обязательные части", () => {
  it("полный отчёт проходит", () => {
    expect(verify(report())).toEqual({ ok: true, missing: [] });
  });

  it("без цели — не отчёт", () => {
    const got = check(report({ goal: "  " }));
    expect(got.join()).toContain("нет цели");
    expect(got.join()).toContain("фразы человека");
  });

  it("без шагов — одна строка «сделано»", () => {
    expect(check(report({ steps: [] })).join()).toContain("нет шагов");
  });

  it("без доказательства — «поверьте»", () => {
    const got = check(report({ steps: [step("удаление", "")] }));
    expect(got.join()).toContain("нет доказательств у 1 шага: удаление");
  });

  it("поздно отменять — законно, если так и сказано (null)", () => {
    expect(check(report({ cancellable: null }))).toEqual([]);
  });

  it("отмена возможна, но не сказано что будет — замечание", () => {
    expect(check(report({ cancelSaid: "" })).join()).toContain("не сказано, что именно произойдёт");
  });

  it("склонение шагов в замечании", () => {
    const got = check(report({ steps: [step("a", ""), step("b", "")] }));
    expect(got.join()).toContain("у 2 шагов");
  });
});

describe("порядок частей", () => {
  it("отмена последней, а не первой", () => {
    expect(order()).toEqual(["цель", "шаги", "доказательства", "отмена"]);
  });
});

describe("что считается доказательством", () => {
  it("«успешно» — оценка, а не доказательство", () => {
    expect(proofs().join()).toContain("а не «файлы удалены»");
  });

  it("«не проверено» — честное доказательство", () => {
    expect(proofs().join()).toContain("не проверено");
  });
});
