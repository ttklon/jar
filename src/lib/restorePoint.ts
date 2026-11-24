/**
 * Точка восстановления: имя копии — это время, а не имя файла (шаг 155).
 *
 * Дефект. Экран предлагал выбрать копию по имени `memory-20261120-143000-v1.db`.
 * Человек в беде выбирает **когда** вернуть память, а не какой строкой она
 * названа: имя в списке заставляло расшифровывать `20261120-143000` в голове,
 * путать UTC с местным временем и брать «первую сверху», потому что разобрать
 * остальные не вышло. При этом копия, снятая час назад, и копия, снятая месяц
 * назад, выглядели одинаково.
 *
 * Правила:
 *
 *  1. **выбор — временем.** «сегодня, 14:30», «вчера, 09:12», «20 ноября 2026,
 *     14:30» — то, по чему человек узнаёт момент;
 *  2. **возраст словами.** «час назад», «3 дня назад» — рядом с датой, потому что
 *     «когда это было» человек оценивает возрастом, а не календарём;
 *  3. **не понять — сказать.** Имя, которого мы не писали, не расшифровывается
 *     догадкой: «когда снята — не понять по имени», и такая копия всё равно
 *     видна, но не притворяется понятной;
 *  4. **ниезвестная дата не «свежая».** Сортировать по угаданному времени значило
 *     бы однажды предложить «самую свежую» копию, которая на самом деле старая;
 *  5. **старое называется старым.** Копия старше недели помечена: вернуть недельной
 *     давности память — законный выбор, но не «просто откат на шаг назад».
 *
 * Ни `Date.now()` внутри, ни `Intl` не обязательны: «сейчас» передаётся снаружи,
 * поэтому правило проверяется без часов и без часового пояса машины.
 */

/** Что известно о копии для выбора. */
export interface Point {
  /** Имя файла — то, что уйдёт обратно в ядро. */
  file: string;
  /** Когда снята, мс UTC. `null` — по имени не понять. */
  at: number | null;
}

/** Разобранное имя копии. */
export interface Parsed {
  at: number | null;
  /** Что сказать, если время не понять. */
  why: string;
}

const NAME = /^memory-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-v(\d+)\.db$/;

/**
 * Разобрать имя копии: `memory-20261120-143000-v1.db` → момент в UTC.
 *
 * Имя пишет ядро (`backup::name`), и формат там фиксированный **ровно** для
 * такого разбора. Всё, что не совпало, — не «примерно та же копия», а чужая
 * строка: такую не расшифровываем.
 */
export function parse(file: string): Parsed {
  const match = NAME.exec(file.trim());
  if (!match) {
    return { at: null, why: "когда снята — не понять по имени" };
  }
  const [, year, month, day, hour, minute, second] = match;
  const parts = [year, month, day, hour, minute, second].map((part) => Number(part));
  const [y, mo, d, h, mi, s] = parts as [number, number, number, number, number, number];
  // Числа проверяем сами: `20261350` — это не «тринадцатый месяц».
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) {
    return { at: null, why: "дата в имени невозможна — копия не наша" };
  }
  const at = Date.UTC(y, mo - 1, d, h, mi, s);
  // `Date.UTC` мягко переносит 31 февраля в март; сверяем, что день остался тем же.
  const check = new Date(at);
  if (check.getUTCDate() !== d || check.getUTCMonth() !== mo - 1) {
    return { at: null, why: "дата в имени невозможна — копия не наша" };
  }
  return { at, why: "" };
}

/** Список точек из имён копий. */
export function points(files: readonly string[]): Point[] {
  return files.map((file) => ({ file, at: parse(file).at }));
}

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function two(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Когда снята копия — по местному времени машины.
 *
 * Копия названа в UTC (иначе летнее время делало бы имена неоднозначными), а
 * человек живёт по местному. Поэтому время переводится, а не показывается как
 * есть: «14:30 UTC» человек прочитал бы как 14:30 у себя и ошибся на часы.
 */
export function when(point: Point, now: number, offsetMs = -new Date(now).getTimezoneOffset() * 60_000): string {
  if (point.at === null) return parse(point.file).why;
  const local = new Date(point.at + offsetMs);
  const today = new Date(now + offsetMs);
  const sameDay =
    local.getUTCFullYear() === today.getUTCFullYear() &&
    local.getUTCMonth() === today.getUTCMonth() &&
    local.getUTCDate() === today.getUTCDate();
  const time = `${two(local.getUTCHours())}:${two(local.getUTCMinutes())}`;
  if (sameDay) return `сегодня, ${time}`;

  const yesterday = new Date(now + offsetMs - 24 * 60 * 60 * 1000);
  const wasYesterday =
    local.getUTCFullYear() === yesterday.getUTCFullYear() &&
    local.getUTCMonth() === yesterday.getUTCMonth() &&
    local.getUTCDate() === yesterday.getUTCDate();
  if (wasYesterday) return `вчера, ${time}`;

  const month = MONTHS[local.getUTCMonth()] ?? "";
  const year = local.getUTCFullYear();
  const thisYear = today.getUTCFullYear();
  // Год называем, только если он не тот: «20 ноября, 14:30» и так понятно.
  return year === thisYear
    ? `${local.getUTCDate()} ${month}, ${time}`
    : `${local.getUTCDate()} ${month} ${year}, ${time}`;
}

/**
 * Возраст словами: «час назад», «3 дня назад».
 *
 * Нужен рядом с датой: человек, выбирающий точку в беде, спрашивает «насколько
 * это откатит меня назад», а не «какое было число».
 */
export function age(point: Point, now: number): string {
  if (point.at === null) return "возраст неизвестен";
  const ms = now - point.at;
  if (ms < 0) {
    // Копия из будущего — это не «свежая», это часы машины разошлись.
    return "снята позже, чем сейчас на часах, — часы машины разошлись";
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} ${plural(minutes, "минуту", "минуты", "минут")} назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${plural(hours, "час", "часа", "часов")} назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 30) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${plural(months, "месяц", "месяца", "месяцев")} назад`;
  const years = Math.floor(days / 365);
  return `${years} ${plural(years, "год", "года", "лет")} назад`;
}

function plural(count: number, one: string, few: string, many: string): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/**
 * Подпись копии в списке: время, возраст и, если надо, предупреждение.
 *
 * Старое называется старым: вернуть память недельной давности — законный выбор,
 * но человек должен знать, что откатывается на неделю, а не на шаг.
 */
export const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function label(point: Point, now: number): string {
  const when_ = when(point, now);
  const age_ = age(point, now);
  if (point.at === null) return `${when_} · ${age_}`;
  const stale = now - point.at > STALE_MS;
  return `${when_} · ${age_}${stale ? " · старое: вернёт память на момент копии, а не последние правки" : ""}`;
}

/**
 * Какая копия предлагается первой.
 *
 * Свежая годная — по времени из имени, а не по порядку в папке: экран не должен
 * зависеть от того, как файловая система перечислила файлы. Копия с непонятным
 * временем первой не предлагается: «самая свежая» из угаданного — не свежая.
 */
export function firstUsable(points_: readonly Point[], usable: (file: string) => boolean): Point | null {
  let best: Point | null = null;
  for (const point of points_) {
    if (!usable(point.file) || point.at === null) continue;
    if (best === null || (best.at ?? 0) < point.at) best = point;
  }
  if (best !== null) return best;
  // Понятного времени нет ни у кого — берём первую годную, но это не «свежая».
  return points_.find((point) => usable(point.file)) ?? null;
}

/** Сколько копий вообще годится: «из 5 копий годны 2». */
export function countUsable(points_: readonly Point[], usable: (file: string) => boolean): string {
  const total = points_.length;
  const good = points_.filter((point) => usable(point.file)).length;
  if (total === 0) return "копий нет";
  if (good === total) return `копий: ${total}, все годны`;
  return `копий: ${total}, годны ${good}`;
}
