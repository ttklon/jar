/**
 * Шаг 300: пересматривать таблицу раз в квартал — мир меняется.
 *
 * Таблица заимствований, сравнение с конкурентами и список «почему не берём»
 * верны на день, когда их написали. Через полгода «у них этого нет» перестаёт
 * быть правдой, а «нам это не нужно» — тоже: у людей меняются задачи, а у
 * конкурентов появляются функции.
 *
 * Поэтому пересмотр — не «когда будет время», а **по календарю**. Здесь только
 * счёт дат, без напоминаний ОС: важно, чтобы вопрос «не устарело ли» задавался
 * сам, а не держался на памяти одного человека.
 *
 * Квартал — это не 90 дней: кварталы кончаются 31 марта, 30 июня, 30 сентября и
 * 31 декабря, и «через 90 дней» от 15 февраля — это 16 мая, то есть уже
 * следующий квартал. Поэтому дата считается по календарю.
 */

/** Дата пересмотра — начало следующего квартала. */
export function nextReview(at: number): number {
  const date = new Date(at);
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  // 0..11 → конец текущего квартала: 3, 6, 9, 12 месяцев.
  const endMonth = Math.floor(month / 3) * 3 + 3;
  return Date.UTC(year, endMonth, 1);
}

/** Пора ли пересматривать. */
export function due(at: number, today: number): boolean {
  return nextReview(at) <= today;
}

/**
 * Что пересматриваем и зачем — списком, а не «всё».
 *
 * У каждого пункта своя причина, по которой он портится быстрее других.
 */
export interface Subject {
  readonly what: string;
  /** Почему именно это устаревает. */
  readonly rots: string;
}

export const SUBJECTS: readonly Subject[] = [
  { what: "таблица заимствований", rots: "конкуренты выпускают то, чего у них не было" },
  { what: "сравнение по пяти пунктам", rots: "оценки снимались вручную в прошлом квартале" },
  { what: "список «почему не берём»", rots: "цена (зависимости, вес) меняется вместе с версиями" },
  { what: "лицензии взятых компонентов", rots: "автор может сменить лицензию при обновлении" },
];

/**
 * План пересмотра на дату.
 *
 * Не «пора/не пора», а список с причиной у каждого: человеку надо знать, что
 * именно проверить, иначе пересмотр превращается в чтение таблицы.
 */
export function plan(today: number): { when: number; items: string[] } {
  const when = nextReview(today);
  return {
    when,
    items: SUBJECTS.map((subject) => `${subject.what} — ${subject.rots}`),
  };
}

/**
 * Отметка «пересмотрено».
 *
 * Отдельно от даты создания: если хранить только одну, непонятно, устарела запись
 * или её просто не трогали.
 */
export interface Reviewed {
  readonly what: string;
  readonly at: number;
  /** Что изменилось — «ничего» тоже ответ, и он важен. */
  readonly changed: string;
}

export function mark(rows: readonly Reviewed[], at: number): { said: string; unchanged: string[] } {
  const unchanged = rows.filter((row) => row.changed.trim().toLowerCase() === "ничего").map((row) => row.what);
  const changed = rows.length - unchanged.length;
  const when = new Date(at).toISOString().slice(0, 10);
  return {
    said: `пересмотрено ${when}: изменилось ${changed} из ${rows.length}, без изменений ${unchanged.length}`,
    unchanged,
  };
}

/**
 * Просрочка в днях — чтобы «пора» стало срочностью.
 *
 * Ноль, если не просрочено: отрицательные числа в отчётах читаются как ошибка.
 */
export function overdueDays(at: number, today: number): number {
  const when = nextReview(at);
  if (when > today) return 0;
  return Math.round((today - when) / 86_400_000);
}
