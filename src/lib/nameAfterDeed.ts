/**
 * Шаг 371: дело можно назвать своими словами после завершения — поиск по смыслу.
 *
 * Человек ищет в истории **как он думает**, а не как программа назвала дело.
 * Выполнилось «Уборка: удаление старых файлов из загрузок», а помнит он
 * «почистил комп». Без своего названия поиск работает только по словам
 * программы, то есть только если помнишь её формулировку.
 *
 * Правила:
 *
 *  * **имя добавляется к делу, а не заменяет его**: отчёт всё равно должен
 *    называть то, что произошло (шаг 370);
 *  * **поиск идёт по обоим**: по своему имени и по тому, что было;
 *  * **имя не меняет прошлое**: это метка, а не «переименовать шаги».
 */

/** Дело с именем человека. */
export interface Deed {
  readonly id: string;
  /** Как назвала программа. */
  readonly title: string;
  /** Что было сделано — для поиска по смыслу. */
  readonly summary: string;
  /** Как назвал человек; пусто — не называл. */
  readonly mine: string;
}

/**
 * Дать имя.
 *
 * Пустое имя — это «снять имя», а не ошибка: человек передумал.
 */
export function rename(deed: Deed, mine: string): { deed: Deed; said: string } {
  const clean = mine.trim();
  if (clean === "") {
    return { deed: { ...deed, mine: "" }, said: `«${deed.title}» снова называется как есть` };
  }
  return { deed: { ...deed, mine: clean }, said: `дело теперь называется «${clean}»; в отчёте останется и то, что было сделано` };
}

/**
 * Найти дела по словам человека.
 *
 * Ищем по своему имени, по названию программы и по сводке. Совпадение по своему
 * имени — сильнее: если человек назвал дело, он ищет именно этим словом.
 */
export function find(deeds: readonly Deed[], query: string): Deed[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  const scored = deeds
    .map((deed) => {
      const mine = deed.mine.toLowerCase();
      const title = deed.title.toLowerCase();
      const summary = deed.summary.toLowerCase();
      let score = 0;
      if (mine.includes(needle)) score += 3;
      if (title.includes(needle)) score += 2;
      if (summary.includes(needle)) score += 1;
      return { deed, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.deed);
}

/**
 * Как дело подписано в списке.
 *
 * Своё имя первым, но программа не прячет, что было сделано: «почистил комп
 * (уборка загрузок)».
 */
export function label(deed: Deed): string {
  return deed.mine === "" ? deed.title : `${deed.mine} (${deed.title})`;
}

/**
 * Что имя не меняет.
 *
 * Список — ответ на «а можно ли переименовать, чтобы отчёт выглядел лучше»: нет,
 * отчёт про произошедшее.
 */
export function keeps(): string[] {
  return [
    "отчёт показывает, что было сделано, а не только имя",
    "шаги дела не переименовываются: имя — метка поверх",
    "поиск работает и по старому названию: человек может помнить его",
  ];
}

/**
 * Что делать, если имя уже занято.
 *
 * Не «такое имя уже есть, попробуйте другое»: имена нужны для поиска, а не для
 * уникальности. Два дела «почистил комп» — нормально.
 */
export function duplicate(name: string): string {
  return `«${name}» уже есть у другого дела — это нормально: имена для поиска, а не для порядка`;
}
