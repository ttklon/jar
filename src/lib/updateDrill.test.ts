import { describe, expect, it } from "vitest";
import { coverage, drill, when, type Snapshot } from "./updateDrill";

/**
 * Шаг 310: тест обновления N → N+1 → откат на N — и данные целы.
 *
 * Это репетиция, а не юнит-тест: после отката файл памяти на диске должен быть тем же.
 */

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  at: "до",
  memoryHash: "mm11",
  facts: 40,
  settings: ["имя", "голос", "тема"],
  journal: 120,
  modelHash: "md11",
  ...over,
});

describe("репетиция: обновление и откат", () => {
  it("всё на месте — прошла", () => {
    const got = drill(snap(), snap({ at: "после обновления", journal: 124 }), snap({ at: "после отката", journal: 126 }));
    expect(got.ok).toBe(true);
    expect(got.said).toContain("40 фактов");
  });

  it("журнал может расти при откате — это не потеря", () => {
    expect(drill(snap(), snap(), snap({ journal: 130 })).ok).toBe(true);
  });

  it("файл памяти другой после отката — откат испортил данные", () => {
    const got = drill(snap(), snap(), snap({ memoryHash: "mm99" }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("откат программы испортил данные");
  });

  it("обновление потеряло факты ещё до отката — ловим раньше", () => {
    const got = drill(snap(), snap({ facts: 37 }), snap());
    expect(got.problems.join()).toContain("ещё до отката");
  });

  it("после отката фактов меньше — тоже провал", () => {
    expect(drill(snap(), snap(), snap({ facts: 39 })).problems.join()).toContain("а было 40");
  });

  it("пропала настройка — названа по имени", () => {
    const got = drill(snap(), snap(), snap({ settings: ["имя", "тема"] }));
    expect(got.problems.join()).toContain("«голос»");
  });

  it("журнал укоротился — история не должна укорачиваться", () => {
    expect(drill(snap(), snap(), snap({ journal: 100 })).problems.join()).toContain("история не должна укорачиваться");
  });

  it("модель изменилась — откат не должен трогать гигабайты", () => {
    expect(drill(snap(), snap(), snap({ modelHash: "md99" })).problems.join()).toContain("гигабайты");
  });
});

describe("чему верить в репетиции", () => {
  it("четыре условия покрытия", () => {
    const got = coverage();
    expect(got.length).toBe(4);
    expect(got.join()).toContain("без сети");
    expect(got.join()).toContain("кириллицей");
  });

  it("сломанная версия N+1 — иначе откат не проверяется", () => {
    expect(coverage().join()).toContain("сломана намеренно");
  });

  it("частота названа числом, а не «регулярно»", () => {
    expect(when()).toContain("каждый релиз");
    expect(when()).toContain("раз в месяц");
  });
});
