import { describe, expect, it } from "vitest";
import type { FlowStepView, FlowView, StepResult } from "../ipc/types";
import type { StepRecord } from "./flows";
import { missingInputs, resolveParams, runFlow, worstRisk } from "./flows";

/** Запись шага по номеру: без индексной арифметики в утверждениях. */
function at(records: StepRecord[], index: number): StepRecord {
  const record = records[index];
  if (!record) {
    throw new Error(`нет шага ${index}`);
  }
  return record;
}

function step(patch: Partial<FlowStepView> = {}): FlowStepView {
  return {
    tool: "files|проверить|свободное место",
    title: "Свободное место",
    note: "смотрим диски",
    params: {},
    risk: "read",
    decision: "allow",
    decision_reason: "чтение",
    needs_token: false,
    ...patch,
  };
}

function flow(patch: Partial<FlowView> = {}): FlowView {
  return {
    id: "demo",
    title: "Демо",
    summary: "два шага",
    registry: "files|проверить|свободное место",
    risk: "read",
    decision: "allow",
    decision_reason: "чтение",
    needs_token: false,
    inputs: [],
    steps: [step(), step({ tool: "network|проверить|подключение" })],
    ...patch,
  };
}

function okResult(registry: string, patch: Partial<StepResult> = {}): StepResult {
  return {
    registry,
    ok: true,
    evidence: { kind: "exit_code", code: 0 },
    reason: "готово",
    stdout_tail: "",
    stderr_tail: "",
    exit_code: 0,
    timed_out: false,
    cancelled: false,
    duration_ms: 12,
    ...patch,
  };
}

describe("сценарий", () => {
  it("выполняет все шаги по порядку, если они безопасны", async () => {
    const order: string[] = [];
    const run = await runFlow(flow(), {}, {
      confirm: async () => {
        throw new Error("подтверждение не должно спрашиваться");
      },
      run: async (current) => {
        order.push(current.tool);
        return okResult(current.tool);
      },
    });

    expect(run.ok).toBe(true);
    expect(run.stopped).toBe("done");
    expect(order).toHaveLength(2);
    expect(run.records.map((record) => record.status)).toEqual(["ok", "ok"]);
  });

  it("спрашивает человека перед опасным шагом и останавливается при отказе", async () => {
    const dangerous = step({
      tool: "files|удалить|в корзину",
      risk: "destructive",
      decision: "confirm",
      needs_token: true,
    });
    const subjects = flow({ steps: [step(), dangerous] });
    let executed = 0;

    const run = await runFlow(subjects, {}, {
      confirm: async () => false,
      run: async (current) => {
        executed += 1;
        return okResult(current.tool);
      },
    });

    expect(executed).toBe(1);
    expect(run.ok).toBe(false);
    expect(run.stopped).toBe("declined");
    expect(at(run.records, 1).status).toBe("declined");
    expect(at(run.records, 1).result).toBeUndefined();
  });

  it("останавливается на первом провале и не выполняет остаток", async () => {
    const run = await runFlow(flow(), {}, {
      confirm: async () => true,
      run: async (current) =>
        okResult(current.tool, {
          ok: false,
          reason: "нет доказательства",
          evidence: { kind: "failed", reason: "нет доказательства" },
        }),
    });

    expect(run.ok).toBe(false);
    expect(run.stopped).toBe("failed");
    expect(at(run.records, 0).status).toBe("failed");
    expect(at(run.records, 1).status).toBe("skipped");
    expect(at(run.records, 1).result).toBeUndefined();
  });

  it("уважает отмену перед шагом", async () => {
    const run = await runFlow(flow(), {}, {
      shouldStop: () => true,
      confirm: async () => true,
      run: async (current) => okResult(current.tool),
    });

    expect(run.stopped).toBe("cancelled");
    expect(run.records.every((record) => record.status === "skipped")).toBe(true);
  });

  it("подставляет входы и ругается на пустой", () => {
    const withInput = step({ params: { path: "$folder" } });
    expect(resolveParams(withInput, { folder: " C:\\tmp " })).toEqual({ path: "C:\\tmp" });
    expect(() => resolveParams(withInput, {})).toThrow(/не заполнен вход/);

    const scenario = flow({
      inputs: [
        { name: "folder", label: "Папка", placeholder: "", hint: "", required: true },
      ],
      steps: [withInput],
    });
    expect(missingInputs(scenario, {})).toEqual(["Папка"]);
    expect(missingInputs(scenario, { folder: "C:\\tmp" })).toEqual([]);
  });

  it("риск сценария — риск самого опасного шага", () => {
    const scenario = flow({
      steps: [step(), step({ risk: "destructive", tool: "files|удалить|в корзину" })],
    });
    expect(worstRisk(scenario)).toBe("destructive");
  });
});
