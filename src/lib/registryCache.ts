/**
 * Кэш частых ответов реестра без обращения к модели (шаг 127).
 *
 * Дефект. На вопрос «что ты умеешь» приложение идёт к модели и **ждёт 3 секунды**:
 *
 *  * **ответ известен заранее**: он в реестре (835 действий), модель для него не
 *    нужна — она пересказывает то, что уже есть;
 *  * **железо платит за пересказ**: самая частая фраза — самая дорогая, хотя должна
 *    быть самой дешёвой;
 *  * **ответ «плывёт»**: дважды спросив «что умеешь», человек получает два разных
 *    текста и не понимает, какому верить;
 *  * **кэш не отделим от ответа**: непонятно, что пришло из реестра, а что сочинила
 *    модель, — и ошибку реестра невозможно отличить от галлюцинации.
 *
 * Правило: **частый вопрос отвечается из реестра, и это сказано**.
 *
 *  1. **Только те вопросы, чей ответ есть в реестре**: «что умеешь», «где данные»,
 *     «как дела». Остальное — к модели.
 *  2. **Кэш говорит, откуда ответ**: «из реестра» — не то же, что «подумал».
 *  3. **Данные реестра меняются — кэш сбрасывается**: устаревший ответ хуже медленного.
 *  4. **Промах не выдумывает ответ**: вопрос, которого нет в кэше, идёт к модели, а не
 *     получает «ничего не знаю» от кэша.
 *  5. **Ответ короткий и честный**: «умею то, что в реестре; список в журнале» — не
 *     пересказ всех 835 действий.
 *
 * Почему не «кэшировать всё подряд». Кэш всего — это второй реестр, который
 * расходится с первым; кэш частого — известный набор, который можно проверить.
 */

/** Что спросили. */
export type Ask = "skills" | "data" | "health" | "help" | "other";

/**
 * Разбор частого вопроса.
 *
 * Только известные формы; всё остальное — `other` и идёт к модели. Это защита от того,
 * чтобы кэш «угадывал» смысл.
 */
export function askOf(phrase: string): Ask {
  const text = phrase.toLowerCase().replace(/ё/g, "е").trim();
  if (/(что|что-то)?\s*(ты\s+)?(умеешь|можешь)/.test(text)) return "skills";
  if (/(где|куда)\s+(мои\s+)?(данные|файлы|фото)/.test(text)) return "data";
  if (/(как\s+дела|ты\s+работаешь|ты\s+жив)/.test(text)) return "health";
  if (/(что\s+(ты\s+)?(можешь\s+)?(сказать|ответить)|помощь|справка)/.test(text)) return "help";
  return "other";
}

/** Ответ из реестра. */
export interface Cached {
  /** Что спросили. */
  ask: Ask;
  /** Ответ словами. */
  said: string;
  /** На чём основан: реестр и его версия. */
  source: string;
}

/**
 * Ответы из реестра.
 *
 * `registry` — счётчики и версия; кэш **не** хранит их копию дольше одной версии.
 */
export function fromRegistry(
  registry: { actions: number; hands: number; version: string },
  ask: Ask,
): Cached | null {
  switch (ask) {
    case "skills":
      return {
        ask,
        said: `умею ${registry.actions} действий; часть из них делаю руками (${registry.hands}); полный список — в журнале`,
        source: `реестр ${registry.version}`,
      };
    case "data":
      return {
        ask,
        said: "данные лежат только на этой машине; наружу ничего не уходит",
        source: `реестр ${registry.version}`,
      };
    case "health":
      return {
        ask,
        said: "работаю на этой машине; если что-то долго — скажу числом",
        source: `реестр ${registry.version}`,
      };
    case "help":
      return {
        ask,
        said: "скажите делом: «переименуй фото», «проверь диск»; я покажу план и спрошу согласие",
        source: `реестр ${registry.version}`,
      };
    case "other":
      // Промах не выдумывает ответ: такой вопрос идёт к модели.
      return null;
  }
}

/** Кэш одной версии реестра. */
export interface Cache {
  version: string;
  entries: Map<Ask, Cached>;
  /** Сколько раз ответили без модели — для честного «кэш работает». */
  hits: number;
  /** Сколько раз промахнулись. */
  misses: number;
}

export function cache(version: string): Cache {
  return { version, entries: new Map(), hits: 0, misses: 0 };
}

/** Что ответить — из кэша, иначе промах. */
export interface Answer {
  /** Ответ или `null`, если надо спросить модель. */
  said: string | null;
  /** Откуда: реестр или модель. */
  from: "registry" | "model";
  /** Сказать ли это словами (для журнала и экрана). */
  source: string;
}

/**
 * Ответить на фразу.
 *
 * `registry` передаётся при каждом вызове: **версия реестра решает**, жить ли кэшу.
 * Устаревший ответ хуже медленного.
 */
export function answer(
  store: Cache,
  phrase: string,
  registry: { actions: number; hands: number; version: string },
): Answer {
  if (store.version !== registry.version) {
    // Данные реестра изменились: кэш сбрасывается, а не отдаёт старые числа.
    store.version = registry.version;
    store.entries.clear();
  }
  const ask = askOf(phrase);
  const hit = store.entries.get(ask) ?? fromRegistry(registry, ask);
  if (hit === null) {
    store.misses += 1;
    return { said: null, from: "model", source: "" };
  }
  store.entries.set(ask, hit);
  store.hits += 1;
  return { said: hit.said, from: "registry", source: hit.source };
}

/** Работает ли кэш — числом, а не «в целом да». */
export function report(store: Cache): string {
  const total = store.hits + store.misses;
  if (total === 0) return "кэш ещё не спрашивали";
  return `из реестра: ${store.hits} из ${total}, к модели: ${store.misses}`;
}

/**
 * Что нельзя кэшировать никогда.
 *
 * Ответ, зависящий от момента («сейчас 14:03») или от состояния («идёт работа»),
 * кэшировать нельзя: он станет ложью.
 */
export function cacheable(ask: Ask): boolean {
  return ask === "skills" || ask === "data" || ask === "help";
}
