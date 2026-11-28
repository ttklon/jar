/**
 * Снимок «что живо» перед переключением профиля (шаг 78).
 *
 * Правило `switchNoRestart` утверждает: переключение — смена трёх ссылок, а не
 * перезапуск. Утверждение проверяемо на живой машине, но только если есть **с
 * чем** сравнить: до переключения снимок, после — второй, и разница называется
 * вслух. Без этого «перезапусков ноль» остаётся обещанием в комментарии.
 *
 * Здесь — то, что перезапуск ломал бы по-настоящему:
 *
 *  * **набранная фраза** в поле ввода: человек переключился и потерял текст;
 *  * **идущее дело** и его выполненные шаги: не начинается заново;
 *  * **загруженная модель**: на слабой машине это десятки секунд;
 *  * **открытое окно**: закрылось и открылось заново — уже другой экран.
 *
 * Снимок читается из настоящих мест (`draft`, журнал запусков, движок), а не
 * придумывается: подделка в отчёте хуже, чем отсутствие отчёта.
 */

import type { RunRecord } from "../ipc/types";
import type { StorageLike } from "./firstRun";
import { readDraft } from "./draft";
import { verify } from "./switchNoRestart";
import type { Person } from "./peopleProfiles";
import type { Live } from "./switchNoRestart";

/** Что удалось прочитать. `null` — прочитать не смогли, и это сказано. */
export interface Snapshot {
  readonly draft: string;
  readonly stepsDone: number;
  readonly modelReady: boolean;
}

/** Состояние, в котором приложение встретило переключение. */
export function snap(
  runs: readonly RunRecord[],
  engine: { running: boolean } | null,
  storage: StorageLike | null,
): Snapshot {
  const live = runs.filter((run) => run.outcome === "running");
  const stepsDone = live.reduce(
    (sum, run) => sum + run.steps.filter((step) => step.ok).length,
    0,
  );
  return {
    draft: readDraft(storage),
    stepsDone,
    modelReady: engine?.running === true,
  };
}

/**
 * Что переключение сохранило — и что потеряло.
 *
 * Возвращает и хорошее, и плохое: список потерь пуст — это результат, который
 * видно, а не тишина. Формулировки называют то, что было в снимке, а не «всё
 * хорошо»: «ничего не потерялось» без единого числа через неделю не отличить
 * от «мы не смотрели».
 */
export function keptAndLost(
  before: Snapshot,
  after: Snapshot,
  _whoName: string,
): { kept: string[]; lost: string[] } {
  const kept: string[] = [];
  const lost: string[] = [];

  if (before.draft.trim() !== "" && before.draft === after.draft) {
    kept.push(`набранная фраза: «${short(before.draft)}»`);
  }
  if (before.draft.trim() !== "" && before.draft !== after.draft) {
    lost.push(`фраза в поле ввода: была «${short(before.draft)}», стала «${short(after.draft)}»`);
  }

  if (before.stepsDone > 0 && after.stepsDone >= before.stepsDone) {
    kept.push(`идущее дело: выполнено шагов ${after.stepsDone} — не началось заново`);
  }
  if (after.stepsDone < before.stepsDone) {
    lost.push(`идущее дело потеряло шаги: было ${before.stepsDone}, стало ${after.stepsDone}`);
  }

  if (before.modelReady && after.modelReady) {
    kept.push("загруженная модель: не выгружалась");
  }
  if (before.modelReady && !after.modelReady) {
    lost.push("модель выгрузилась: на слабой машине это десятки секунд ожидания");
  }

  if (kept.length === 0 && lost.length === 0) {
    kept.push(`нечего было терять: поле пусто, дел в работе нет, модель не загружена`);
  }
  return { kept, lost };
}

/** Одной строкой — для объявления диктором и для журнала. */
export function summaryOf(before: Snapshot, after: Snapshot, whoName: string): string {
  const { kept, lost } = keptAndLost(before, after, whoName);
  const person: Person = { id: "switch", name: whoName };
  const live = (from: Snapshot): Live => ({
    who: { person, facts: [], allowed: [], guest: false },
    draft: from.draft,
    stepsDone: from.stepsDone,
    modelReady: from.modelReady,
    window: true,
  });
  // Проверку берём **из самого правила**, а не повторяем её здесь: иначе через
  // месяц правило поправят, а экран продолжит утверждать старое.
  const problems = verify(live(before), live(after));
  const head = `теперь «${whoName}» — без перезапуска`;
  if (problems.length > 0) {
    const word = problems.length === 1 ? "проблему" : "проблем";
    return `${head}; но проверка нашла ${word}: ${problems.join("; ")}`;
  }
  const keptPart = kept.length > 0 ? `Сохранено: ${kept.join(", ")}.` : "";
  const lostPart = lost.length === 0 ? "Ничего не потеряно." : `Потеряно: ${lost.join("; ")}`;
  return `${head}. ${keptPart} ${lostPart}`.replace(/\s+/g, " ").trim();
}

/** Короткая цитата: длинный текст в объявлении диктора читать невозможно. */
function short(text: string, limit = 40): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}
