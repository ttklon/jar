import { describe, expect, it } from "vitest";
import { deedText, evidenceText, judge, links, oneLine } from "./deed";
import type { Deed } from "./deed";

/**
 * Шаг 361. Карточка дела проверяется по правилам, а не по вёрстке:
 * доказательство не выдумывается, отменить можно только идущее, повторить —
 * только то, у чего есть правило повтора.
 */

function deed(patch: Partial<Deed> = {}): Deed {
  return {
    id: 1,
    subject: "разобрать «Загрузки» по папкам",
    kind: "plan",
    startedMs: Date.UTC(2026, 10, 20, 12, 34),
    finishedMs: Date.UTC(2026, 10, 20, 12, 35),
    outcome: "ok",
    steps: [
      { position: 1, tool: "files|создать|папку", ok: true, evidence: "folder-created" },
      { position: 2, tool: "files|перенести|файлы", ok: true, evidence: "moved: 12" },
    ],
    ...patch,
  };
}

describe("карточка дела", () => {
  it("в одну строку помещается что, когда и чем кончилось", () => {
    const line = oneLine(deed());
    expect(line).toContain("разобрать «Загрузки» по папкам");
    expect(line).toContain("готово");
    expect(line).toContain("шагов 2");
    // Время — в местном формате, поэтому проверяем только формат чч:мм.
    expect(line).toMatch(/\d{2}:\d{2}/);
  });

  it("у дела без шагов счёт шагов не выдумывается", () => {
    const line = oneLine(deed({ kind: "download", steps: [], subject: "модель" }));
    expect(line).not.toContain("шагов");
    expect(line).toContain("готово");
  });

  it("идёт — отменять можно, повторять нельзя", () => {
    const verdict = judge(deed({ outcome: "running", finishedMs: null }));
    expect(verdict.canCancel).toBe(true);
    expect(verdict.canRepeat).toBe(false);
    expect(verdict.repeatWhy).toContain("ещё идёт");
    expect(verdict.verdict).toBe("идёт");
  });

  it("законченное дело отменить нельзя: отменять нечего", () => {
    // Кнопка «отменить» у готового дела — ложь, и человек будет на неё жать.
    expect(judge(deed()).canCancel).toBe(false);
    expect(judge(deed({ outcome: "failed" })).canCancel).toBe(false);
  });

  it("повторить можно план, инструмент и сценарий", () => {
    for (const kind of ["plan", "tool", "flow"]) {
      const verdict = judge(deed({ kind, outcome: "failed" }));
      expect(verdict.canRepeat, kind).toBe(true);
      expect(verdict.repeatWhy).toBe("");
    }
  });

  it("скачивание и распознавание кнопкой не повторяются — и сказано почему", () => {
    // Обещать общий повтор значило бы обещать то, чего нет: у них своё правило.
    for (const kind of ["download", "speech", "server"]) {
      const verdict = judge(deed({ kind }));
      expect(verdict.canRepeat, kind).toBe(false);
      expect(verdict.repeatWhy).not.toBe("");
    }
  });

  it("пропущенные шаги не считаются сделанными сейчас", () => {
    // «Сделано в прошлый раз» и «сделано сейчас» — разные факты.
    const verdict = judge(
      deed({
        outcome: "failed",
        steps: [
          { position: 1, tool: "a", ok: true, status: "skipped", reason: "сделано раньше" },
          { position: 2, tool: "b", ok: true },
          { position: 3, tool: "c", ok: false, reason: "нет прав" },
        ],
      }),
    );
    expect(verdict.total).toBe(2);
    expect(verdict.done).toBe(1);
    expect(verdict.failed).toBe(1);
  });

  it("без доказательства так и написано, а не придумано", () => {
    expect(evidenceText({ position: 1, tool: "a", ok: true })).toBeNull();
    expect(evidenceText({ position: 1, tool: "a", ok: true, evidence: "   " })).toBeNull();
    // Служебная метка «сделано в прошлый раз» — не доказательство работы.
    expect(evidenceText({ position: 1, tool: "a", ok: true, evidence: "previous-run" })).toBeNull();
    expect(evidenceText({ position: 1, tool: "a", ok: true, evidence: "exit 0" })).toBe("exit 0");
  });

  it("отчёт текстом называет причину провала и доказательство", () => {
    const text = deedText(
      deed({
        outcome: "failed",
        finishedMs: 1,
        steps: [
          { position: 1, tool: "files|создать|папку", ok: true, evidence: "folder-created" },
          { position: 2, tool: "files|перенести|файлы", ok: false, reason: "нет прав" },
        ],
      }),
    );
    expect(text).toContain("разобрать «Загрузки» по папкам");
    expect(text).toContain("не вышло");
    expect(text).toContain("Шагов прошло: 1 из 2");
    expect(text).toContain("нет прав");
    expect(text).toContain("доказательство: folder-created");
    // У шага без доказательства — не пустота, а честное «не проверено».
    expect(text).toContain("не проверено");
  });

  it("отчёт о деле без шагов не притворяется, что шаги были", () => {
    const text = deedText(deed({ kind: "download", steps: [], subject: "модель" }));
    expect(text).toContain("Шагов не было");
    expect(text).not.toContain("из 0");
  });

  it("на откат ведут только у дела со сессией", () => {
    // Шаг 364: откат живёт по сессиям. Дело без сессии (старая запись,
    // скачивание) не имеет куда вести — ложная ссылка покажет чужое.
    expect(links(deed({ session: "2026-11-20T12:00" })).undo).toBe(true);
    expect(links(deed({ session: "" })).undo).toBe(false);
    expect(links(deed({ session: "   " })).undo).toBe(false);
    expect(links(deed()).undo).toBe(false);
  });

  it("в журнал ведёт любое дело: у него есть время, а по нему ищутся строки", () => {
    expect(links(deed()).journal).toBe(true);
    expect(links(deed({ startedMs: 0 })).journal).toBe(false);
  });

  it("отказ политики называется отказом, а не общим провалом", () => {
    // «Не вышло» и «отказано политикой» — разные вещи: во втором никто ничего
    // не ломал, сработало правило.
    const verdict = judge(deed({ outcome: "denied" }));
    expect(verdict.verdict).toBe("отказано политикой");
  });
});
