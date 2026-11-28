import { describe, expect, it } from "vitest";
import { keptAndLost, snap, summaryOf } from "./switchCheck";
import { DRAFT_KEY } from "./draft";
import type { RunRecord } from "../ipc/types";

/**
 * Шаг 78: переключение профиля без перезапуска — и **отчёт**, а не обещание.
 *
 * Правило `switchNoRestart` говорит, что переключение это смена трёх ссылок.
 * Проверяемо это одним способом: снимок до, снимок после, разница словами.
 * Иначе «ничего не потерялось» — это утверждение о моих намерениях, а не о
 * том, что произошло.
 */

function storage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return {
    getItem: (key: string): string | null => (key in data ? data[key] ?? null : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
}

function run(steps: boolean[], outcome = "running"): RunRecord {
  return {
    id: 1,
    kind: "plan",
    subject: "уборка",
    started_ms: 0,
    finished_ms: null,
    outcome,
    steps: steps.map((ok, index) => ({
      position: index,
      tool: "files",
      ok,
      reason: "",
      evidence: "",
    })),
    session: "",
  };
}

describe("снимок «что живо» (шаг 78)", () => {
  it("читает черновик, шаги идущего дела и движок", () => {
    const got = snap([run([true, true, false])], { running: true }, storage());
    expect(got.stepsDone).toBe(2);
    expect(got.modelReady).toBe(true);
  });

  it("законченное дело шагами не считается: оно не идёт", () => {
    // Иначе «выполнено 3 шага» относилось бы к делу, которое закончилось
    // вчера, и отчёт хвалил бы переключение за чужую работу.
    const got = snap([run([true, true, true], "ok")], { running: false }, storage());
    expect(got.stepsDone).toBe(0);
    expect(got.modelReady).toBe(false);
  });

  it("черновик берётся из настоящего места, а не из воздуха", () => {
    const got = snap([], null, storage({ [DRAFT_KEY]: "убери загрузки" }));
    expect(got.draft).toBe("убери загрузки");
  });

  it("движка нет — модель не загружена, а не «неизвестно»", () => {
    const got = snap([], null, storage());
    expect(got.modelReady).toBe(false);
  });
});

describe("отчёт: что сохранилось и что потерялось", () => {
  it("фраза, шаги и модель на месте — все три названы", () => {
    const before = { draft: "убери загрузки", stepsDone: 2, modelReady: true };
    const { kept, lost } = keptAndLost(before, { ...before }, "Аня");
    expect(lost).toEqual([]);
    expect(kept.join(" ")).toContain("набранная фраза");
    expect(kept.join(" ")).toContain("выполнено шагов 2");
    expect(kept.join(" ")).toContain("загруженная модель");
  });

  it("потеря называется потерей, а не замалчивается", () => {
    const before = { draft: "убери загрузки", stepsDone: 2, modelReady: true };
    const after = { draft: "", stepsDone: 0, modelReady: false };
    const { kept, lost } = keptAndLost(before, after, "Аня");
    expect(kept).toEqual([]);
    expect(lost).toHaveLength(3);
    expect(lost.join(" ")).toContain("стала «»");
    expect(lost.join(" ")).toContain("потеряло шаги: было 2, стало 0");
    expect(lost.join(" ")).toContain("модель выгрузилась");
  });

  it("терять было нечего — это сказано, а не выдано за успех", () => {
    // Пустое поле и никаких дел: «ничего не потерялось» здесь значило бы, что
    // проверка не нашла ничего, потому что проверять было нечего.
    const empty = { draft: "", stepsDone: 0, modelReady: false };
    const { kept, lost } = keptAndLost(empty, empty, "Аня");
    expect(lost).toEqual([]);
    expect(kept[0]).toContain("нечего было терять");
  });

  it("длинная фраза в отчёте укорачивается: её читает диктор", () => {
    const long = "у".repeat(200);
    const { kept } = keptAndLost({ draft: long, stepsDone: 0, modelReady: false }, { draft: long, stepsDone: 0, modelReady: false }, "Аня");
    expect(kept[0]?.length ?? 0).toBeLessThan(90);
    expect(kept[0]).toContain("…");
  });
});

describe("одна строка для диктора и журнала", () => {
  it("называет человека, «без перезапуска» и сохранённое", () => {
    const before = { draft: "убери загрузки", stepsDone: 1, modelReady: true };
    const said = summaryOf(before, { ...before }, "Аня");
    expect(said).toContain("«Аня»");
    expect(said).toContain("без перезапуска");
    expect(said).toContain("Ничего не потеряно");
  });

  it("проблему правила называет первой, а не хвалит сохранённое", () => {
    // Правило `switchNoRestart.verify` — единственный судья. Если оно нашло
    // проблему, отчёт не имеет права начинать с «сохранено».
    const said = summaryOf(
      { draft: "x", stepsDone: 0, modelReady: true },
      { draft: "x", stepsDone: 0, modelReady: false },
      "Аня",
    );
    expect(said).toContain("проверка нашла");
    expect(said).toContain("модель выгрузилась");
    expect(said).not.toContain("Сохранено:");
  });
});
