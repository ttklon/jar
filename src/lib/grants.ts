/**
 * Согласие на микрофон, сеть и файлы — отдельно, с датой, отзывается (шаги 168–169).
 *
 * Дефект. Согласия были «по факту пользования»: приложение брало микрофон, потому
 * что он есть; ходило в сеть, потому что нажали «скачать»; читало файлы, потому
 * что путь разрешён. Формально это не согласие — это отсутствие отказа.
 *
 * Правила:
 *
 *  1. **три канала — три согласия.** «Разрешил микрофон» не разрешает ни сеть, ни
 *     файлы: согласие, выданное на одно, — не разрешение на всё;
 *  2. **по умолчанию — нет.** Отсутствие записи значит «не разрешено», а не
 *     «разрешено втихую»: согласие по умолчанию — не согласие;
 *  3. **у согласия есть дата.** «Разрешено вообще» и «разрешено 2026-11-20» —
 *     разные вещи: второе можно переспросить через год, первое нельзя;
 *  4. **отзыв немедленный.** Отзыв не «вступит в силу после перезапуска»: канал
 *     закрывается сразу, иначе это формальность;
 *  5. **страрое согласие называется старым.** Согласие годовой давности — повод
 *     переспросить, а не то же самое, что вчерашнее;
 *  6. **отзыв виден.** «Отозвано 2026-11-20» остаётся в записи: иначе человек не
 *     может проверить, что отзыв сработал.
 *
 * Модуль не держит React и не знает про `localStorage`: хранилище передаётся
 * снаружи, поэтому правило проверяется без браузера.
 */

/** Что человек разрешает. */
export type Channel = "mic" | "net" | "files";

/** Все каналы — списком, чтобы «все согласия» не собирались по памяти. */
export const CHANNELS: readonly Channel[] = ["mic", "net", "files"];

/** Словарь каналов для экрана. */
export const TITLES: Readonly<Record<Channel, string>> = {
  mic: "микрофон",
  net: "сеть",
  files: "файлы",
};

/** Что значит отзыв для канала — словами, а не «запрещено». */
export const STOP_WORDS: Readonly<Record<Channel, string>> = {
  mic: "микрофон выключается сразу: слушать больше нечем",
  net: "сеть закрывается сразу: скачивание обрывается",
  files: "доступ к папкам закрывается сразу: шаг не начнётся",
};

/** Запись одного согласия. */
export interface Grant {
  channel: Channel;
  /** Когда дали, мс. `null` — не давали. */
  at: number | null;
  /** Когда отозвали. `null` — не отзывали. */
  revokedAt: number | null;
}

/** Хранилище: как `localStorage`, но без глобального объекта. */
export interface Store {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

/** Ключ в хранилище. С версией: формат может измениться. */
export const KEY = "jar.grants.v1";

/** Состояние всех каналов: отсутствие записи — «не разрешено». */
export type Book = Readonly<Record<Channel, Grant>>;

/** Пустая книга: ничего не разрешено. Это **рабочее** состояние, а не ошибка. */
export const EMPTY: Book = {
  mic: { channel: "mic", at: null, revokedAt: null },
  net: { channel: "net", at: null, revokedAt: null },
  files: { channel: "files", at: null, revokedAt: null },
};

/** Разрешён ли канал сейчас. */
export function allows(book: Book, channel: Channel): boolean {
  const grant = book[channel];
  if (grant.at === null) return false;
  // Отзыв закрывает канал — **любой** отзыв, даже если в файле он стоит раньше
  // даты выдачи: так бывает после ручной правки, и трактовать это как «согласие
  // действует» значило бы открыть канал по опечатке в файле.
  if (grant.revokedAt !== null) return false;
  return true;
}

/**
 * Дать согласие.
 *
 * `now` передаётся снаружи: дата в правиле должна быть проверяемой, а не
 * «сегодня по часам машины».
 */
export function give(book: Book, channel: Channel, now: number): Book {
  return {
    ...book,
    [channel]: { channel, at: now, revokedAt: null },
  };
}

/**
 * Отозвать согласие.
 *
 * Отзыв не стирает дату выдачи: человек должен видеть, что разрешение было и
 * когда кончилось. Иначе «отозвано» не проверить.
 */
export function revoke(book: Book, channel: Channel, now: number): Book {
  const grant = book[channel];
  return {
    ...book,
    [channel]: { channel, at: grant.at, revokedAt: now },
  };
}

/** Отозвать всё: «не разрешаю ничего» одной кнопкой. */
export function revokeAll(book: Book, now: number): Book {
  return CHANNELS.reduce<Book>((acc, channel) => revoke(acc, channel, now), book);
}

/** Сколько согласий действует: числом, а не «есть разрешения». */
export function count(book: Book): number {
  return CHANNELS.filter((channel) => allows(book, channel)).length;
}

/** Согласие старше этого — повод переспросить. */
export const STALE_MS = 365 * 24 * 60 * 60 * 1000;

export interface Line {
  channel: Channel;
  /** Что сказать: «микрофон: разрешён 2026-11-20» или «не разрешён». */
  said: string;
  /** Действует ли. */
  active: boolean;
  /** Пора переспросить. */
  stale: boolean;
}

/**
 * Одна строка на канал: состояние, дата, и не устарело ли.
 *
 * «Разрешено» без даты — не ответ: человек, разбирающийся, кто и когда дал
 * согласие, должен видеть число.
 */
export function book(book_: Book, now: number): Line[] {
  return CHANNELS.map((channel) => {
    const grant = book_[channel];
    const active = allows(book_, channel);
    const date = (ms: number | null) => (ms === null ? "" : new Date(ms).toISOString().slice(0, 10));
    if (!active) {
      if (grant.revokedAt !== null) {
        return {
          channel,
          said:
            grant.at === null
              ? `${TITLES[channel]}: не разрешён (отзыв ${date(grant.revokedAt)})`
              : `${TITLES[channel]}: отозван ${date(grant.revokedAt)} — до этого был разрешён ${date(grant.at)}`,
          active: false,
          stale: false,
        };
      }
      return { channel, said: `${TITLES[channel]}: не разрешён — согласия не давали`, active: false, stale: false };
    }
    const age = now - (grant.at ?? now);
    const stale = age > STALE_MS;
    const base = `${TITLES[channel]}: разрешён ${date(grant.at)}`;
    return {
      channel,
      said: stale ? `${base} — больше года назад: переспрошу, прежде чем пользоваться` : base,
      active: true,
      stale,
    };
  });
}

/**
 * Можно ли пользоваться каналом прямо сейчас.
 *
 * Отдельно от `allows`: действующее, но устаревшее согласие не даёт работать
 * молча — его надо переспросить. Это и есть разница между «разрешено» и
 * «разрешено давно».
 */
export function may(book_: Book, channel: Channel, now: number): { ok: boolean; said: string } {
  if (!allows(book_, channel)) {
    return { ok: false, said: `${TITLES[channel]}: нужно согласие — без него канал закрыт` };
  }
  const grant = book_[channel];
  if (grant.at !== null && now - grant.at > STALE_MS) {
    return {
      ok: false,
      said: `${TITLES[channel]}: согласие старше года — переспрошу, прежде чем пользоваться`,
    };
  }
  return { ok: true, said: "" };
}

/** Записать книгу. Битое хранилище не роняет приложение: книга живёт в памяти. */
export function save(store: Store, book_: Book): void {
  try {
    store.setItem(KEY, JSON.stringify(book_));
  } catch {
    // Место кончилось или хранилище запрещено — состояние остаётся в памяти.
  }
}

/**
 * Прочитать книгу.
 *
 * Битый JSON — это **пустая книга**, а не «всё разрешено»: сбой чтения не может
 * выдавать согласие, которого никто не давал.
 */
export function load(store: Store): Book {
  let raw: string | null = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (!raw) return EMPTY;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (typeof parsed !== "object" || parsed === null) return EMPTY;

  const out: Record<Channel, Grant> = { ...EMPTY };
  for (const channel of CHANNELS) {
    const entry = (parsed as Record<string, unknown>)[channel];
    if (typeof entry !== "object" || entry === null) continue;
    const raw_ = entry as Record<string, unknown>;
    const at = typeof raw_.at === "number" && Number.isFinite(raw_.at) ? raw_.at : null;
    const revokedAt =
      typeof raw_.revokedAt === "number" && Number.isFinite(raw_.revokedAt) ? raw_.revokedAt : null;
    out[channel] = { channel, at, revokedAt };
  }
  return out;
}

/**
 * Что делать при отзыве — немедленно, а не «после перезапуска».
 *
 * Возвращает действия по каналу: закрыть микрофон, оборвать скачивание, снять
 * путь. Это правило, а не UI: экран обязан вызвать его, а не решать сам.
 */
export function onRevoke(channel: Channel): { stop: readonly string[]; said: string } {
  const stop: Record<Channel, string[]> = {
    mic: ["остановить запись", "выключить поток микрофона"],
    net: ["оборвать загрузку", "снять запрос"],
    files: ["снять разрешённые папки", "не начинать шаги с путями"],
  };
  return { stop: stop[channel], said: STOP_WORDS[channel] };
}
