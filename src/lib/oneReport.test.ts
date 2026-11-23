import { describe, expect, it } from "vitest";
import type { Evidence, PlanStepRun, RunStep, StepResult } from "../ipc/types";
import { attention, one, proofOf, summary, whole } from "./oneReport";

/**
 * Шаг 106: одинаковый результат руки на всех экранах.
 *
 * Три формы одного факта — три правды: в истории «выполнен», в плане «failed», на
 * экране инструмента «ok с оговоркой».
 */
const run: RunStep = {
  position: 0,
  tool: "files|создать|папку",
  ok: true,
  reason: "",
  evidence: "путь существует",
};

const plan: PlanStepRun = {
  position: 1,
  registry: "files|создать|папку",
  status: "ok",
  reason: "",
  evidence: "путь существует",
  duration_ms: 12,
};

const result: StepResult = {
  registry: "files|создать|папку",
  ok: true,
  evidence: { kind: "path_exists", path: "D:\\Отчёты", exists: true },
  reason: "",
  stdout_tail: "",
  stderr_tail: "",
  exit_code: 0,
  timed_out: false,
  cancelled: false,
  duration_ms: 12,
};

describe("три формы сводятся к одному отчёту", () => {
  it("одинаковый шаг — одинаковый вердикт во всех трёх формах", () => {
    // Именно этого не было: формы отвечали по-разному об одном факте.
    expect(one(run).ok).toBe(true);
    expect(one(plan).ok).toBe(true);
    expect(one(result as never).ok).toBe(true);
  });

  it("адрес руки на месте во всех трёх", () => {
    expect(one(run).tool).toBe("files|создать|папку");
    expect(one(plan).tool).toBe("files|создать|папку");
    expect(one(result as never).tool).toBe("files|создать|папку");
  });

  it("позиция из плана не пересчитывается: экран уже говорит «шаг 1»", () => {
    expect(one(plan).position).toBe(1);
  });

  it("структура доказательства переводится в те же слова, что на экране «Руки»", () => {
    expect(proofOf({ kind: "renamed", folder: "D:\\Фото", count: 12 })).toContain("12");
  });
});

describe("ничего не теряется по дороге", () => {
  it("отмена не становится провалом", () => {
    const cancelled = one({ ...plan, status: "cancelled" } as PlanStepRun);
    expect(cancelled.cancelled).toBe(true);
    expect(cancelled.reason).toContain("отменено");
  });

  it("таймаут назван причиной, а не «нет»", () => {
    const slow = one({ ...result, ok: false, timed_out: true } as never);
    expect(slow.reason).toContain("не успел");
  });

  it("«сделано в прошлый раз» — не доказательство", () => {
    expect(one({ ...run, evidence: "previous-run" } as RunStep).proof).toBe("");
  });

  it("пустое доказательство остаётся пустым, а не превращается в успех", () => {
    expect(one({ ...run, evidence: "  " } as RunStep).proof).toBe("");
  });
});

describe("противоречие называется, а не выбирается молча", () => {
  it("«успех» с доказательством провала — противоречие", () => {
    const odd = { ...result, evidence: { kind: "failed", reason: "файл не найден" } as Evidence };
    const got = one(odd as never);
    expect(got.conflicts[0]).toContain("доказательство говорит о провале");
    expect(got.ok).toBe(false);
  });

  it("внимание человека называет шаг", () => {
    const got = whole([one(result as never), one({ ...result, timed_out: true, ok: false } as never, 2)]);
    expect(attention(got).some((line) => line.includes("по времени"))).toBe(true);
  });
});

describe("итог — числом, а не словом «успешно»", () => {
  it("сделано N из M, отменено и без доказательства названы", () => {
    const got = whole([
      one(run),
      one({ ...plan, status: "cancelled", evidence: "" } as PlanStepRun),
      one({ ...plan, position: 2, status: "failed", evidence: "" } as PlanStepRun),
    ]);
    const said = summary(got);
    expect(said).toContain("сделано 1 из 3");
    expect(said).toContain("отменено 1");
    expect(said).toContain("без доказательства 2");
  });

  it("пустой отчёт не выдаёт себя за успех", () => {
    expect(summary(whole([]))).toBe("сделано 0 из 0");
  });
});
