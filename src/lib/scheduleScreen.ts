/**
 * Шаг 327: просмотр и отмена расписания одной кнопкой — и всё в одном месте.
 *
 * Расписание, которое нельзя увидеть списком, перестаёт существовать для
 * человека: он помнит, что «что-то настроил», но не помнит что, и новые правила
 * создаёт поверх старых, не понимая, почему теперь приходит два отчёта.
 *
 * Поэтому один экран и на нём всё:
 *
 *  * **когда** — словами («каждый день в 09:00»);
 *  * **что** — дело;
 *  * **как прошло в последний раз** — с датой, а не «успешно»;
 *  * **пауза** — одна кнопка на строке, не в глубине настроек.
 *
 * Отмена — не удаление из списка тихо: человек должен видеть, что он отменил.
 */

/** Расписание в списке. */
export interface Item {
  readonly id: string;
  /** Когда — словами. */
  readonly when: string;
  /** Что делает. */
  readonly what: string;
  /** Последний запуск: миллисекунды или 0. */
  readonly lastAt: number;
  /** Чем кончился последний раз. */
  readonly lastOutcome: "done" | "skipped" | "failed" | "never";
  /** На паузе. */
  readonly paused: boolean;
}

/** Строка экрана. */
export function row(item: Item, now: number): string {
  const state = item.paused ? "на паузе" : "включено";
  const last =
    item.lastOutcome === "never" || item.lastAt === 0
      ? "ещё не запускалось"
      : `${whenText(item.lastAt, now)}: ${outcomeText(item.lastOutcome)}`;
  return `${item.when} — ${item.what} [${state}]; последний раз ${last}`;
}

/** Когда был запуск: «сегодня», «вчера», «12 ноября». */
export function whenText(at: number, now: number): string {
  const day = 86_400_000;
  const today = new Date(now).toISOString().slice(0, 10);
  const that = new Date(at).toISOString().slice(0, 10);
  if (today === that) return "сегодня";
  if (new Date(now - day).toISOString().slice(0, 10) === that) return "вчера";
  return that;
}

function outcomeText(outcome: Item["lastOutcome"]): string {
  if (outcome === "done") return "сделано";
  if (outcome === "skipped") return "пропущено";
  if (outcome === "failed") return "ошибка";
  return "не запускалось";
}

/**
 * Экран целиком: сколько включено, сколько на паузе, что было последним.
 *
 * Счёт — чтобы человек видел масштаб: двадцать правил на паузе — это не «я
 * выключил одно».
 */
export function screen(items: readonly Item[], now: number): string[] {
  if (items.length === 0) return ["расписаний нет: скажите «каждый день в 9 — отчёт о диске», и оно появится"];
  const paused = items.filter((item) => item.paused).length;
  return items.map((item) => row(item, now)).concat([`всего ${items.length}, на паузе ${paused}`]);
}

/**
 * Отмена одной кнопкой.
 *
 * Не спрашивает «вы уверены?»: расписание можно вернуть, а лишний вопрос
 * приучает нажимать «да» не читая. Зато **говорит**, что отменено — чтобы не
 * было ощущения, что кнопка не сработала.
 */
export function cancel(item: Item): { ok: true; said: string } {
  return { ok: true, said: `отменено: «${item.what}» (${item.when}); вернуть можно в этом же списке` };
}

/**
 * Пауза и продолжение — разные действия.
 *
 * Пауза сохраняет расписание и его доверие (шаг 323); удаление — нет.
 */
export function pause(item: Item): string {
  return item.paused ? `«${item.what}» снова включено` : `«${item.what}» на паузе: срабатывать не будет, история и доверие сохранятся`;
}

/**
 * Что нельзя обещать.
 *
 * «Одно место» — обещание, которое ломается, если правила есть и в другом окне.
 */
export function where(): string {
  return "все расписания — в одном списке; отдельных «автоматизаций» в других окнах нет";
}
