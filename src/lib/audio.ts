/**
 * Машина состояний звука: кто сейчас владеет микрофоном и динамиком.
 *
 * Зачем отдельная машина, а не два флага `listening`/`speaking`: у звука есть
 * ровно один рот и ровно одни уши, и почти все неприятности ассистента — из
 * пересечения. Приложение говорит и слушает одновременно — оно слышит себя.
 * Человек перебивает, а оно продолжает говорить — оно не слышит человека.
 *
 * Состояния и переходы:
 *
 * ```
 *   idle ──start()──▶ listening ──stop()──▶ thinking ──answer()──▶ speaking
 *     ▲                   │                    │                      │
 *     └──── bargeIn() ◀───┴────────────────────┴──────────────────────┘
 * ```
 *
 * Четыре правила, каждое проверяемо без микрофона и динамика:
 *
 *  * **в `speaking` микрофон закрыт.** Иначе распознавание поймает собственную
 *    речь и ответит сам себе;
 *  * **перебивание из любого состояния ведёт в `listening`**, а не в `idle`:
 *    человек, который заговорил, хочет быть услышанным, а не выключить микрофон;
 *  * **`idle` ничего не значит «сломалось»**: это нормальное «жду фразы»;
 *  * **неизвестный переход — `idle`, а не прежнее состояние.** Застрять в
 *    «говорю» навсегда хуже, чем вернуться в готовность.
 */

/** Что происходит со звуком прямо сейчас. */
export type AudioState = "idle" | "listening" | "thinking" | "speaking";

/** Что случилось. */
export type AudioEvent =
  /** Человек начал говорить (или нажал кнопку). */
  | "start"
  /** Он замолчал, фраза ушла на разбор. */
  | "stop"
  /** Ответ готов: пришло время говорить. */
  | "answer"
  /** Ответ сказан до конца. */
  | "finished"
  /** Человек заговорил поверх ответа. */
  | "bargeIn"
  /** Всё сбросить. */
  | "reset";

export interface AudioMachine {
  state: AudioState;
  /** Можно ли принять следующее событие. `null` — переход не разрешён. */
  send: (event: AudioEvent) => AudioState | null;
  /** Открыт ли микрофон в этом состоянии. */
  mic: () => boolean;
  /** Звучит ли речь в этом состоянии. */
  out: () => boolean;
}

/**
 * Переход. Чистая функция — вся суть видна в одной таблице, и её можно проверить
 * без браузера, микрофона и синтеза.
 */
export function next(state: AudioState, event: AudioEvent): AudioState | null {
  if (event === "reset") return "idle";

  switch (state) {
    case "idle":
      return event === "start" ? "listening" : null;
    case "listening":
      if (event === "stop") return "thinking";
      // Нажатие «начать» при уже открытом микрофоне — не ошибка, а повтор.
      if (event === "start") return "listening";
      return null;
    case "thinking":
      if (event === "answer") return "speaking";
      // Пока ответа нет, человек может передумать и сказать заново.
      if (event === "start" || event === "bargeIn") return "listening";
      return null;
    case "speaking":
      if (event === "finished") return "idle";
      // Заговорил поверх — микрофон открывается, речь замолкает.
      if (event === "bargeIn") return "listening";
      if (event === "start") return "listening";
      return null;
    default:
      return "idle";
  }
}

/** Открыт ли микрофон: только когда слушаем (и никогда — когда говорим). */
export function micOpen(state: AudioState): boolean {
  return state === "listening";
}

/** Звучит ли наша речь: только в `speaking`. */
export function speaking(state: AudioState): boolean {
  return state === "speaking";
}

/** Машина с памятью. Неизвестный переход оставляет состояние как есть. */
export function createAudioMachine(
  onChange?: (from: AudioState, to: AudioState, event: AudioEvent) => void,
  start: AudioState = "idle",
): AudioMachine {
  let state = start;

  return {
    get state() {
      return state;
    },
    send(event: AudioEvent): AudioState | null {
      const to = next(state, event);
      if (to === null) return null;
      const from = state;
      state = to;
      // Обратный вызов после смены состояния: обработчик должен видеть новое,
      // иначе ему придётся ждать следующего события, чтобы узнать текущее.
      onChange?.(from, to, event);
      return to;
    },
    mic: () => micOpen(state),
    out: () => speaking(state),
  };
}
