/**
 * Шаг 427: кнопка «покажи, что ты сейчас делаешь».
 *
 * Человек ждёт. Дело идёт, но снаружи видно только «работаю». Кнопка отвечает на
 * вопрос **сейчас**, а не «в журнале потом».
 *
 * Три решения, без которых кнопка бесполезна:
 *
 *  * **отвечает мгновенно** — состояние уже есть, его не надо запрашивать у
 *    модели. Иначе «покажи» само станет ожиданием;
 *  * **говорит, где дело в целом** — «шаг 3 из 7 и что это за шаг», а не только
 *    «удаляю файл»;
 *  * **говорит, чего ждём**, если ничего не происходит: самая частая ситуация —
 *    приложение ждёт ответа человека, а он ждёт приложения.
 */

/** Что известно прямо сейчас. */
export interface Now {
  /** Дело, если идёт. */
  readonly deed?: string;
  /** Шаги: сколько всего и на каком стоим (с нуля). */
  readonly total?: number;
  readonly step?: number;
  /** Что делаем на этом шаге. */
  readonly doing?: string;
  /** Ждём ли человека — и чего именно. */
  readonly waitingFor?: string;
  /** С какого времени — миллисекунды. */
  readonly since?: number;
}

/**
 * Ответить.
 *
 * `nowMs` — текущее время, чтобы посчитать, сколько уже идёт.
 */
export function answer(now: Now, nowMs: number): string {
  if (now.deed === undefined) {
    return "сейчас ничего не делаю: жду вашу фразу";
  }

  if (now.waitingFor !== undefined) {
    const waited = now.since === undefined ? "" : ` (${duration(nowMs - now.since)})`;
    return `«${now.deed}» ждёт вашего ответа${waited}: ${now.waitingFor}`;
  }

  const where = now.total !== undefined && now.step !== undefined ? `шаг ${now.step + 1} из ${now.total}: ` : "";
  const what = now.doing ?? "работаю";
  const howLong = now.since === undefined ? "" : `, ${duration(nowMs - now.since)}`;
  return `«${now.deed}», ${where}${what}${howLong}`;
}

/**
 * Сказать «сколько это займёт».
 *
 * Не «скоро» и не «пожалуйста, подождите»: если ожидание дольше десяти секунд,
 * человеку нужно знать **примерно** сколько, иначе он уйдёт.
 */
export function estimate(now: Now): string {
  if (now.waitingFor !== undefined) return "сколько будет ждать — зависит от вас";
  if (now.total === undefined || now.step === undefined) return "оценки нет: остальные шаги ещё не известны";
  const left = now.total - now.step - 1;
  if (left === 0) return "это последний шаг";
  return `осталось ${left} ${left === 1 ? "шаг" : "шага"}`;
}

/**
 * Куда кнопка смотрит.
 *
 * Не в журнал: журнал — про прошлое, а кнопка — про сейчас. И не в отчёт
 * (шаг 374): отчёт соберётся, когда закончится.
 */
export function notWhere(): string[] {
  return [
    "не в журнал: там прошлое, а это про сейчас",
    "не в отчёт: отчёт будет, когда дело закончится",
    "не в модель: ответ должен быть мгновенным, а модель — нет",
  ];
}

/** Длительность по-человечески. */
export function duration(ms: number): string {
  if (ms < 1000) return "только начал";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec} с`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest === 0 ? `${min} мин` : `${min} мин ${rest} с`;
}

/**
 * Что кнопка не делает.
 *
 * Не меняет ничего — и это проверяется формой: `answer` читает состояние и
 * возвращает строку.
 */
export function safe(): string {
  return "кнопка только читает: «покажи» не останавливает, не ускоряет и ничего не меняет в деле";
}
