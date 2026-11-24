/**
 * Запуск ядра — один раз, тёплый старт; холодный старт измерен и назван (шаг 125).
 *
 * Дефект. Ядро (движок разбора и модель) запускается **на каждый запрос**, и это не
 * видно как дефект:
 *
 *  * **первая фраза платит за всё**: 3 секунды на старт ядра при ответе в 400 мс —
 *    то есть 88% времени уходит на то, чтобы начать;
 *  * **перезапуск на каждой фразе**: «почему вторая фраза быстрее» — потому что ядро
 *    уже поднято; но если оно падает, каждая фраза платит заново, и это тоже
 *    незаметно;
 *  * **холодный старт не назван**: «первый раз долго» знает каждый, но число
 *    неизвестно, и планировать по нему нельзя;
 *  * **двойной запуск**: две фразы подряд поднимают **два** ядра, и оба ждут памяти,
 *    отчего обе медленнее, чем одна.
 *
 * Правило: **ядро поднимается один раз, а холодный старт — число**.
 *
 *  1. **Один запуск на жизнь**: повторный запрос берёт поднятое ядро, а не своё.
 *  2. **Одновременные запросы ждут один запуск**: второй не поднимает второе ядро, а
 *     присоединяется к первому — иначе они мешают друг другу и оба медленнее.
 *  3. **Холодный старт измеряется и называется**: «первый запуск 3,1 с» — это факт,
 *     с которым можно работать (предзагрузка, шаг 131).
 *  4. **Падение ядра делает старт холодным снова**, и это **сказано**: молчаливое
 *     «снова медленно» выглядит деградацией.
 *  5. **Запуск идемпотентен**: `ensure` можно звать сколько угодно, второй вызов не
 *     поднимает второго.
 *
 * Почему не «поднимать заранее и не думать». Предзагрузка — отдельное решение (131);
 * здесь важно, чтобы **один** запуск был один, и чтобы его цена была известна.
 */

/** Состояние ядра. */
export type State = "cold" | "starting" | "warm" | "failed";

/** Что помнит менеджер запуска. */
export interface Kernel {
  state: State;
  /** Сколько занял последний холодный старт, мс. `null` — ещё не запускали. */
  coldMs: number | null;
  /** Сколько раз поднимали (для честного «один раз»). */
  starts: number;
  /** Почему ядро упало — словами, если отказ назвали. */
  lastFailure?: string;
  /** Обещание текущего запуска: одновременные запросы ждут его, а не своё. */
  pending: Promise<void> | null;
  /** Сказал ли кто-то, что ядро живо. `warm` без этого — только наше «мы запускали». */
  confirmed?: boolean;
}

export function initial(): Kernel {
  return { state: "cold", coldMs: null, starts: 0, pending: null };
}

/**
 * Поднять ядро — один раз.
 *
 * `up` — настоящий запуск. Возвращает **то же** обещание для одновременных вызовов:
 * второй вызов не поднимает второе ядро.
 */
/**
 * «Ядро живо» приходит **снаружи** — от настоящего запроса.
 *
 * Без этого `warm` значило бы «мы когда-то запускали», и упавшее ядро молча
 * пропускало бы попытку подняться: следующая фраза получала мёртвое.
 */
export function confirm(kernel: Kernel): Kernel {
  kernel.confirmed = true;
  return kernel;
}

/** Ядро упало на настоящем запросе — снова холодно, и это не скрывается. */
export function lost(kernel: Kernel, why = "ядро не ответило"): Kernel {
  kernel.state = "failed";
  kernel.confirmed = false;
  // Цена прошлого старта остаётся: «стало медленнее» должно быть с чем сравнить.
  kernel.lastFailure = why;
  return kernel;
}

export async function ensure(kernel: Kernel, up: () => Promise<void>, now: () => number = Date.now): Promise<Kernel> {
  if (kernel.state === "warm" && kernel.pending === null && kernel.confirmed === true) {
    return kernel;
  }
  if (kernel.state === "warm" && kernel.pending === null && kernel.confirmed !== true) {
    // «Тёплое» ядро, о котором никто не сказал, что оно живо, — не тёплое:
    // поднимаем заново, вместо того чтобы молча отдать мёртвое.
    kernel.state = "cold";
  }
  // Упавшее ядро поднимается заново: `failed` — не «тёплое», иначе следующая фраза
  // молча получит мёртвое ядро.
  if (kernel.pending !== null && kernel.state === "starting") {
    // Присоединиться к идущему запуску, а не начинать свой.
    await kernel.pending;
    return kernel;
  }
  const startedAt = now();
  kernel.state = "starting";
  kernel.starts += 1;
  const running = (async () => {
    try {
      await up();
    } catch (error) {
      kernel.state = "failed";
      // Причина падения — словами: «нет памяти» чинится, «не поднялось» — нет.
      kernel.lastFailure = error instanceof Error ? error.message : String(error);
      throw error;
    }
  })();
  kernel.pending = running;

  try {
    await running;
  } catch {
    kernel.pending = null;
    // Падение делает старт холодным снова — и это не скрывается.
    kernel.state = "failed";
    return kernel;
  }

  kernel.coldMs = now() - startedAt;
  kernel.state = "warm";
  kernel.pending = null;
  return kernel;
}

/**
 * Что сказать про старт.
 *
 * Холодный старт **назван числом**: «первый раз долго» без числа нельзя ни
 * планировать, ни чинить.
 */
export function say(kernel: Kernel): string {
  switch (kernel.state) {
    case "warm":
      return kernel.coldMs === null
        ? "ядро поднято"
        : `ядро поднято один раз: холодный старт ${Math.round(kernel.coldMs)} мс`;
    case "starting":
      return "ядро поднимается — второй запрос ждёт этот же запуск, а не свой";
    case "cold":
      return "ядро не поднято: первая фраза заплатит за холодный старт";
    case "failed":
      // Прошлая цена помнится даже после падения: иначе «стало медленнее» не с чем
      // сравнить. Причина, если её назвали, — тоже.
      {
        // Причина, если её назвали, важнее прошлой цены: «нет ответа за 5 с» — это
        // то, что можно чинить, а «900 мс» — только помнить.
        const why = kernel.lastFailure ? `: ${kernel.lastFailure}` : "";
        const cost = kernel.coldMs === null ? "" : ` (прошлый стоил ${Math.round(kernel.coldMs)} мс)`;
        return `ядро упало${why} — следующий запуск снова холодный${cost}`;
      }
  }
}

/**
 * Платит ли следующая фраза за старт.
 *
 * Ответ — **до** запуска: молчаливое «первая дольше» человек читает как «приложение
 * медленное».
 */
export function willPay(kernel: Kernel): boolean {
  return kernel.state === "cold" || kernel.state === "failed";
}

/**
 * Сколько стоит первая фраза.
 *
 * Холодный старт плюс обычный ответ — число, которое и надо произносить, когда
 * спрашивают «почему первый раз долго».
 */
export function firstPhrase(kernel: Kernel, answerMs: number): number {
  return (kernel.coldMs ?? 0) + answerMs;
}

/**
 * Что чинить: предзагрузку или ответ.
 *
 * Доля старта в первой фразе — если она больше половины, чинить надо старт, и это
 * видно числом, а не на глаз.
 */
export function blame(kernel: Kernel, answerMs: number): { start: number; share: number; said: string } {
  const total = firstPhrase(kernel, answerMs);
  const start = kernel.coldMs ?? 0;
  const share = total === 0 ? 0 : start / total;
  if (start === 0) return { start, share, said: "старт не платился — ядро уже было поднято" };
  const said =
    share > 0.5
      ? `первая фраза: ${Math.round(total)} мс, из них старт ${Math.round(start)} — чинить старт, а не ответ`
      : `первая фраза: ${Math.round(total)} мс, старт ${Math.round(start)} — ответ дороже старта`;
  return { start, share, said };
}
