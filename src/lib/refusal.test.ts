import { describe, expect, it } from "vitest";
import { fromJournal, kind, line, next, say, technical, usable } from "./refusal";

/**
 * Шаг 87: отказ по-русски и коротко.
 *
 * Молчание неотличимо от поломки, а «policy_denied: destructive» — это не
 * по-русски и не коротко.
 */
describe("«не умею» и «нельзя» — разные вещи", () => {
  it("нет руки — это недоделка, а не запрет", () => {
    // Свалить недоделку на запрет — ложь, из-за которой человек перестаёт просить.
    const said = say("нет-руки", "открыть холодильник");
    expect(said).toContain("не умею");
    expect(said).toContain("недоделка");
    expect(kind("нет-руки")).toBe("не-умею");
  });

  it("деньги, личное, опасное — «нельзя»", () => {
    expect(kind("деньги")).toBe("нельзя");
    expect(say("деньги", "оплатить")).toContain("тратит деньги");
    expect(say("личное")).toContain("личные данные");
    expect(say("опасное")).toContain("опасно");
  });

  it("не вышло — это не «нельзя» и не «не умею»", () => {
    expect(kind("нет-сети")).toBe("не-вышло");
    expect(say("нет-сети")).toContain("нет сети");
  });
});

describe("отказ называет, чего не хватает", () => {
  it("причина названа в самом отказе", () => {
    expect(say("нет-места")).toContain("места");
    expect(say("не-нашлось", "файл отчёт.pdf")).toContain("отчёт.pdf");
    expect(say("не-нашлось", "файл отчёт.pdf")).toContain("такого нет");
  });

  it("не понял — честный отказ, а не «операция невозможна»", () => {
    const said = say("не-понял");
    expect(said).toContain("не понял");
    expect(said).toContain("не угадываю");
  });

  it("не знаю — сказано прямо, а не наугад", () => {
    expect(say("не-знаю")).toContain("наугад");
  });
});

describe("отказ даёт выход, а не тупик", () => {
  it("у каждого отказа есть «что теперь»", () => {
    for (const cause of ["нет-руки", "деньги", "личное", "опасное", "нет-сети", "нет-места", "не-нашлось", "не-понял", "не-знаю"] as const) {
      expect(next(cause).length).toBeGreaterThan(10);
    }
  });

  it("необратимо — выход прямо «не делаю»", () => {
    expect(next("опасное")).toContain("не делаю");
  });

  it("отказ — одно предложение, а не абзац", () => {
    // Отказ читают, когда хотят, чтобы что-то произошло; абзац не читают.
    const said = line("нет-сети", "сохранить");
    expect(said.split(".").length).toBeLessThan(4);
    expect(said).toContain("нет сети");
    expect(said).toContain("ещё раз");
  });
});

describe("техническая причина — второй, не первой", () => {
  it("человеческая причина первая, техническая названа отдельно", () => {
    expect(technical("policy_denied")).toContain("для поддержки");
    expect(line("деньги", "оплатить")).not.toContain("policy_denied");
  });

  it("причина журнала переводится в отказ без второго языка", () => {
    // На экране не должно быть двух разных слов об одном и том же.
    expect(fromJournal("нет сети")).toBe("нет-сети");
    expect(fromJournal("не хватает прав")).toBe("нет-доступа");
    expect(fromJournal("что-то своё")).toBe("не-знаю");
    expect(line(fromJournal("нет сети"))).toContain("нет сети");
  });

  it("пустой отказ — это молчание с другим именем", () => {
    expect(usable("")).toBe(false);
    expect(usable(line("нет-сети"))).toBe(true);
  });
});
