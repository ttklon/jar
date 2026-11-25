import { describe, expect, it } from "vitest";
import { PER_USER, before, check, needsAdmin, rebootNeeded, whereMarks, type Plan } from "./noAdmin";

/**
 * Шаг 301: установщик без прав администратора и без перезагрузки.
 *
 * На рабочем ноутбуке администратора нет — установка не должна упираться в UAC.
 */

const plan = (over: Partial<Plan> = {}): Plan => ({
  path: PER_USER,
  adds: ["приложение", "движок", "ярлыки"],
  driver: false,
  ...over,
});

describe("своё место, свои права", () => {
  it("папка человека — прав не нужно", () => {
    expect(needsAdmin(plan())).toBe(false);
    expect(check(plan()).ok).toBe(true);
  });

  it("путь вне профиля — понадобятся права, и это сказано", () => {
    const got = check(plan({ path: "%PROGRAMFILES%\\ZShelper" }));
    expect(got.ok).toBe(false);
    expect(got.problems.join()).toContain("права администратора");
  });

  it("драйвер — единственная честная причина повышения прав", () => {
    const got = check(plan({ driver: true }));
    expect(got.ok).toBe(false);
    expect(got.problems.join()).toContain("это надо назвать");
  });

  it("пустая установка — ошибка, а не «ничего не делаем»", () => {
    expect(check(plan({ adds: [] })).problems.join()).toContain("не сказано, что устанавливается");
  });
});

describe("что человек читает до установки", () => {
  it("одна строка про папку, права и перезагрузку", () => {
    const got = before(plan());
    expect(got).toContain("права администратора не нужны");
    expect(got).toContain("перезагрузка не нужна");
  });

  it("без «возможно» и «в некоторых случаях»", () => {
    expect(before(plan())).not.toMatch(/возможно|в некоторых случаях/i);
  });

  it("если права нужны — зачем именно", () => {
    expect(before(plan({ driver: true }))).toContain("понадобятся права администратора");
  });
});

describe("перезагрузка — ответ, а не отговорка", () => {
  it("помощнику перезагрузка не нужна", () => {
    const got = rebootNeeded(plan());
    expect(got.needed).toBe(false);
    expect(got.why).toContain("ничего не меняет систему целиком");
  });

  it("драйвер — нужна, и сказано, что это цена драйвера", () => {
    const got = rebootNeeded(plan({ driver: true }));
    expect(got.needed).toBe(true);
    expect(got.why).toContain("цена драйвера");
  });
});

describe("ярлыки и реестр без администратора", () => {
  it("HKCU, а не HKLM", () => {
    const got = whereMarks();
    expect(got.registry.startsWith("HKCU")).toBe(true);
    expect(got.registry).not.toContain("HKLM");
  });

  it("причина названа человеку, а не только нам", () => {
    expect(whereMarks().why).toContain("без администратора");
  });
});
