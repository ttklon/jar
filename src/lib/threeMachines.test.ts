import { describe, expect, it } from "vitest";
import { accept, checkMachines, checks, notDo, whyThree, type Machine, type Outcome } from "./threeMachines";

/**
 * Шаг 492: живая приёмка на трёх машинах разной силы.
 */

const machine = (over: Partial<Machine> = {}): Machine => ({ name: "старый ноут", class: "слабая", ram: 4, disk: 40, ...over });
const machines = (): Machine[] => [machine(), machine({ name: "мой", class: "средняя", ram: 16 }), machine({ name: "рабочая", class: "сильная", ram: 32 })];
const outcome = (over: Partial<Outcome> = {}): Outcome => ({ machine: "старый ноут", scenario: "почисти загрузки", ok: true, ...over });

describe("три машины, три класса", () => {
  it("набор из трёх классов — проходит", () => {
    expect(checkMachines(machines())).toEqual([]);
  });

  it("три средние — слабую не заменяют", () => {
    const got = checkMachines([machine({ class: "средняя" }), machine({ name: "b", class: "средняя" }), machine({ name: "c", class: "сильная" })]);
    expect(got.join()).toContain("нет машины класса «слабая»");
  });

  it("мало диска — приёмка не про установку", () => {
    expect(checkMachines(machines().map((m) => ({ ...m, disk: 5 }))).join()).toContain("приёмка не про установку");
  });

  it("что ловит только слабая", () => {
    expect(whyThree()[0]!.catches).toContain("медленно и падает");
  });
});

describe("приёмка — на всех трёх", () => {
  const all = (): Outcome[] => machines().map((m) => outcome({ machine: m.name }));

  it("все прошли — принято", () => {
    const got = accept(machines(), all());
    expect(got.ok).toBe(true);
    expect(got.said).toContain("3 машин × 1 сценариев прошли");
  });

  it("упало на слабой — не принято, даже если на средней прошло", () => {
    const got = accept(machines(), all().map((o) => (o.machine === "старый ноут" ? { ...o, ok: false, saw: "дело шло 40 секунд и зависло" } : o)));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("старый ноут (слабая)");
    expect(got.said).toContain("дело шло 40 секунд и зависло");
  });

  it("не запускали — провал, а не успех", () => {
    const got = accept(machines(), all().filter((o) => o.machine !== "рабочая"));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("рабочая (сильная): сценарий «почисти загрузки» не запускали");
  });

  it("упало без объяснения — так и сказано", () => {
    const got = accept(machines(), all().map((o) => (o.machine === "мой" ? { ...o, ok: false } : o)));
    expect(got.said).toContain("не сказано, что видел человек");
  });
});

describe("чего приёмка не делает", () => {
  it("не принимает по средней", () => {
    expect(notDo()[0]).toContain("половина людей на слабой");
    expect(checks()).toHaveLength(3);
  });
});
