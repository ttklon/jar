/**
 * Шаг 367: дело, которое идёт, видно из любого экрана — индикатор, а не поиск.
 *
 * Человек запустил дело, ушёл в настройки или в память, и **забыл**, что оно
 * идёт. Через минуту дело закончилось, но он этого не видел; а если оно ждёт
 * подтверждения — ждёт впустую.
 *
 * Поэтому состояние дела показывается **везде**, где есть окно: одна плашка в
 * углу, а не отдельный экран, который надо искать.
 *
 * Что обязательно в плашке:
 *
 *  * **что идёт** — «уборка загрузок», а не «выполняется»;
 *  * **шаг** — «3 из 7», чтобы было видно, что процесс живой;
 *  * **можно ли отменить** — кнопка, если отмена возможна.
 *
 * Плашка не перекрывает содержимое и не крадёт фокус: это индикатор, а не
 * уведомление.
 */

/** Что сейчас идёт. */
export interface Running {
  /** Название дела — словами человека. */
  readonly what: string;
  /** Сколько шагов сделано и всего. */
  readonly done: number;
  readonly total: number;
  /** Ждёт подтверждения — тогда это не «идёт», а «ждёт». */
  readonly waiting: boolean;
  /** Можно ли отменить. */
  readonly cancellable: boolean;
}

/** Текст плашки для одного дела. */
export function badge(running: Running): string {
  if (running.waiting) return `${running.what}: ждёт вашего ответа`;
  if (running.total <= 0) return `${running.what}: идёт`;
  return `${running.what}: шаг ${running.done} из ${running.total}`;
}

/** Несколько дел разом — одно место, а не стопка плашек. */
export function badgeAll(items: readonly Running[]): string | null {
  if (items.length === 0) return null;

  const waiting = items.filter((item) => item.waiting);
  if (waiting.length > 0) {
    // Ждущее дело важнее идущего: без ответа оно не сдвинется вовсе.
    return waiting.length === 1
      ? badge(waiting[0]!)
      : `${waiting.length} ${plural(waiting.length, "дело ждёт", "дела ждут", "дел ждут")} ответа`;
  }

  if (items.length === 1) return badge(items[0]!);
  return `${items.length} ${plural(items.length, "дело идёт", "дела идут", "дел идут")}: ${items.map((item) => item.what).join(", ")}`;
}

/**
 * Где показывать.
 *
 * Не «на экране дел»: именно потому, что человек ушёл с него, плашка нужна
 * везде.
 */
export function everywhere(): string[] {
  return [
    "на всех экранах, включая настройки и память",
    "в трее значком, если окно свёрнуто",
    "в заголовке окна, если плашка не влезает",
  ];
}

/**
 * Чего плашка не делает.
 *
 * Три соблазна: перекрыть, подпрыгнуть, забрать фокус. Каждый ломает работу,
 * которую плашка должна просто сопровождать.
 */
export function notDoing(): string[] {
  return [
    "не перекрывает содержимое: она в углу, а не поверх",
    "не забирает фокус: человек продолжает печатать",
    "не требует нажатия: исчезает сама, когда дело кончилось",
  ];
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
