import { describe, expect, it } from "vitest";
import { notDo, repair, states, toggle, view, type Registry } from "./autostartCheckbox";

/**
 * Шаг 451: автозапуск с галочкой в настройках и записью без дублей.
 */

const registry = (over: Partial<Registry> = {}): Registry => ({ ours: 0, rightPath: false, ...over });

describe("галочка читает реестр, а не флаг", () => {
  it("записи нет — выключено", () => {
    const got = view(registry());
    expect([got.checked, got.broken]).toEqual([false, false]);
  });

  it("одна запись с верным путём — включено", () => {
    const got = view(registry({ ours: 1, rightPath: true }));
    expect([got.checked, got.broken]).toEqual([true, false]);
  });

  it("две записи — сломано, и число копий названо", () => {
    const got = view(registry({ ours: 2, rightPath: true }));
    expect(got.broken).toBe(true);
    expect(got.hint).toContain("запустились бы 2 копии");
  });

  it("старый путь — сломано, хотя галочка стоит", () => {
    const got = view(registry({ ours: 1, rightPath: false }));
    expect(got.checked).toBe(true);
    expect(got.broken).toBe(true);
    expect(got.hint).toContain("при входе ничего не запустится");
  });

  it("четыре состояния видны", () => {
    expect(states()).toHaveLength(4);
  });
});

describe("включение идемпотентно", () => {
  it("включили — одна запись", () => {
    expect(toggle(registry(), true).registry.ours).toBe(1);
  });

  it("нажали ещё раз — по-прежнему одна", () => {
    const once = toggle(registry(), true).registry;
    const twice = toggle(once, true);
    expect(twice.registry.ours).toBe(1);
    expect(twice.said).toContain("ничего не меняю");
  });

  it("включение из «двух записей» — одна, а не три", () => {
    expect(toggle(registry({ ours: 2, rightPath: true }), true).registry.ours).toBe(1);
  });

  it("выключение убирает всё", () => {
    const got = toggle(registry({ ours: 3, rightPath: true }), false);
    expect(got.registry.ours).toBe(0);
  });
});

describe("«исправить» — по нажатию, а не само", () => {
  it("дубли: остаётся одна, число убранных названо", () => {
    const got = repair(registry({ ours: 3, rightPath: true }));
    expect(got.registry.ours).toBe(1);
    expect(got.said).toContain("убрано 2 лишних записи");
  });

  it("старый путь: запись обновлена", () => {
    const got = repair(registry({ ours: 1, rightPath: false }));
    expect(got.registry.rightPath).toBe(true);
    expect(got.said).toContain("путь в записи обновлён");
  });

  it("исправлять нечего", () => {
    expect(repair(registry({ ours: 1, rightPath: true })).said).toBe("исправлять нечего");
  });
});

describe("три дефекта, которых не должно быть", () => {
  it("не флаг вместо реестра, не молчаливое исправление, не самовключение", () => {
    const got = notDo().join();
    expect(got).toContain("галочка врала бы");
    expect(got).toContain("удаление записей — действие человека");
    expect(got).toContain("только галочкой");
  });
});
