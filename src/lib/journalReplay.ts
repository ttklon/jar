/**
 * «Разобрать заново» — журнальная запись из того, что помнит память (шаг 45).
 *
 * Воспроизведение по правилу `reproduce` — это **данные, а не повторный
 * запуск**: из сохранённого входа собирается ровно тот же отчёт, и мир при этом
 * не трогается. Правило было написано и не подключено: журнал показывал строки,
 * а разобрать вчерашний провал было нечем.
 *
 * Мост честно говорит, чего не хватает. Память запусков хранит шаг, его исход,
 * причину и доказательство — но не длительность шага и не противоречия. Эти два
 * поля заполняются **пустыми значениями**, и воспроизведение называет их
 * пробелами, а не выдаёт за «всё совпало».
 */

import type { RunRecord } from "../ipc";
import { RULES, replay, say, type Entry, type Replay } from "./reproduce";
import type { Report } from "./oneReport";

/** Запись из запуска: то, что действительно есть в памяти. */
export function fromRun(run: RunRecord): Entry {
  const steps: Report[] = run.steps
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((step) => ({
      position: step.position,
      tool: step.tool,
      ok: step.ok,
      reason: step.reason,
      proof: step.evidence,
      cancelled: !step.ok && run.outcome.startsWith("cancel"),
      // Длительность шага память не хранит: `null` — «не сказали», а не ноль.
      duration_ms: null,
      conflicts: [],
    }));

  return { deed: run.id, subject: run.subject, startedMs: run.started_ms, steps, rules: RULES };
}

/**
 * Разобрать запуск заново.
 *
 * Без «что показывали тогда» сравнения нет — и это говорится прямо, а не
 * считается совпадением (правило воспроизведения).
 */
export function again(run: RunRecord): Replay {
  return replay(fromRun(run));
}

/** Строка для человека: та же, что у правила, без второй формулировки. */
export function line(run: RunRecord): string {
  return say(again(run));
}
