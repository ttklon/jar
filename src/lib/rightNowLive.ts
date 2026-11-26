/**
 * Состояние для экрана «что сейчас» — из того, что правда известно.
 *
 * `rightNow.build` умеет собрать ответ, но ему нужны данные. Здесь — мост:
 * какие дела идут, что ждёт человека, загружена ли модель. **Ложных источников
 * нет**: чего не спросили у ядра, того нет и в ответе, а не «наверное, ничего».
 *
 * Сознательно не подключено: расписания. В интерфейсе нет команды, которая
 * вернёт список расписаний, — выдумывать её здесь значило бы показать «по
 * расписанию» из ничего. Пустой список — честное «нечего сказать», и он
 * появляется только когда спросить действительно нечего.
 */

import { engineStatus, memoryRuns } from "../ipc";
import { build as buildState, type State } from "./rightNow";

export type Blocks = ReturnType<typeof buildState>;

/**
 * Что известно прямо сейчас.
 *
 * `runs` — запуски из памяти. Идущим считается только `running`: «упал» и
 * «отменён» — это история, а не «делается сейчас».
 */
export async function stateNow(): Promise<State> {
  const [runs, engine] = await Promise.all([memoryRuns(20), engineStatus()]);
  const running = runs
    .filter((run) => run.outcome === "running")
    .map((run) => ({
      what: run.subject,
      step: run.steps.length === 0 ? 0 : Math.max(...run.steps.map((step) => step.position)),
      total: Math.max(1, run.steps.length),
    }));

  return {
    running,
    // Ждущих вопросов интерфейс сейчас не хранит отдельно: вопросы приходят и
    // уходят внутри дела. Пустой список — правда, а не забывчивость.
    waiting: [],
    scheduled: [],
    modelReady: engine.running,
  };
}

/** Готовые блоки для экрана: одно место, где вызывается правило. */
export async function bodyOf(now: number): Promise<Blocks> {
  return buildState(await stateNow(), now);
}
