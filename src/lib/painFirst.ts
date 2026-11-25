/**
 * Шаг 296: проверить, что каждая заимствованная идея закрывает названную боль.
 *
 * Идея без боли — украшение. Это не фигура речи: украшение **выглядит** как
 * работа (в таблице строка, в интерфейсе кнопка), но ничего не решает, и при
 * этом занимает место и внимание.
 *
 * Проверка устроена так, чтобы её нельзя было пройти формально:
 *
 *  1. боль формулируется **от пользователя**, а не от нас: «я забываю, куда
 *     положил файл», а не «у нас нет поиска по документам»;
 *  2. идея ссылается на **конкретную** боль по номеру;
 *  3. если боль сформулирована нашим языком — это не проверено.
 *
 * Последний пункт — главный: «нет функции X» всегда «закрывается» идеей X, и
 * так таблица заполняется сама собой.
 */

/** Боль пользователя. */
export interface Pain {
  readonly id: string;
  /** Как её говорит человек. */
  readonly said: string;
  /** Сколько людей её назвали — считать не обязательно, но полезно. */
  readonly people: number;
}

/** Идея, взятая под боль. */
export interface Idea {
  readonly what: string;
  /** Номер боли, которую закрывает. */
  readonly pain: string;
  /** Что человек сможет сделать, чего не мог. */
  readonly then: string;
}

/** Слова, которыми боль формулируют от себя, а не от пользователя. */
// `\b` с кириллицей не работает — границу задаём явно.
const OUR_WORDS = /^(нет|отсутствует|не реализован|нужен|требуется)(?:\s|$|[.,:;!?])/i;

/** Названа ли боль словами пользователя. */
export function isUserWords(pain: Pain): boolean {
  return !OUR_WORDS.test(pain.said.trim());
}

/**
 * Проверка одной идеи.
 *
 * Возвращает не «плохо/хорошо», а что именно не сходится: нет боли, боль не
 * названа словами человека, или «тогда» — это описание функции.
 */
export function check(idea: Idea, pains: readonly Pain[]): { ok: boolean; why: string } {
  const pain = pains.find((item) => item.id === idea.pain);

  if (!pain) return { ok: false, why: `идея «${idea.what}» ссылается на боль ${idea.pain}, которой нет в списке` };
  if (!isUserWords(pain)) {
    return { ok: false, why: `боль «${pain.said}» названа нашим языком — так любая идея «закрывает» сама себя` };
  }
  if (pain.people <= 0) return { ok: false, why: `боль «${pain.said}» никто не называл — это догадка` };
  if (/^(кнопк|поле|функци|экран|раздел)/i.test(idea.then.trim())) {
    return { ok: false, why: `«тогда» описывает элемент интерфейса, а не что человек смог сделать` };
  }
  if (idea.then.trim().length < 15) return { ok: false, why: "«тогда» слишком короткое, чтобы отличить починку от украшения" };

  return { ok: true, why: `${pain.said} → ${idea.then}` };
}

/** Итог по всей таблице. */
export function audit(ideas: readonly Idea[], pains: readonly Pain[]): { ok: boolean; said: string; unused: string[] } {
  const problems: string[] = [];
  for (const idea of ideas) {
    const verdict = check(idea, pains);
    if (!verdict.ok) problems.push(verdict.why);
  }

  // Боль без идеи — не ошибка, а вопрос: её чинят другими средствами?
  const touched = new Set(ideas.map((idea) => idea.pain));
  const unused = pains.filter((pain) => !touched.has(pain.id)).map((pain) => pain.said);

  return {
    ok: problems.length === 0,
    said:
      problems.length === 0
        ? `идей ${ideas.length}, все закрывают названную боль`
        : `украшений ${problems.length} из ${ideas.length}: ${problems.join("; ")}`,
    unused,
  };
}

/**
 * Идея, у которой боль пропала.
 *
 * Боль бывает закрыта другим способом — тогда идею надо убрать, а не держать
 * «на всякий случай». Украшение не становится полезным от того, что оно старое.
 */
export function stillNeeded(idea: Idea, pains: readonly Pain[]): boolean {
  return pains.some((pain) => pain.id === idea.pain);
}
