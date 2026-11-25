import { describe, expect, it } from "vitest";
import { DANGEROUS, confirmText, decide, isDangerous, neverSaid, planVerdict, whyNoMiddle } from "./dangerPolicy";

/**
 * Шаг 336: автоматизация опасного действия требует подтверждения каждый раз или никогда.
 */

describe("опасное — список, а не догадка", () => {
  it("пять опасных родов", () => {
    expect(DANGEROUS.length).toBe(5);
    for (const risk of ["delete", "send", "pay", "system", "foreignWrite"] as const) {
      expect(isDangerous(risk)).toBe(true);
    }
  });

  it("чтение не опасно", () => {
    expect(isDangerous("read")).toBe(false);
  });
});

describe("две политики и никакой середины", () => {
  it("«каждый раз» — с подтверждением", () => {
    const got = decide("delete", "always");
    expect(got.runs).toBe(true);
    expect(got.needAsk).toBe(true);
    expect(got.said).toContain("подтверждением каждый раз");
  });

  it("«никогда» — только по просьбе человека", () => {
    const got = decide("send", "never");
    expect(got.runs).toBe(false);
    expect(got.said).toContain("только если попросите сами");
  });

  it("безопасное идёт по расписанию при любой политике", () => {
    expect(decide("read", "never").runs).toBe(true);
  });

  it("середины нет — и сказано почему", () => {
    const got = whyNoMiddle();
    expect(got).toContain("середины нет");
    expect(got).toContain("тихое опасное дело");
  });
});

describe("политика по самому опасному шагу плана", () => {
  it("«уборка» с удалением внутри — опасна", () => {
    const got = planVerdict(["read", "delete", "read"], "always");
    expect(got.worst).toBe("delete");
    expect(got.needAsk).toBe(true);
  });

  it("только чтение — не опасно", () => {
    const got = planVerdict(["read", "read"], "always");
    expect(got.worst).toBeNull();
    expect(got.needAsk).toBe(false);
  });

  it("«никогда» действует и на план", () => {
    expect(planVerdict(["delete"], "never").runs).toBe(false);
  });
});

describe("подтверждение говорит, что именно", () => {
  it("что будет удалено", () => {
    const got = confirmText("уборка загрузок", "12 файлов, 340 МБ", "delete");
    expect(got).toContain("удалить");
    expect(got).toContain("12 файлов");
  });

  it("что будет отправлено", () => {
    expect(confirmText("отчёт", "письмо Ивану", "send")).toContain("отправить");
  });

  it("не «выполнить автоматизацию?»", () => {
    expect(confirmText("x", "y", "delete")).not.toContain("выполнить автоматизацию");
  });
});

describe("«никогда» — не «правило удалено»", () => {
  it("правило ждёт просьбы", () => {
    const got = neverSaid("уборка");
    expect(got).toContain("по расписанию не делается");
    expect(got).toContain("сделаю сейчас");
  });
});
