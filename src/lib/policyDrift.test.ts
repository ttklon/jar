// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DECLARED, drift, read, softness, verdict } from "./policyDrift";

/**
 * Шаг 178: политика не расширяется молча.
 *
 * Тест на дрейф. Проверяет не «случаи», а **таблицу целиком**: одна ветка,
 * переставленная с `Deny` на `Confirm`, — и система, которая «не подписывает за
 * человека», начинает подписывать, а старые тесты этого не видят.
 */

describe("разбор таблицы политики", () => {
  it("читает риск → решение, а не отдельные случаи", () => {
    const got = read(`
      match action.risk {
        Risk::Read => Decision::Allow,
        Risk::WriteLocal => Decision::Confirm,
        Risk::Money => Decision::Deny("деньги система не двигает"),
      }
    `);
    expect(got.table).toEqual({ read: "allow", "write-local": "confirm", money: "deny" });
    expect(got.rows).toBe(3);
  });
});

describe("смягчение — это событие", () => {
  it("`identity` из отказа в подтверждение — расширение, и сказано чем", () => {
    const got = drift({
      table: { read: "allow", "write-local": "confirm", external: "confirm", destructive: "confirm", identity: "confirm", money: "deny" },
      rows: 6,
    });
    expect(got).toHaveLength(1);
    expect(got[0]!.said).toContain("система могла только отказать, а теперь может спросить и выполнить");
  });

  it("`money` из отказа в allow — расширение, а не «согласовано»", () => {
    const got = drift({
      table: { read: "allow", "write-local": "confirm", external: "confirm", destructive: "confirm", identity: "deny", money: "allow" },
      rows: 6,
    });
    expect(got[0]!.risk).toBe("money");
    expect(got[0]!.said).toContain("было «deny», стало «allow»");
  });

  it("сужение — не дрейф: закрывать дыры должно быть легко", () => {
    const got = drift({
      table: { read: "allow", "write-local": "confirm", external: "confirm", destructive: "deny", identity: "deny", money: "deny" },
      rows: 6,
    });
    expect(got).toEqual([]);
  });

  it("исчезнувшая ветка — тоже дрейф, а не «наверное, стало строже»", () => {
    const got = drift({ table: { read: "allow" }, rows: 1 });
    expect(got.length).toBeGreaterThan(0);
    expect(got[0]!.said).toContain("ветки в политике нет");
  });
});

describe("незнакомое решение — не защита", () => {
  it("незнакомое слово считается самым мягким, а не самым строгим", () => {
    // Иначе опечатка `Decision::Deni` молча прошла бы как «строго».
    expect(softness("deni")).toBe(9);
    expect(softness("deny")).toBe(0);
    expect(softness("allow")).toBe(2);
    expect(softness("CONFIRM")).toBe(1);
  });
});

describe("итог", () => {
  it("чисто — одна строка без списка", () => {
    const found = read(
      Object.entries(DECLARED)
        .map(([risk, decision]) => {
          const camel = risk.replace(/(^|-)(\w)/g, (_, __, letter: string) => letter.toUpperCase());
          const dec = decision[0]!.toUpperCase() + decision.slice(1);
          return `Risk::${camel} => Decision::${dec},`;
        })
        .join("\n"),
    );
    expect(verdict(found).ok).toBe(true);
    expect(verdict(found).said).toBe("политика не расширилась");
  });

  it("падает на расширении — это и есть «расширили молча»", () => {
    const found = read(`
      Risk::Read => Decision::Allow,
      Risk::WriteLocal => Decision::Confirm,
      Risk::External => Decision::Confirm,
      Risk::Destructive => Decision::Confirm,
      Risk::Identity => Decision::Confirm,
      Risk::Money => Decision::Deny("деньги"),
    `);
    const got = verdict(found);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("политика расширилась в 1 месте");
  });
});

describe("настоящий policy.rs не расширился", () => {
  it("код совпадает с объявленной границей", () => {
    // Это и есть регулярная проверка: файл читается, таблица сверяется.
    const text = readFileSync("src-tauri/src/policy.rs", "utf8");
    const found = read(text);
    const got = verdict(found);
    expect(got.ok, got.said).toBe(true);
    // И таблица не пустая: иначе «не расширилась» означало бы «не прочиталась».
    expect(found.rows).toBeGreaterThanOrEqual(6);
    expect(Object.keys(found.table).sort()).toEqual(Object.keys(DECLARED).sort());
  });
});
