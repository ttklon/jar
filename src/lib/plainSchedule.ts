/**
 * Шаг 321: «Каждый день в 9 — отчёт о месте на диске» — без кода.
 *
 * Автономность, которую человек настраивает сам, начинается с одной возможности:
 * **сказать привычную фразу** и получить расписание. Не «создайте задачу, выберите
 * триггер, добавьте действие» — человек так не думает, он говорит «каждый день в
 * девять».
 *
 * Здесь только разбор фразы и понятный ответ. Что происходит при запуске —
 * в `schedule.rs` (срабатывает один раз, шаг 330); «только если» — шаг 333.
 *
 * Что обязательно в ответе:
 *
 *  * **когда** — не «по выбранному расписанию», а «каждый день в 09:00»;
 *  * **что именно** — «отчёт о месте на диске», а не «дело»;
 *  * **что будет, если не сработает** — «в 9:00, если компьютер спал, спрошу»
 *    (шаг 334);
 *  * **как отменить** — одна фраза: «скажи „отмени ежедневный отчёт“».
 */

/** Что человек попросил. */
export interface Wanted {
  /** Когда: минута от полуночи или строка «час». */
  readonly at: number | "hourly";
  /** Что делать — словами человека. */
  readonly what: string;
}

/** Разобранная фраза. */
export type Parsed = { ok: true; wanted: Wanted; said: string } | { ok: false; why: string };

const DAY_WORDS: Record<string, number> = {
  утром: 9,
  утрам: 9,
  дня: 13,
  вечера: 19,
  ночи: 2,
  днём: 13,
  вечером: 19,
  ночью: 2,
};

/**
 * Разобрать «каждый день в 9 — отчёт о месте на диске».
 *
 * Понимаем и «в 9:30», и «утром», и «каждый час». Чего не понимаем — спрашиваем,
 * а не угадываем: неверно созданное расписание хуже отсутствующего.
 */
export function parse(text: string): Parsed {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed === "") return { ok: false, why: "не сказано, что и когда" };

  const lower = trimmed.toLowerCase();
  const hourly = /каждый\s+час/i.test(lower);
  const daily = /кажд\S*\s+д(ень|ня)|ежедневно|по\s+утрам|утром/i.test(lower);
  if (!hourly && !daily) {
    return { ok: false, why: "не понял, когда: нужно «каждый день в 9» или «каждый час»" };
  }

  // 1. Разделяем «когда» и «что»: по тире, если оно есть.
  const dashSplit = trimmed.split(/\s+[—–-]\s+/);
  let whenPart = dashSplit[0] ?? trimmed;
  let what = dashSplit.length > 1 ? dashSplit.slice(1).join(" — ").trim() : "";

  // 2. Время — из части «когда».
  let hour: number | null = null;
  let minute = 0;

  const clock = whenPart.match(/в\s+(\d{1,2})(?::(\d{2}))?/i);
  if (clock) {
    hour = Number(clock[1]);
    minute = clock[2] ? Number(clock[2]) : 0;
  } else {
    for (const [word, value] of Object.entries(DAY_WORDS)) {
      if (whenPart.toLowerCase().includes(word)) {
        hour = value;
        break;
      }
    }
  }

  // 3. Если тире не было, «что» — это фраза без слов о времени.
  if (what === "") {
    what = trimmed
      .replace(/^кажд\S*\s+(день|час)(?:\s|$)/i, "")
      .replace(/^ежедневно(?:\s|$)/i, "")
      .replace(/^по\s+утрам(?:[\s,]|$)/i, "")
      .replace(/^утром(?:[\s,]|$)/i, "")
      .replace(/(?:^|\s)в\s+\d{1,2}(?::\d{2})?(?:\s|$)/i, " ")
      .replace(/^[\s,.:—–-]+/, "")
      .trim();
  }

  if (hourly) {
    if (what === "") return { ok: false, why: "сказано когда, но не сказано что делать" };
    return { ok: true, wanted: { at: "hourly", what }, said: `каждый час: ${what}` };
  }

  if (hour === null) return { ok: false, why: "не понял время: скажи «в 9» или «утром»" };
  if (hour > 23) return { ok: false, why: `часов ${hour} не бывает: 0–23` };
  if (minute > 59) return { ok: false, why: `минут ${minute} не бывает: 0–59` };
  if (what === "") return { ok: false, why: "сказано когда, но не сказано что делать" };

  const at = hour * 60 + minute;
  return { ok: true, wanted: { at, what }, said: `каждый день в ${clockText(at)}: ${what}` };
}

/** Время для человека: «09:00», «21:30». */
export function clockText(at: number): string {
  const hour = Math.floor(at / 60);
  const minute = at % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Ответ до подтверждения.
 *
 * Три факта и способ отмены — не больше. Человек подтверждает «да», а не изучает
 * документ.
 */
export function confirm(wanted: Wanted): string {
  const when = wanted.at === "hourly" ? "каждый час" : `каждый день в ${clockText(wanted.at)}`;
  return [
    `${when}: ${wanted.what}`,
    "если компьютер спал в это время — спрошу, сделать ли пропущенное",
    "отменить: скажи «отмени» или нажми «Пауза» в списке расписаний",
  ].join("\n");
}

/**
 * Ночное расписание.
 *
 * Человек вправе поставить что угодно, но если дело меняет мир, ночью — тишина
 * (шаг 325). Здесь только предупреждение, решение — у него.
 */
export function nightNotice(wanted: Wanted, changesWorld: boolean): string | null {
  if (wanted.at === "hourly") return null;
  const hour = Math.floor(wanted.at / 60);
  if (hour >= 23 || hour < 7) {
    if (changesWorld) {
      return `в ${clockText(wanted.at)} вы, скорее всего, спите: дела, которые меняют что-то в системе, ночью не запускаются без подтверждения`;
    }
    return null;
  }
  return null;
}
