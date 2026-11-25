import { describe, expect, it } from "vitest";
import { asksToDisable, audit, ifDeleted, reply, safeAlternative } from "./antivirusPeace";

/**
 * Шаг 311: установщик не требует отключения антивируса — иначе подозрительно.
 *
 * «Добавьте в исключения» перекладывает проблему на человека.
 */

describe("три причины, и ни одна не лечится отключением защиты", () => {
  it("нет репутации — проходит само, человеку делать нечего", () => {
    const got = reply({ kind: "unsigned" });
    expect(got.said).toContain("репутация");
    expect(got.weDo).toContain("человеку делать ничего не нужно");
  });

  it("эвристика — наша проблема, а не человека", () => {
    const got = reply({ kind: "heuristic" });
    expect(got.said).toContain("наша проблема");
    expect(got.weDo).toContain("меняем установщик");
  });

  it("ложное срабатывание — пишем вендору с хешем", () => {
    const got = reply({ kind: "falsePositive" });
    expect(got.weDo).toContain("вендору");
    expect(got.weDo).toContain("хешем");
  });

  it("ни один ответ не просит отключить защиту", () => {
    for (const kind of ["unsigned", "heuristic", "falsePositive"] as const) {
      const got = reply({ kind });
      expect(asksToDisable(got.said)).toBe(false);
      expect(asksToDisable(got.weDo)).toBe(false);
    }
  });
});

describe("такие советы ловятся в тексте, а не на глаза", () => {
  it("«отключите антивирус» — ловим", () => {
    expect(asksToDisable("если не ставится — отключите антивирус")).toBe(true);
  });

  it("«добавьте в исключения» — тоже", () => {
    expect(asksToDisable("добавьте папку в исключения антивируса")).toBe(true);
  });

  it("«в список исключений» — тоже", () => {
    expect(asksToDisable("добавьте папку в список исключений")).toBe(true);
  });

  it("«приостановите защиту» — тоже", () => {
    expect(asksToDisable("приостановите защиту на время установки")).toBe(true);
  });

  it("нормальный текст про защиту — не ловится", () => {
    expect(asksToDisable("антивирус не знает файл: это проходит за несколько дней")).toBe(false);
  });

  it("аудит инструкции называет текст, где нашёл", () => {
    const got = audit(["обычная строка", "выключите защиту перед установкой"]);
    expect(got.length).toBe(1);
    expect(got[0]).toContain("отключите защиту");
  });
});

describe("что предложить вместо", () => {
  it("проверить подпись самому — не выключая защиту", () => {
    const got = safeAlternative();
    expect(got).toContain("Цифровые подписи");
    expect(asksToDisable(got)).toBe(false);
  });

  it("антивирус удалил установщик — скачать заново, а не выключить", () => {
    const got = ifDeleted();
    expect(got).toContain("заново");
    expect(asksToDisable(got)).toBe(false);
  });
});
