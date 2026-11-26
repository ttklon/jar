import { describe, expect, it } from "vitest";
import { again, fromRun, line } from "./journalReplay";
import type { RunRecord } from "../ipc";

/**
 * Шаг 45: «разобрать заново» — данные, а не повторный запуск.
 *
 * Главное, что проверяется: разбор вчерашнего провала не трогает мир и честно
 * называет то, чего память не хранит.
 */

function run(patch: Partial<RunRecord> = {}): RunRecord {
  return {
    id: 12,
    kind: "tool",
    subject: "почистить загрузки",
    started_ms: 1_700_000_000_000,
    finished_ms: 1_700_000_002_000,
    outcome: "failed",
    steps: [
      { position: 0, tool: "files|найти|файл", ok: true, reason: "", evidence: "found: 42" },
      { position: 1, tool: "files|удалить|файл", ok: false, reason: "EACCES", evidence: "" },
    ],
    ...patch,
  };
}

describe("разбор журнала заново", () => {
  it("из запуска собирается запись с фразой, временем и шагами", () => {
    const entry = fromRun(run());
    expect(entry.subject).toBe("почистить загрузки");
    expect(entry.startedMs).toBe(1_700_000_000_000);
    expect(entry.steps.map((step) => step.tool)).toEqual(["files|найти|файл", "files|удалить|файл"]);
  });

  it("воспроизведение не запускает ничего: это чтение данных", () => {
    // Если бы «разобрать заново» повторяло шаги, вчерашний провал удалял бы
    // сегодняшние файлы. Правило reproduce это запрещает.
    const got = again(run());
    expect(got.steps).toHaveLength(2);
  });

  it("чего память не хранит — названо, а не выдано за совпадение", () => {
    const got = again(run());
    // Длительность шага память запусков не хранит; сравнить с прежним отчётом
    // тоже не с чем — значит, «совпало» утверждать нельзя.
    expect(got.matches).toBe(false);
    expect(line(run())).toMatch(/воспроизведено/);
  });

  it("отменённый запуск не выдаёт свои шаги за провал", () => {
    const entry = fromRun(run({ outcome: "cancelled", steps: [{ position: 0, tool: "files|удалить|файл", ok: false, reason: "", evidence: "" }] }));
    expect(entry.steps[0]?.cancelled).toBe(true);
  });

  it("шаги сортируются по позиции: память может отдать их в любом порядке", () => {
    const entry = fromRun(
      run({
        steps: [
          { position: 2, tool: "c", ok: true, reason: "", evidence: "" },
          { position: 0, tool: "a", ok: true, reason: "", evidence: "" },
        ],
      }),
    );
    expect(entry.steps.map((step) => step.tool)).toEqual(["a", "c"]);
  });
});
