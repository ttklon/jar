import { describe, expect, it } from "vitest";
import { gaps, lines, nothing, riskOf, riskWord, safe, scope, worst, type Preview, type Step } from "./planPreview";

/**
 * Шаг 101: план показывает цель, шаги, риск и что будет сделано — до запуска.
 *
 * Согласие на слепой запуск — это не согласие.
 */
const step = (what: string, risk: Step["risk"] = "write-local", undoable = false): Step => ({
  what,
  changes: "имена станут датами",
  risk,
  undoable,
});
const plan = (steps: Step[], goal = "переименовать фото по дате съёмки"): Preview => ({ goal, steps });

describe("до запуска видно всё, на что соглашаются", () => {
  it("цель первой строкой", () => {
    expect(lines(plan([step("переименовать 12 файлов")]))[0]).toContain("переименовать фото");
  });

  it("шаги по порядку и словами", () => {
    const out = lines(plan([step("найти фото"), step("переименовать 12 файлов")]));
    expect(out.some((line) => line.startsWith("1. найти фото"))).toBe(true);
    expect(out.some((line) => line.startsWith("2. переименовать"))).toBe(true);
  });

  it("что изменит шаг — названо, а не подразумевается", () => {
    expect(lines(plan([step("переименовать")])).join(" ")).toContain("имена станут датами");
  });
});

describe("риск виден там, где решение", () => {
  it("самый опасный риск вынесен наверх, а не средний", () => {
    // Согласие дают на самое опасное.
    const mixed = plan([step("прочитать", "read", true), step("стереть", "destructive")]);
    expect(worst(mixed)).toBe("destructive");
    expect(lines(mixed)[1]).toContain("стирает без возврата");
  });

  it("риск назван по-русски, а не кодом", () => {
    expect(riskWord("money")).toContain("деньги");
    expect(riskWord("read")).toContain("читает");
    expect(lines(plan([step("стереть", "destructive")])).join(" ")).not.toContain("destructive");
  });

  it("необратимость названа отдельно от риска", () => {
    // «Отмена не вернёт» — другой факт, чем «риск: запись».
    const out = lines(plan([step("переименовать")])).join(" ");
    expect(out).toContain("не отменяется");
    expect(out).toContain("отмена не вернёт");
  });

  it("всё читающее и отменяемое — можно без дополнительного согласия", () => {
    expect(safe(plan([step("прочитать", "read", true)]))).toBe(true);
    expect(safe(plan([step("переименовать")]))).toBe(false);
    expect(safe(plan([step("стереть", "destructive")]))).toBe(false);
  });
});

describe("незнакомый риск — не «безопасно»", () => {
  it("риск строкой из ядра приводится к известному", () => {
    expect(riskOf("read")).toBe("read");
    expect(riskOf("destructive")).toBe("destructive");
  });

  it("неизвестное значение — самый высокий риск, а не чтение", () => {
    // Неизвестное не должно выглядеть безопасным.
    expect(riskOf("что-то новое")).toBe("destructive");
  });
});

describe("объём называется числом", () => {
  it("«12 файлов в Загрузках», а не «изменить файлы»", () => {
    // Без числа человек соглашается на неизвестный объём.
    expect(scope(12, "Загрузках")).toContain("12");
    expect(scope(12, "Загрузках")).toContain("Загрузках");
  });

  it("один и много — по-русски, а не «1 изменений»", () => {
    expect(scope(1, "папке")).toContain("1 изменение");
    expect(scope(5, "папке")).toContain("5 изменений");
  });

  it("объём не назван — так и сказано, а не пропущено", () => {
    expect(scope(null, "папке")).toContain("спрошу");
  });
});

describe("пустое не сходит за успех", () => {
  it("пустой план назван «делать нечего»", () => {
    expect(lines(plan([]))[1]).toContain("делать нечего");
    expect(nothing()).toContain("не успех");
  });

  it("чего не хватает — названо поимённо", () => {
    const missing = gaps({ goal: "", steps: [{ what: "x", changes: "", risk: "read", undoable: true }] });
    expect(missing).toContain("цель");
    expect(missing).toContain("что изменит шаг 1");
  });

  it("полный предпросмотр ничего не теряет", () => {
    expect(gaps(plan([step("переименовать")]))).toEqual([]);
  });
});
