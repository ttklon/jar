/**
 * Шаг 271: память о деле — «вчера чистил диск» — с результатом и путями.
 *
 * Зачем отдельно от карточки дела (`deed.ts`) и от «как вчера»
 * (`likeYesterday.ts`). Карточка отвечает про **одно** дело и живёт, пока
 * человек смотрит: «что я только что сделал». «Как вчера» разбирает, **когда**
 * просить, и повторяет **шаги**. Ни то, ни другое не отвечает на вопрос, с
 * которого начинается настоящая память о деле: «что я делал вчера и чем это
 * кончилось».
 *
 * Четыре вещи, без которых эта память бесполезна:
 *
 *  1. **результат, а не факт запуска.** «Чистил диск» — это не память, если
 *     неизвестно, освободилось 2 ГБ или всё упало на третьем файле. Отчёт без
 *     исхода — это отчёт о намерении;
 *  2. **пути.** Человек помнит «чистил диск», а не «C:\\Users\\…\\Temp». Но
 *     найти и перепроверить можно только по путям — и только они позволяют
 *     ответить «а он точно удалил?»;
 *  3. **провал помнится наравне с успехом.** «Вчера не получилось» — тоже
 *     память, и часто более нужная: успех повторяют, а провал разбирают;
 *  4. **у давнего дела возраст называется, а не замалчивается.** «Чистил диск»
 *     без даты через месяц читается как «вчера», и человек уверен в том, чего
 *     не было.
 */

/** Чем кончилось дело. */
export type Outcome = "ok" | "failed" | "cancelled" | "denied";

/** Одно дело, которое стоит помнить. */
export interface Remembered {
  /** Когда началось, мс. */
  readonly at: number;
  /** Что человек сказал или что было целью: «почистить диск». */
  readonly subject: string;
  readonly outcome: Outcome;
  /**
   * Результат словами: «освободилось 2,3 ГБ», «остановлено на 3-м файле».
   * Пусто — и тогда так и говорится, а не выдумывается.
   */
  readonly result: string;
  /** Пути, которых касалось дело. Пусто — дело их не касалось. */
  readonly paths: readonly string[];
  /** Почему не вышло; пусто у успешного. */
  readonly because: string;
}

/**
 * Сколько дел помнить.
 *
 * Тридцать — не «круглое число»: это примерно месяц обычной работы, и дальше
 * память перестаёт быть памятью о деле, а становится архивом, в котором ищут
 * глазами. Для «а что я делал в прошлом квартале» есть журнал, а не память.
 */
export const KEEP = 30;

/**
 * Что стоит помнить из дела.
 *
 * Дело без исхода не запоминается вовсе: «запускал и не знаю чем кончилось» —
 * это не память, это мусор, который потом примут за знание. А дело, которое
 * ещё идёт, — не история: его нельзя «вспомнить», его видно на экране.
 */
export function remember(deed: {
  at: number;
  subject: string;
  outcome: Outcome | "running";
  result?: string;
  paths?: readonly string[];
  because?: string;
}): Remembered | null {
  if (deed.outcome === "running") return null;
  const subject = deed.subject.trim();
  if (subject === "") return null;
  return {
    at: deed.at,
    subject,
    outcome: deed.outcome,
    result: (deed.result ?? "").trim(),
    // Пути без повторов и в том виде, в каком их дал человек или система:
    // сравнение регистра — дело файловой системы, а не памяти.
    paths: [...new Set((deed.paths ?? []).map((path) => path.trim()).filter((path) => path !== ""))],
    because: (deed.because ?? "").trim(),
  };
}

/** Дописать в память, сохранив порядок «новое в конце». */
export function add(history: readonly Remembered[], deed: Remembered): Remembered[] {
  const next = [...history, deed];
  return next.length <= KEEP ? next : next.slice(next.length - KEEP);
}

/**
 * Найти дела по словам человека и по времени.
 *
 * Слова сравниваются с предметом и результатом, а не с исходами: «чистил диск»
 * есть в предмете, а «failed» — нет, и искать по-английски человек не станет.
 */
export function find(
  history: readonly Remembered[],
  query: { words?: string; since?: number; until?: number },
): Remembered[] {
  const words = (query.words ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9]+/)
    .filter((word) => word.length > 1);

  return history.filter((deed) => {
    if (query.since !== undefined && deed.at < query.since) return false;
    if (query.until !== undefined && deed.at >= query.until) return false;
    if (words.length === 0) return true;
    const haystack = `${deed.subject} ${deed.result} ${deed.paths.join(" ")}`
      .toLowerCase()
      .replace(/ё/g, "е");
    return words.every((word) => haystack.includes(word.slice(0, Math.max(4, word.length - 2))));
  });
}

/**
 * Отчёт о деле для человека — с результатом и путями.
 *
 * Не одна строка «почистить диск — ok»: исход словами, результат, и пути
 * отдельно, потому что их читают, когда ищут следы.
 */
export function say(deed: Remembered): string {
  const head = `${deed.subject} — ${outcomeWord(deed.outcome)}`;
  const parts: string[] = [head];

  if (deed.result !== "") {
    parts.push(deed.result);
  } else if (deed.outcome === "ok") {
    // Пусто у успешного — не «всё хорошо»: значит, результат не записан,
    // и говорить за него нельзя.
    parts.push("результат не записан");
  }

  if (deed.because !== "") parts.push(`причина: ${deed.because}`);

  if (deed.paths.length > 0) {
    const shown = deed.paths.slice(0, 3).join(", ");
    parts.push(deed.paths.length > 3 ? `пути: ${shown} и ещё ${deed.paths.length - 3}` : `пути: ${shown}`);
  }

  return parts.join("; ");
}

function outcomeWord(outcome: Outcome): string {
  if (outcome === "ok") return "получилось";
  if (outcome === "failed") return "не получилось";
  if (outcome === "cancelled") return "остановлено";
  return "не разрешено";
}

/**
 * Возраст дела словами.
 *
 * Без этого «чистил диск» через месяц читается как «вчера», и человек уверен в
 * том, чего не было. Границы — по календарю, а не по часам: дело вчера в 23:00
 * при разговоре в 8 утра — это 9 часов, а «сегодня» в 9:00, если считать часы.
 * Поэтому `todayStart` — величина, а не «сейчас минус 24 часа».
 */
export function age(deed: Remembered, todayStart: number): string {
  const day = 24 * 60 * 60 * 1000;
  if (deed.at >= todayStart) return "сегодня";
  if (deed.at >= todayStart - day) return "вчера";
  // Считаются **календарные** дни, а не прошедшие часы: дело вчера в 23:30 и
  // разговор сегодня в 8 утра — это «вчера», хотя прошло девять часов.
  // Отсюда и дефект, который здесь закрыт: прежняя формула сравнивала `at` с
  // «началом сегодня минус сутки» и округляла вниз, поэтому дело в 23:30
  // трое суток назад называлось «2 дня назад» — на день моложе, чем было.
  // `round` — потому что в сутках перехода времени 23 или 25 часов.
  const fromMidnight = new Date(deed.at).setHours(0, 0, 0, 0);
  const days = Math.round((todayStart - fromMidnight) / day);
  if (days <= 7) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  return when(deed.at);
}

function when(at: number): string {
  const date = new Date(at);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

/**
 * Что ответить на «вспомни, как я чистил диск».
 *
 * Пустая память, ничего не нашлось и дело ещё идёт — три разных ответа: иначе
 * человек ищет сбой там, где просто не то слово.
 */
export function recall(history: readonly Remembered[], found: readonly Remembered[], query: string): string {
  if (history.length === 0) return "я ещё ничего не делал — памяти о делах нет";
  if (found.length === 0) return `про «${query}» ничего не помню — попробуйте назвать диск или папку`;
  if (found.length === 1) return say(found[0]!);
  const last = found[found.length - 1]!;
  return `таких дел ${found.length}, последнее — ${say(last)}`;
}

/**
 * Похожие дела: то, что человек, скорее всего, имел в виду.
 *
 * Свежее — важнее: «чистил диск» вчера и полгода назад — разные воспоминания,
 * и по умолчанию человек говорит про вчерашнее.
 */
export function latest(history: readonly Remembered[]): Remembered | null {
  let best: Remembered | null = null;
  for (const deed of history) {
    if (best === null || deed.at > best.at) best = deed;
  }
  return best;
}

function plural(n: number, one: string, few: string, many: string): string {
  const ten = n % 100;
  if (ten >= 11 && ten <= 14) return many;
  const unit = n % 10;
  if (unit === 1) return one;
  if (unit >= 2 && unit <= 4) return few;
  return many;
}
