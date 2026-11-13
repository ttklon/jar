import type { PlanCheck } from "../ipc";

/**
 * Очередь дел: несколько задач подряд, пока человек не скажет «стоп».
 *
 * Зачем. Просить по одному делу — это разговор; просить десять — это работа. Человек
 * говорит «я ушёл, сделай вот это, это и это», и помощник идёт по списку сам. Но идти
 * самому — не значит идти без правил, поэтому правила здесь записаны и проверяются:
 *
 *  * **бюджет машины решает, сколько идти сразу.** Не очередь решает, а `machine.rs`:
 *    очередь только спрашивает;
 *  * **человек вернулся — новые дела не начинаются.** Текущее доводится до конца, а
 *    следующее ждёт: мешать человеку за его же компьютером — не усердие;
 *  * **что нельзя без человека, то не делается без человека.** План, которому нужно
 *    подтверждение или ответ, помечается «нужно ваше слово» и очередь идёт дальше —
 *    молча исполнять такое было бы подлогом;
 *  * **«стоп» останавливает всё, что ещё не начато.** Начатое доводится до шага, где
 *    его можно бросить, и об этом говорится.
 *
 * Здесь нет ни одного запуска: модуль решает, что делать дальше, а делает вызывающий.
 * Так его можно проверить без машины и без окон — и так видно, что решает он, а не
 * случайность.
 */

/** Что сейчас с делом. */
export type QueueState = "waiting" | "running" | "done" | "failed" | "held" | "stopped";

/** Одно дело в очереди. */
export interface QueueItem {
  /** Устойчивый номер: по нему находятся обновления, даже если очередь пересобрали. */
  id: string;
  /** Что человек сказал. Ровно его слова, без пересказа. */
  goal: string;
  state: QueueState;
  /** Что случилось или чего ждём — одной строкой. Пусто, пока нечего сказать. */
  note: string;
}

/** Сколько сейчас можно — ответ машины, а не мнение очереди. */
export interface QueueBudget {
  /** Сколько дел можно вести одновременно. Ноль — новое не начинать. */
  parallel: number;
  /** Можно ли вообще начинать новое. */
  mayStart: boolean;
  /** Человек отошёл: только тогда очередь идёт сама. */
  away: boolean;
}

/** Что делать дальше. */
export interface Decision {
  /**
   * Индекс следующего дела или `-1`, если начинать нечего. Причина есть всегда —
   * иначе «почему стоит» неотличимо от «почему сломалось».
   */
  index: number;
  reason: string;
}

/** Добавить дело в конец. Пустое — не дело, и в очередь не попадает. */
export function add(items: readonly QueueItem[], goal: string, id: string): QueueItem[] {
  const text = goal.trim();
  if (text.length === 0) return [...items];
  return [...items, { id, goal: text, state: "waiting", note: "" }];
}

/** Поставить состояние делу по номеру. Номер не найден — очередь не меняется. */
export function setState(
  items: readonly QueueItem[],
  id: string,
  state: QueueState,
  note: string,
): QueueItem[] {
  return items.map((item) => (item.id === id ? { ...item, state, note } : item));
}

/** Что делать дальше — по бюджету машины и по тому, что уже идёт. */
export function next(items: readonly QueueItem[], budget: QueueBudget): Decision {
  const waiting = items.findIndex((item) => item.state === "waiting");
  if (waiting < 0) {
    return { index: -1, reason: "начинать нечего: в очереди пусто" };
  }

  if (!budget.mayStart) {
    return {
      index: -1,
      reason: "машина просит не начинать: памяти на исходе — жду, а не толкаюсь",
    };
  }

  const running = items.filter((item) => item.state === "running").length;
  const parallel = Math.max(0, budget.parallel);
  if (running >= parallel) {
    return {
      index: -1,
      reason:
        parallel === 0
          ? "сейчас нельзя ничего: так решила машина"
          : `уже идёт ${running} из ${parallel} — больше бюджет машины не разрешает`,
    };
  }

  if (!budget.away) {
    return {
      index: -1,
      reason: "человек за машиной — новые дела не начинаю, чтобы не мешать",
    };
  }

  return { index: waiting, reason: "можно начинать следующее" };
}

/** Остановить всё, что ещё не начато. Начатое не трогаем: его доводят до шага. */
export function stopRemaining(items: readonly QueueItem[]): QueueItem[] {
  return items.map((item) =>
    item.state === "waiting"
      ? { ...item, state: "stopped", note: "остановлено вами: не начиналось" }
      : item,
  );
}

/** Сколько чего в очереди — одной строкой для экрана. */
export function summary(items: readonly QueueItem[]): {
  waiting: number;
  running: number;
  done: number;
  failed: number;
  held: number;
} {
  const count = (state: QueueState) => items.filter((item) => item.state === state).length;
  return {
    waiting: count("waiting"),
    running: count("running"),
    done: count("done"),
    failed: count("failed"),
    held: count("held"),
  };
}

/** Можно ли выполнить этот план без человека. */
export interface Verdict {
  can: boolean;
  /** Почему нельзя — словами, которые человек прочитает и поймёт. */
  why: string;
}

/**
 * Решает не очередь и не модель, а политика: план без подтверждений, без вопросов и без
 * запретов исполним сам; всё остальное ждёт человека. «Модель сказала, значит можно» —
 * ровно то, чего здесь не бывает.
 */
export function unattended(check: PlanCheck | null): Verdict {
  if (!check || !check.plan) {
    return { can: false, why: "план не собрался: нечего исполнять" };
  }

  const broken = check.problems[0];
  if (broken) {
    return {
      can: false,
      why: broken.position > 0 ? `шаг ${broken.position}: ${broken.problem}` : broken.problem,
    };
  }

  const question = check.questions[0];
  if (question) {
    return { can: false, why: `нужно ваше слово: ${question.label}` };
  }

  const gate = check.gates.find((item) => item.wants_approval || item.decision === "deny");
  if (gate) {
    return {
      can: false,
      why:
        gate.decision === "deny"
          ? `шаг ${gate.position} запрещён политикой: ${gate.risk}`
          : `шаг ${gate.position} требует вашего подтверждения (${gate.risk})`,
    };
  }

  return { can: true, why: "можно без вас: ни подтверждений, ни вопросов" };
}
