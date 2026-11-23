import { describe, expect, it } from "vitest";
import {
  CONDITION_LABEL,
  headline,
  nextStep,
  normalize,
  summarize,
  unproven,
  type StateItem,
} from "./state";

/**
 * Шаг 1: один честный экран «можно/нельзя».
 *
 * Блокер — не «мало информации», а «много информации и вся разная». Поэтому
 * проверяется прежде всего **честность**: что экран не может сказать «готово»
 * без доказательства и не может спрятать непроверенное.
 */
const item = (over: Partial<StateItem> = {}): StateItem => ({
  id: "engine",
  title: "Движок",
  hint: "то, что запускает модель",
  condition: "proven-here",
  evidence: "процесс запущен",
  screen: "models",
  ...over,
});

describe("словарь состояния", () => {
  it("четыре слова, и «готово» среди них нет", () => {
    // «Готово» уже один раз вводило в заблуждение: оно не говорит, где
    // проверено. Словарь — это и есть исправление.
    const words = Object.values(CONDITION_LABEL);
    expect(words).toHaveLength(4);
    expect(words.join(" ").toLowerCase()).not.toContain("готов");
    expect(words).toContain("проверено на этой машине");
  });

  it("«проверено» без подтверждения — не проверено", () => {
    // Вера — не проверка. Экран не должен врать из вежливости.
    expect(normalize(item({ evidence: null })).condition).toBe("not-checked");
    expect(normalize(item({ evidence: "   " })).condition).toBe("not-checked");
    // А с подтверждением остаётся как было.
    expect(normalize(item({ evidence: "лог прогона" })).condition).toBe("proven-here");
  });
});

describe("сводка", () => {
  it("считается из пунктов, а не пишется руками", () => {
    // Вторая правда разошлась бы с первой на первой перезагрузке.
    const items = [
      item({ id: "a", condition: "proven-here" }),
      item({ id: "b", condition: "not-checked", evidence: null }),
      item({ id: "c", condition: "not-installed", evidence: null }),
      item({ id: "d", condition: "failed", evidence: "лог" }),
    ];
    expect(summarize(items)).toEqual({
      total: 4,
      proven: 1,
      notChecked: 1,
      notInstalled: 1,
      failed: 1,
    });
  });

  it("сводка сама понижает «проверено без доказательства»", () => {
    // Иначе сводка показала бы зелёное, а список под ней — честное.
    const summary = summarize([item({ evidence: null })]);
    expect(summary.proven).toBe(0);
    expect(summary.notChecked).toBe(1);
  });

  it("строка верха называет числа, а не «всё работает»", () => {
    // «Всё работает» врёт при непроверенном; «есть проблемы» пугает, когда всё
    // в порядке. Числа не врут ни там, ни там.
    expect(headline({ total: 6, proven: 3, notChecked: 2, notInstalled: 0, failed: 1 })).toBe(
      "3 проверено · 2 не проверено · 1 провал",
    );
    expect(headline({ total: 6, proven: 3, notChecked: 0, notInstalled: 0, failed: 2 })).toBe(
      "3 проверено · 2 провала",
    );
    expect(headline({ total: 6, proven: 0, notChecked: 0, notInstalled: 0, failed: 5 })).toBe(
      "5 провалов",
    );
  });

  it("нечего проверять — это норма, и строка звучит нормой", () => {
    expect(headline({ total: 0, proven: 0, notChecked: 0, notInstalled: 0, failed: 0 })).toBe(
      "проверять нечего",
    );
  });
});

describe("что делать первым", () => {
  it("провал важнее непроверенного, непроверенное — важнее неустановленного", () => {
    // Порядок по цене бездействия: установка без проверки даёт ложную
    // уверенность, а провал — уже случившаяся поломка.
    const items = [
      item({ id: "install", condition: "not-installed", evidence: null }),
      item({ id: "check", condition: "not-checked", evidence: null }),
      item({ id: "fail", condition: "failed", evidence: "лог" }),
    ];
    expect(nextStep(items)?.id).toBe("fail");
    expect(nextStep(items.slice(0, 2))?.id).toBe("check");
    expect(nextStep(items.slice(0, 1))?.id).toBe("install");
    // Делать нечего — честный `null`, а не первый из списка ради галочки.
    expect(nextStep([item()])).toBeNull();
  });

  it("непроверенное не прячется — оно перечислено", () => {
    // Экран, который показывает только зелёное, — витрина, а не состояние.
    const items = [
      item({ id: "a" }),
      item({ id: "b", condition: "not-checked", evidence: null }),
      item({ id: "c", condition: "not-installed", evidence: null }),
      item({ id: "d", condition: "failed", evidence: "лог" }),
    ];
    expect(unproven(items).map((element) => element.id)).toEqual(["b", "d"]);
  });
});
