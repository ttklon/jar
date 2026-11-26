/**
 * Шаг 437: экран «что происходит прямо сейчас».
 *
 * Кнопка «покажи, что делаешь» (шаг 427) отвечает на просьбу. Экран — отвечает
 * **не спрашивая**, потому что иногда человек не знает, что спросить: «приложение
 * что-то шевелится, а что именно?».
 *
 * Экран собирается из того, что **правда известно**, и ничего не додумывает:
 *
 *  * **что идёт** — дела и их шаги;
 *  * **что ждёт** — вопрос человеку и сколько уже ждёт (шаг 376);
 *  * **что спит** — расписания и когда следующее (шаг 327);
 *  * **чего нет** — «ничего не происходит», а не пустой экран: пустой экран
 *    читается как «сломалось».
 *
 * И правило, ради которого экран отдельный: **он показывает, а не управляет**.
 * Кнопка «остановить» есть в деле; экран «сейчас» не должен давать «остановить
 * всё» одним неосторожным нажатием.
 */

/** Дело в работе. */
export interface Running {
  readonly what: string;
  readonly step: number;
  readonly total: number;
  /** Ждёт ли человека — и чего. */
  readonly waitingFor?: string;
}

/** Расписание. */
export interface Scheduled {
  readonly what: string;
  /** Когда следующее — миллисекунды. */
  readonly nextAt: number;
}

/** Состояние. */
export interface State {
  readonly running: readonly Running[];
  readonly waiting: readonly Running[];
  readonly scheduled: readonly Scheduled[];
  /** Загружена ли модель. */
  readonly modelReady: boolean;
}

/**
 * Собрать экран.
 *
 * Порядок блоков — по срочности для человека: ждущее (без него дело стоит),
 * идущее, спящее.
 */
export function build(state: State, now: number): { title: string; lines: string[] }[] {
  const blocks: { title: string; lines: string[] }[] = [];

  if (state.waiting.length > 0) {
    blocks.push({
      title: "ждёт вашего ответа",
      lines: state.waiting.map((item) => `«${item.what}»: ${item.waitingFor ?? "вопрос"}`),
    });
  }

  if (state.running.length > 0) {
    blocks.push({
      title: "делается сейчас",
      lines: state.running.map((item) => `«${item.what}»: шаг ${item.step + 1} из ${item.total}`),
    });
  }

  if (state.scheduled.length > 0) {
    blocks.push({
      title: "по расписанию",
      lines: [...state.scheduled]
        .sort((a, b) => a.nextAt - b.nextAt)
        .map((item) => `«${item.what}»: следующее ${when(item.nextAt, now)}`),
    });
  }

  if (blocks.length === 0) {
    const model = state.modelReady ? "" : " Модель не загружена — она загрузится при первом деле.";
    return [{ title: "ничего не происходит", lines: [`Жду вашу фразу.${model}`] }];
  }

  if (!state.modelReady) blocks.push({ title: "модель", lines: ["не загружена: загрузится при первом деле, это нормально"] });

  return blocks;
}

/** Когда следующее — по-русски, коротко. */
export function when(at: number, now: number): string {
  const diff = at - now;
  if (diff <= 0) return "просрочено — ждёт запуска";
  if (diff < 60_000) return `через ${Math.round(diff / 1000)} с`;
  if (diff < 3_600_000) return `через ${Math.round(diff / 60_000)} мин`;
  if (diff < 86_400_000) return `через ${Math.round(diff / 3_600_000)} ч`;
  return `через ${Math.round(diff / 86_400_000)} дн`;
}

/**
 * Что экран не делает.
 *
 * Три запрета, и первый — самый опасный: «остановить всё» одним нажатием.
 */
export function notDo(): string[] {
  return [
    "не управляет: останавливать и отменять — в самом деле, а не на обзорном экране",
    "не показывает прошлое: это про сейчас, журнал — отдельно",
    "не додумывает: чего не знает, того не пишет; «ничего не происходит» — честный ответ",
  ];
}

/**
 * Что экран обязан показать, если это есть.
 *
 * Список — приёмочный: каждый пункт проверяется.
 */
export function must(): string[] {
  return ["ждущее дело: без ответа оно стоит", "идущее дело с шагом", "следующее по расписанию", "честное «ничего» вместо пустого экрана"];
}
