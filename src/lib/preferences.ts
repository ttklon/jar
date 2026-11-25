/**
 * Шаг 261: память о предпочтениях — папки, программы, голос, громкость.
 *
 * Почему это отдельная память, а не «настройки». Настройка — это то, что человек
 * выбрал **один раз и осознанно**: тема, язык. Предпочтение — то, что он
 * **показал делом**: снова открыл папку `D:\Отчёты`, снова запустил `Code`,
 * поправил громкость до 30% и оставил. Второй раз спрашивать об этом — работа,
 * которую человек делает за программу.
 *
 * Правила, без которых такая память раздражает сильнее её отсутствия:
 *
 *  1. **предпочтение — это повтор, а не один случай.** Один раз человек зашёл
 *     не туда. Запоминаем со второго-третьего раза: `THRESHOLD`;
 *  2. **свежее важнее частого.** Полгода назад папка открывалась каждый день, а
 *     теперь — другая, и подсказывать старую значит спорить с человеком;
 *  3. **противоречие разрешается временем, а не большинством.** Пять раз в
 *     марте против трёх в ноябре — не «март победил»;
 *  4. **голос и громкость — не «ещё один вид папок».** У них единица другая:
 *     папка — имя, громкость — число, голос — выбор из списка. Одна форма
 *     ломает все три;
 *  5. **удаляется каждый факт отдельно.** Память без управления — это хранение
 *     чужих привычек без спроса (подробно — шаг 263).
 */

/** Что именно запоминается. */
export type Kind = "folder" | "program" | "voice" | "volume";

/** Одно наблюдение: что человек сделал и когда. */
export interface Sighting {
  readonly kind: Kind;
  /** Значение: путь, имя программы, голос, «30» для громкости. */
  readonly value: string;
  /** Когда, мс. Больше — свежее. */
  readonly at: number;
}

/** Итог: что предложить и почему. */
export interface Preference {
  readonly kind: Kind;
  readonly value: string;
  /** Сколько раз видели. */
  readonly times: number;
  /** Когда последний раз. */
  readonly last: number;
  /** Почему именно это значение — словами. */
  readonly why: string;
}

/**
 * Со скольких повторов запоминаем.
 *
 * Два — минимум, при котором «случайно» отсекается: один раз человек зашёл не
 * туда, второй раз — это уже привычка или намерение. Три было бы осторожнее, но
 * на третьем повторе человек уже трижды сделал работу за программу.
 */
export const THRESHOLD = 2;

/**
 * Через сколько дней память перестаёт считаться свежей.
 *
 * Тридцать — не «месяц ради месяца»: смена сезона (учёба, отчётный период)
 * меняет папки и программы, и подсказка из прошлого сезона чаще мешает.
 */
export const STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Что предложить для одного вида.
 *
 * Выбор — по **времени последнего** наблюдения, а не по числу: правило 3.
 * Совпадение времени разрешается числом, и это не «большинство решает», а
 * «при равной свежести чаще — вероятнее».
 */
export function pick(sightings: readonly Sighting[], kind: Kind, now: number): Preference | null {
  const mine = sightings.filter((sighting) => sighting.kind === kind);
  if (mine.length === 0) return null;

  const byValue = new Map<string, { times: number; last: number }>();
  for (const sighting of mine) {
    const got = byValue.get(sighting.value) ?? { times: 0, last: 0 };
    got.times += 1;
    got.last = Math.max(got.last, sighting.at);
    byValue.set(sighting.value, got);
  }

  let best: { value: string; times: number; last: number } | null = null;
  for (const [value, got] of byValue) {
    if (!best) {
      best = { value, ...got };
      continue;
    }
    // Свежее важнее частого: полгода назад папка открывалась каждый день, а
    // теперь другая, и подсказывать старую значит спорить с человеком.
    if (got.last > best.last) best = { value, ...got };
    else if (got.last === best.last && got.times > best.times) best = { value, ...got };
  }
  if (!best) return null;
  // Один случай — не привычка: человек один раз зашёл не туда.
  if (best.times < THRESHOLD) return null;

  const age = now - best.last;
  const fresh = age <= STALE_MS;
  // Склонение по-русски, а не «раз» на все случаи: 2, 3, 4 — «раза», 5 и
  // больше — «раз», 11–14 — снова «раз». Правило простое, но при числе без
  // него текст читается как машинный.
  const unit = best.times % 100 >= 11 && best.times % 100 <= 14
    ? "раз"
    : best.times % 10 >= 2 && best.times % 10 <= 4
      ? "раза"
      : "раз";
  return {
    kind,
    value: best.value,
    times: best.times,
    last: best.last,
    why: fresh
      ? `выбрано ${best.times} ${unit}, последний — ${days(age)}`
      : `выбрано ${best.times} ${unit}, но последний раз ${days(age)}: могло устареть`,
  };
}

function days(ms: number): string {
  const count = Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  if (count === 0) return "сегодня";
  if (count === 1) return "вчера";
  // «5 дней назад» вместо «5 дн.»: число без единицы читается как код.
  return `${count} ${count < 5 ? "дня" : "дней"} назад`;
}

/** Все предпочтения, которые есть: по одному на каждый вид с повтором. */
export function all(sightings: readonly Sighting[], now: number): Preference[] {
  const kinds: Kind[] = ["folder", "program", "voice", "volume"];
  const out: Preference[] = [];
  for (const kind of kinds) {
    const got = pick(sightings, kind, now);
    if (got) out.push(got);
  }
  return out;
}

/**
 * Значение для подстановки — с оговоркой, если оно устарело.
 *
 * Устаревшее не выбрасывается: человек мог вернуться к прежней папке после
 * перерыва, и молча стереть её значит потерять верное. Но и выдавать старое за
 * текущее нельзя — поэтому «могло устареть» едет вместе со значением.
 */
export function suggest(sightings: readonly Sighting[], kind: Kind, now: number): { value: string | null; note: string } {
  const got = pick(sightings, kind, now);
  if (!got) return { value: null, note: "пока нечему учиться: нужно два раза" };
  const age = now - got.last;
  if (age > STALE_MS) {
    return { value: got.value, note: `последний раз ${days(age)} — могло устареть` };
  }
  return { value: got.value, note: "" };
}

/**
 * Громкость — отдельно: это число, а не имя.
 *
 * Запоминать «30» как строку можно, но подсказывать надо числом, и приводить к
 * границам 0..100 — иначе однажды в памяти окажется «130» и колонки оглохнут.
 */
export function volume(sightings: readonly Sighting[], now: number): { value: number | null; why: string } {
  const got = pick(sightings, "volume", now);
  if (!got) return { value: null, why: "пока нечему учиться: нужно два раза" };
  const parsed = Number(got.value);
  if (!Number.isFinite(parsed)) {
    // Не число в памяти — это ошибка записи, и её надо назвать, а не
    // подставить «0»: ноль оглушит колонки молча.
    return { value: null, why: `в памяти «${got.value}» — это не громкость` };
  }
  const clamped = Math.min(100, Math.max(0, Math.round(parsed)));
  return { value: clamped, why: got.why };
}

/**
 * Забыть один факт — по виду и значению.
 *
 * Возвращает новое множество наблюдений: память не мутируется на месте, иначе
 * «удалить» на экране не отменить и не повторить.
 */
export function forget(sightings: readonly Sighting[], kind: Kind, value: string): Sighting[] {
  return sightings.filter((sighting) => !(sighting.kind === kind && sighting.value === value));
}
