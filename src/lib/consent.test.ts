import { describe, expect, it } from "vitest";
import { consentCanRun, consentPositions, isSpokenConsent, keepsPendingPlan } from "./consent";
import type { PlanCheck } from "../ipc";

function check(partial: Partial<PlanCheck>): PlanCheck {
  return {
    plan: { goal: "удали a.txt", steps: [{ registry: "files|удалить|файл", params: {} }] },
    problems: [],
    questions: [],
    gates: [
      {
        position: 1,
        registry: "files|удалить|файл",
        decision: "confirm",
        risk: "destructive",
        wants_approval: true,
      },
    ],
    ...partial,
  };
}

describe("отдельное слово на уже показанный план", () => {
  it("принимает только целое разрешение", () => {
    expect(isSpokenConsent("Да")).toBe(true);
    expect(isSpokenConsent("  разрешаю. ")).toBe(true);
    expect(isSpokenConsent("делай!")).toBe(true);
    expect(isSpokenConsent("да, удали всё")).toBe(false);
    expect(isSpokenConsent("удали a.txt")).toBe(false);
    expect(isSpokenConsent("ок")).toBe(false);
    expect(isSpokenConsent("")).toBe(false);
  });

  it("пока набирают разрешение, план не считает новой задачей", () => {
    expect(keepsPendingPlan("")).toBe(true);
    expect(keepsPendingPlan("д")).toBe(true);
    expect(keepsPendingPlan("да")).toBe(true);
    expect(keepsPendingPlan("у")).toBe(false);
  });

  it("не закрывает вопросы, запрет и пустые ворота", () => {
    expect(consentCanRun(check({}))).toBe(true);
    expect(consentPositions(check({}))).toEqual([1]);
    expect(consentCanRun(check({ questions: [{ position: 1, name: "path", label: "Путь", hint: "" }] }))).toBe(
      false,
    );
    expect(
      consentCanRun(
        check({
          gates: [
            {
              position: 1,
              registry: "files|удалить|файл",
              decision: "deny",
              risk: "destructive",
              wants_approval: false,
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(consentCanRun(check({ gates: [] }))).toBe(false);
    expect(consentCanRun(null)).toBe(false);
  });
});
