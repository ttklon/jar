import { describe, expect, it } from "vitest";
import { evidenceText } from "./evidence";

/**
 * Доказательство говорится словами одинаково на всех экранах: «Руки» и «Сценарии»
 * не должны описывать одно и то же по-разному.
 */
describe("доказательство словами", () => {
  it("действие над окном подтверждается изменением, а не надеждой", () => {
    expect(
      evidenceText({ kind: "ui_changed", what: "кнопка «Войти»", changed: true }),
    ).toBe("изменение подтверждено: кнопка «Войти»");

    expect(
      evidenceText({ kind: "ui_changed", what: "поле «Логин»", changed: false }),
    ).toBe("изменения не видно: поле «Логин»");
  });

  it("остальные виды доказательств не потерялись", () => {
    expect(evidenceText({ kind: "exit_code", code: 0 })).toBe("код возврата 0");
    expect(evidenceText({ kind: "path_exists", path: "C:\\tmp", exists: true })).toContain(
      "существует",
    );
    expect(evidenceText({ kind: "failed", reason: "нет прав" })).toBe("нет прав");
  });
});
