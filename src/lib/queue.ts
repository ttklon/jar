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

/**
 * Шаги, которые трогают чужое окно: нажатие и ввод.
 *
 * Зачем этот список здесь. Два дела, которые одновременно нажимают в одном окне, — это
 * не скорость, а гонка: одно нажмёт «Удалить», пока второе ищет «Сохранить». Поэтому
 * экранных дел одновременно ведётся не больше одного, а остальные ждут честно.
 */
export const SCREEN_STEPS: ReadonlySet<string> = new Set([
  "apps-windows|нажать|кнопку",
  "apps-windows|ввести|текст",
]);

/** Одно дело в очереди. */
export interface QueueItem {
  /** Устойчивый номер: по нему находятся обновления, даже если очередь пересобрали. */
  id: string;
  /** Что человек сказал. Ровно его слова, без пересказа. */
  goal: string;
  state: QueueState;
  /** Что случилось или чего ждём — одной строкой. Пусто, пока нечего сказать. */
  note: string;
  /**
   * Трогает ли дело чужое окно. `undefined` — ещё не знаем, план не собран.
   * Знание появляется после плана, а не из догадки по словам.
   */
  touchesScreen?: boolean;
  /**
   * Чья это цель — слова человека, которые он разложил на дела.
   *
   * Пусто у одиночного дела: одно дело — не цель, продолжать у него нечего. Цель
   * появляется только там, где человек сам сказал «это несколько работ».
   */
  origin?: string;
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

/**
 * Добавить дело в конец. Пустое — не дело, и в очередь не попадает.
 *
 * `origin` передаётся только для дел из разложения: без него у дела нет цели, а значит
 * и продолжения — очередь не придумывает, что человек «наверное, хотел ещё».
 */
export function add(
  items: readonly QueueItem[],
  goal: string,
  id: string,
  origin?: string,
): QueueItem[] {
  const text = goal.trim();
  if (text.length === 0) return [...items];
  const source = origin?.trim();
  return [
    ...items,
    { id, goal: text, state: "waiting", note: "", ...(source ? { origin: source } : {}) },
  ];
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

/**
 * Трогает ли этот план чужое окно. Смотрим на шаги, а не на слова человека: «нажми
 * сохранить» может оказаться планом из одного чтения, и наоборот.
 */
export function usesScreen(check: PlanCheck | null): boolean {
  const steps = check?.plan?.steps ?? [];
  return steps.some((step) => SCREEN_STEPS.has(step.registry));
}

/** Что можно начать прямо сейчас: список индексов и причина, если ничего. */
export interface Started {
  /** Индексы дел, которые можно запускать одновременно. */
  indices: number[];
  /** Почему их столько: без причины «почему стоит» неотличимо от «почему сломалось». */
  reason: string;
}

/**
 * Сколько дел начать прямо сейчас.
 *
 * Бюджет машины задаёт верхнюю границу, а правило про экран — вторую: одновременно
 * идёт не больше одного дела, которое нажимает или вводит. Остальные ждут, и очередь
 * говорит, чего именно она ждёт.
 */
export function pick(items: readonly QueueItem[], budget: QueueBudget): Started {
  if (!budget.mayStart) {
    return {
      indices: [],
      reason: "машина просит не начинать: памяти на исходе — жду, а не толкаюсь",
    };
  }

  if (!budget.away) {
    return {
      indices: [],
      reason: "человек за машиной — новые дела не начинаю, чтобы не мешать",
    };
  }

  const running = items.filter((item) => item.state === "running");
  const parallel = Math.max(0, budget.parallel);
  const slots = parallel - running.length;
  if (slots <= 0) {
    return {
      indices: [],
      reason:
        parallel === 0
          ? "сейчас нельзя ничего: так решила машина"
          : `уже идёт ${running.length} из ${parallel} — больше бюджет машины не разрешает`,
    };
  }

  const waiting = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.state === "waiting");

  if (waiting.length === 0) {
    return { indices: [], reason: "начинать нечего: в очереди пусто" };
  }

  let screenBusy = running.some((item) => item.touchesScreen === true);
  const indices: number[] = [];
  let heldByScreen = 0;

  for (const { item, index } of waiting) {
    if (indices.length >= slots) break;

    if (item.touchesScreen === true) {
      if (screenBusy) {
        heldByScreen += 1;
        continue;
      }
      screenBusy = true;
    }

    indices.push(index);
  }

  if (indices.length === 0) {
    return {
      indices,
      reason:
        heldByScreen > 0
          ? "ждут экрана: другое дело уже работает с окном, одновременно туда нельзя"
          : "начинать нечего: всё ждёт",
    };
  }

  return {
    indices,
    reason:
      indices.length > 1
        ? `беру ${indices.length} дела сразу: бюджет машины позволяет, окна они не трогают`
        : "беру одно дело: так разрешает бюджет или экран занят",
  };
}

/** Отметить, трогает ли дело экран — по собранному плану, а не по догадке. */
export function markScreen(
  items: readonly QueueItem[],
  id: string,
  touchesScreen: boolean,
): QueueItem[] {
  return items.map((item) => (item.id === id ? { ...item, touchesScreen } : item));
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

/**
 * Потолок дел в час.
 *
 * Зачем потолок, если человек сказал «работай без меня». Потому что «пока не скажу стоп» —
 * это не «делай что угодно бесконечно»: очередь, которая сама придумывает себе дела, без
 * счёта превращается в машину без тормозов. Двенадцать дел в час — это дело примерно
 * каждые пять минут: работа идёт, а остановить её всё ещё можно одним словом.
 */
export const DEEDS_PER_HOUR = 12;

/** Окно, в котором считается потолок. */
export const HOUR_MS = 60 * 60 * 1000;

/**
 * Счёт дел за окно. Пара чисел, а не список времён: очередь — не архив.
 *
 * Счёт живёт, пока работает приложение, и это сказано на экране: притворяться, что
 * потолок переживает перезапуск, значило бы обещать больше, чем есть.
 */
export interface HourLog {
  /** Когда началось текущее окно, мс. */
  since: number;
  /** Сколько дел начато в этом окне. */
  deeds: number;
}

export function startHour(now: number): HourLog {
  return { since: now, deeds: 0 };
}

/** Перейти в новое окно, если час прошёл. Раньше срока счёт не сбрасывается. */
export function rollHour(log: HourLog, now: number): HourLog {
  return now - log.since >= HOUR_MS ? { since: now, deeds: 0 } : log;
}

/** Отметить начатое дело. Считаются начатые, а не удачные: потолок — про нагрузку. */
export function takeDeed(log: HourLog, now: number): HourLog {
  const rolled = rollHour(log, now);
  return { since: rolled.since, deeds: rolled.deeds + 1 };
}

/** Сколько ещё можно начать в этом часу. Ноль — «больше не начинаю», а не «помедленнее». */
export function hourLeft(log: HourLog, now: number): number {
  return Math.max(0, DEEDS_PER_HOUR - rollHour(log, now).deeds);
}

/** Что с целью: сколько сделано, сколько впереди и сколько встало. */
export interface GoalProgress {
  /** Слова человека, которые он разложил на дела. */
  goal: string;
  done: number;
  /** Ждут или идут. */
  left: number;
  /** Не вышло или требует его слова — это не «впереди», это «разберитесь». */
  stuck: number;
}

export function progress(items: readonly QueueItem[], origin: string): GoalProgress {
  const ofGoal = items.filter((item) => item.origin === origin);
  const count = (...states: QueueState[]) =>
    ofGoal.filter((item) => states.includes(item.state)).length;

  return {
    goal: origin,
    done: count("done"),
    left: count("waiting", "running"),
    stuck: count("failed", "held"),
  };
}

/** Спрашивать ли модель про следующие дела по цели. */
export interface Replenish {
  ask: boolean;
  /** Почему да или почему нет — словами. Молчаливое «нет» неотличимо от поломки. */
  why: string;
}

/**
 * Пора ли продолжать цель.
 *
 * Продолжение — единственное место, где очередь сама решает спросить модель, поэтому
 * правил здесь больше, чем в остальном модуле:
 *
 *  * **дела ещё есть — не спрашиваем.** Новые дела поверх ждущих — это не продолжение,
 *    а суета;
 *  * **не сделалось или нужно слово — не спрашиваем.** Придумать новое дело поверх
 *    провала значит замести следы; сначала человек разбирается с этим;
 *  * **остановили — не спрашиваем.** «Стоп» относится и к тому, чего ещё нет;
 *  * **потолок выбран — не спрашиваем.** Это тот самый счётчик, который отличает
 *    «работает, пока не скажу» от «работает, пока не сломается».
 */
export function replenish(
  items: readonly QueueItem[],
  origin: string,
  log: HourLog,
  now: number,
): Replenish {
  const ofGoal = items.filter((item) => item.origin === origin);

  if (ofGoal.length === 0) {
    return { ask: false, why: "по этой цели ещё нет ни одного дела" };
  }

  if (ofGoal.some((item) => item.state === "waiting" || item.state === "running")) {
    return { ask: false, why: "по цели ещё есть незаконченное дело: продолжение — после него" };
  }

  if (ofGoal.some((item) => item.state === "stopped")) {
    return { ask: false, why: "вы остановили эту цель — новые дела не придумываю" };
  }

  const stuck = ofGoal.find((item) => item.state === "failed" || item.state === "held");
  if (stuck) {
    return {
      ask: false,
      why: `по цели есть дело, которое не сделалось («${stuck.goal}»): новые дела не придумываю, пока это не разобрано`,
    };
  }

  const left = hourLeft(log, now);
  if (left === 0) {
    return {
      ask: false,
      why: `потолок ${DEEDS_PER_HOUR} дел в час выбран: больше сам не начинаю — иначе это не помощь, а работа без тормозов`,
    };
  }

  return {
    ask: true,
    why: `цель «${origin}» не закрыта, а потолок ещё не выбран (${left} из ${DEEDS_PER_HOUR})`,
  };
}

/**
 * Вопрос модели про продолжение — словами человека, а не JSON.
 *
 * Модель видит цель и что по ней уже было; чего она не видит — так это чужих окон и
 * памяти, и это правильно: продолжение не должно знать больше, чем знает человек.
 */
export function continuationQuery(origin: string, items: readonly QueueItem[]): string {
  const lines = items
    .filter(
      (item) =>
        item.origin === origin &&
        (item.state === "done" || item.state === "failed" || item.state === "held"),
    )
    .map((item) => {
      const verdict =
        item.state === "done"
          ? "сделано"
          : item.state === "failed"
            ? "не вышло"
            : "нужно слово человека";
      return `— ${item.goal}: ${verdict}${item.note ? ` (${item.note})` : ""}`;
    });

  return [
    `Цель: «${origin}».`,
    lines.length > 0 ? "Что по ней уже было:" : "По ней ещё ничего не сделано.",
    ...lines,
    "Цель ещё не достигнута. Что делать дальше по этой же цели? Одно-три следующих дела.",
    "Если цель достигнута — так и скажи, без новых дел.",
  ].join("\n");
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
