/**
 * Шаг 460: тест — горячая клавиша не срабатывает дважды при удержании.
 *
 * Держать клавишу — естественное действие: человек нажал, не сработало сразу,
 * подержал. Windows в это время присылает **поток автоповтора** (repeat), и без
 * защиты получается:
 *
 *  * **десять запусков** голосового ввода — по одному на каждый повтор;
 *  * **двойная отмена**: первая отменяет дело, вторая «отменяет отмену»;
 *  * **мигание** состояния: вкл / выкл / вкл — и непонятно, что включено.
 *
 * Правило: **действие срабатывает на переходе «отпущено → нажато»**, и пока
 * клавиша не отпущена, повторы игнорируются.
 *
 * Отдельная тонкость — **дребезг**: физически клавиша может дать два события
 * `down` подряд за пару миллисекунд. Это не удержание, но и не второе нажатие:
 * нужен короткий карантин.
 */

/** Событие клавиши. */
export type Event = "down" | "up";

/** Состояние. */
export interface State {
  /** Нажата ли сейчас. */
  readonly down: boolean;
  /** Когда было последнее настоящее нажатие — миллисекунды. */
  readonly lastDownAt: number;
}

/** Начальное состояние. */
export const INITIAL: State = { down: false, lastDownAt: -Infinity };

/** Карантин против дребезга: два `down` ближе этого — один нажим. */
export const DEBOUNCE_MS = 50;

/**
 * Обработать событие.
 *
 * `fire` — сработало ли действие. При удержании — `false`, и это главное.
 */
export function handle(state: State, event: Event, now: number): { state: State; fire: boolean; said: string } {
  if (event === "up") {
    return { state: { ...state, down: false }, fire: false, said: "отпущено" };
  }

  // Дребезг проверяется **первым**: при нём `down` уже true, и проверка удержания
  // съела бы его, назвав удержанием. Это и был дефект — найден тестом.
  if (now - state.lastDownAt < DEBOUNCE_MS) {
    return { state, fire: false, said: "дребезг: это тот же нажим" };
  }

  if (state.down) {
    return { state, fire: false, said: "удержание: повторное нажатие игнорирую" };
  }

  return { state: { down: true, lastDownAt: now }, fire: true, said: "нажато: срабатываю один раз" };
}

/**
 * Прогнать поток событий.
 *
 * Возвращает **число срабатываний** — то, что и проверяется тестом.
 */
export function count(events: readonly { event: Event; at: number }[]): { fires: number; said: string } {
  let state = INITIAL;
  let fires = 0;
  for (const item of events) {
    const got = handle(state, item.event, item.at);
    state = got.state;
    if (got.fire) fires += 1;
  }
  return { fires, said: fires === 0 ? "не сработало ни разу" : `сработало ${fires} ${fires === 1 ? "раз" : "раза"}` };
}

/**
 * Потоки для проверки.
 *
 * Три настоящих сценария — и все встречаются.
 */
export function scenarios(): { name: string; events: { event: Event; at: number }[] }[] {
  return [
    { name: "одно нажатие", events: [{ event: "down", at: 0 }, { event: "up", at: 100 }] },
    { name: "удержание", events: [{ event: "down", at: 0 }, { event: "down", at: 300 }, { event: "down", at: 600 }, { event: "up", at: 900 }] },
    { name: "дребезг", events: [{ event: "down", at: 0 }, { event: "down", at: 5 }, { event: "up", at: 100 }] },
  ];
}

/**
 * Что проверяет тест.
 *
 * Три сценария и ожидаемое число срабатываний.
 */
export function expected(): { name: string; fires: number }[] {
  return [
    { name: "одно нажатие", fires: 1 },
    { name: "удержание", fires: 1 },
    { name: "дребезг", fires: 1 },
  ];
}

/**
 * Что не делает обработка.
 *
 * Три дефекта, каждый из которых виден человеку.
 */
export function notDo(): string[] {
  return [
    "не срабатывает на каждом повторе: десять запусков голосового ввода",
    "не «отменяет отмену»: второе нажатие при удержании не считается",
    "не путает дребезг с удержанием: у них разное лечение — одно игнорируем, другое считаем тем же нажимом",
  ];
}
