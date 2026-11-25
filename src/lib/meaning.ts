/**
 * Шаг 275: память ищется по-русски и по смыслу, а не по точным словам.
 *
 * `recall` (шаг 268) научился сводить окончания и не путать путь со словом. Но
 * он всё ещё ищет **точные слова**, а человек их не помнит:
 *
 *  * **синоним.** В памяти «папка D:\\Отчёты», человек спрашивает «директория с
 *    отчётами». Слова разные, вещь одна;
 *  * **опечатка.** «Отчоты», «переименуй фтоо» — человек не проверяет набор, и
 *    поиск, который этого не прощает, отвечает «ничего не нашлось» на верный
 *    вопрос;
 *  * **раскладка.** «Gfgrf» — это «Папка», набранная, когда клавиатура осталась
 *    в латинице. Для русскоязычного это самая частая «ошибка», и она не имеет
 *    отношения к тому, что человек ищет;
 *  * **слово действия вместо предмета.** «Куда я сохранял отчёты» — вопрос про
 *    папку, а слова «сохранял» в памяти нет вовсе.
 *
 * Правило: **искать смысл, но не додумывать**. Синоним и опечатка расширяют
 * поиск; догадка о том, что человек «наверное, имел в виду», — нет. Поэтому у
 * всего найденного сказано, **почему** оно нашлось, и найденное по синониму
 * отличается от найденного буквально.
 */

import { normalize, stem } from "./recall";
import type { Fact } from "./memoryView";

/** Понятие, у которого много имён. */
export type Concept = "folder" | "program" | "voice" | "volume" | "method";

/**
 * Слова, которые человек говорит про одно и то же.
 *
 * Не тезаурус: только то, что действительно встретится в разговоре об этих
 * пяти вещах. Длинный список синонимов — это не «умнее», а больше шансов
 * склеить разное.
 */
const SYNONYMS: Readonly<Record<Concept, readonly string[]>> = {
  folder: ["папка", "папку", "папки", "директория", "директорию", "каталог", "каталог", "путь", "хранилище", "место"],
  program: ["программа", "программу", "приложение", "приложению", "софт", "редактор", "браузер"],
  voice: ["голос", "голосом", "озвучка", "озвучку", "диктор", "диктора", "речь"],
  volume: ["громкость", "громче", "тише", "звук", "звука"],
  method: ["способ", "способом", "действие", "сценарий", "как я обычно"],
};

/**
 * Слова-действия, которые в вопросе есть, а в памяти их нет.
 *
 * «Куда я сохранял отчёты» — вопрос про папку. Если считать «сохранял»
 * обязательным словом, верный вопрос получит «ничего не нашлось», и это будет
 * ошибка поиска, а не памяти.
 */
const ACTIONS: ReadonlySet<string> = new Set([
  "сохранял", "сохранил", "сохраняю", "открывал", "открыл", "записывал", "скидывал",
  "куда", "где", "какой", "какая", "каком", "что", "чем", "который",
  "делал", "использовал", "выбирал", "ставил", "переименовывал",
]);

/** Понятие, к которому относится слово; `null` — обычное слово. */
export function conceptOf(word: string): Concept | null {
  const clean = normalize(word);
  for (const [concept, words] of Object.entries(SYNONYMS) as [Concept, readonly string[]][]) {
    if (words.some((candidate) => normalize(candidate) === clean || stem(candidate) === stem(clean))) {
      return concept;
    }
  }
  return null;
}

/**
 * Раскладка: латиница, набранная на русской клавиатуре.
 *
 * Для русскоязычного это самая частая «ошибка ввода», и она ничего не говорит о
 * том, что человек ищет. Обратное направление (кириллица вместо латиницы) здесь
 * не нужно: искать по-английски в русской памяти нечего.
 */
const LAYOUT: Readonly<Record<string, string>> = {
  q: "й", w: "ц", e: "у", r: "к", t: "е", y: "н", u: "г", i: "ш", o: "щ", p: "з",
  "[": "х", "]": "ъ", a: "ф", s: "ы", d: "в", f: "а", g: "п", h: "р", j: "о", k: "л",
  l: "д", ";": "ж", "'": "э", z: "я", x: "ч", c: "с", v: "м", b: "и", n: "т", m: "ь",
  ",": "б", ".": "ю",
};

/** Перевести набранное в русской раскладке в кириллицу. Латиница и цифры не меняются. */
export function layout(text: string): string {
  let out = "";
  for (const char of text.toLowerCase()) {
    out += LAYOUT[char] ?? char;
  }
  return out;
}

/**
 * Расстояние по числу правок — с ограничением.
 *
 * Считается «сколько букв вставить, убрать или заменить», и считается только до
 * порога: длинные слова, отличающиеся на середину, — разные слова, и тратить на
 * них время незачем.
 */
export function distance(left: string, right: string, limit = 2): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  // Расстояние Дамерау — Левенштейна: перестановка соседних букв считается
  // **одной** правкой. «Фтоо» и «фото» — это не две ошибки, а перепутанные
  // пальцы, и человек, набравший их, искал именно фото.
  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (twoBack[j - 2] ?? 0) + 1);
      }
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    // Строка целиком выше порога — дальше расстояние только вырастет.
    if (rowMin > limit) return limit + 1;
    twoBack = previous;
    previous = current;
  }
  return previous[b.length] ?? limit + 1;
}

/**
 * Порог опечатки зависит от длины.
 *
 * Одна правка в коротком слове — уже другое слово («дом»/«дым»); две в длинном —
 * почти наверняка опечатка. Поэтому порог растёт с длиной: 1 для слов до шести
 * букв, 2 для длинных.
 */
export function near(left: string, right: string): boolean {
  const a = stem(left);
  const b = stem(right);
  if (a === b) return true;
  // Короткие слова почти не прощаются: в «доме» одна буква — это «дым», другое
  // слово. Но и совсем без права на ошибку нельзя: «фтоо» и «фото» — четыре
  // буквы, и человек опечатался, а не искал другое.
  const shortest = Math.min(a.length, b.length);
  if (shortest <= 3) return false;
  const limit = shortest <= 6 ? 1 : 2;
  return distance(a, b, limit + 1) <= limit;
}

/**
 * Точная опечатка в одном слове — не то же, что соседнее слово.
 *
 * `near` выше — про «слово могло быть набрано с ошибкой». Это — про то, стоит
 * ли показать подсказку «может быть»: там допустимо больше, потому что человек
 * уже ничего не нашёл.
 */

/** Что человек ищет, разобранное по смыслу. */
export interface Wanted {
  /** Слова, которые обязательны. */
  readonly words: readonly string[];
  /** Понятия: «папка», «голос» — то, что можно назвать по-разному. */
  readonly concepts: readonly Concept[];
  /** Как человек это сказал — для ответа. */
  readonly said: string;
}

/** Разобрать вопрос так же, как его понял бы человек, а не поиск по строкам. */
export function wants(query: string): Wanted {
  const said = query.trim();
  // Если в строке есть латиница и нет кириллицы — почти наверняка раскладка.
  const shifted = /[a-z]/.test(said) && !/[а-яё]/.test(said) ? layout(said) : said;
  const words = normalize(shifted)
    .split(/[^a-zа-я0-9]+/)
    .filter((word) => word.length > 1 || /^\d$/.test(word))
    .filter((word) => !ACTIONS.has(word));

  const concepts: Concept[] = [];
  const plain: string[] = [];
  for (const word of words) {
    const concept = conceptOf(word);
    if (concept !== null) {
      if (!concepts.includes(concept)) concepts.push(concept);
      // Слово-понятие уходит из обязательных: «директория» — это вопрос о виде
      // («это папка?»), а не слово, которое должно стоять в подписи. Оставить
      // его в двух местах значит требовать и то, и другое сразу.
      continue;
    }
    plain.push(word);
  }
  return { words: plain, concepts, said };
}

/** Одно найденное — с причиной, по которой оно здесь. */
export interface Hit {
  readonly fact: Fact;
  /** `exact` — слово нашлось как есть; `concept` — по синониму; `typo` — по опечатке. */
  readonly how: "exact" | "concept" | "typo";
  /** Словами: почему это то. */
  readonly because: string;
}

/** Итог поиска. */
export interface Found {
  readonly hits: readonly Hit[];
  readonly said: string;
  /** Близкое слово, которое всё-таки есть в памяти, — когда ничего не нашлось. */
  readonly meant?: string;
}

/**
 * Найти по смыслу.
 *
 * Порядок причин не случаен: точное совпадение важнее синонима, синоним важнее
 * опечатки. Человек, который написал ровно то, что в памяти, должен увидеть это
 * первым — иначе поиск «угадывает» поверх верного ответа.
 */
export function search(facts: readonly Fact[], query: string): Found {
  const wanted = wants(query);
  if (facts.length === 0) return { hits: [], said: "память пуста — искать нечего" };
  // Понятие — тоже вопрос: «директория» без единого обычного слова спрашивает
  // «какие у меня папки», и считать это пустым запросом значит отвечать
  // «скажите, что искать» на заданный вопрос.
  if (wanted.words.length === 0 && wanted.concepts.length === 0) {
    return { hits: [], said: "скажите, что искать, — например «папка» или «голос»" };
  }

  const hits: Hit[] = [];
  for (const fact of facts) {
    const got = rate(fact, wanted);
    if (got !== null) hits.push(got);
  }

  const order = { exact: 0, concept: 1, typo: 2 } as const;
  hits.sort((a, b) => order[a.how] - order[b.how] || a.fact.label.localeCompare(b.fact.label, "ru"));

  if (hits.length === 0) {
    // Не «ничего не нашлось», а «возможно, вы имели в виду»: пустой ответ без
    // подсказки заставляет человека гадать, есть ли это в памяти вообще.
    const meant = closest(facts, wanted.words);
    return {
      hits: [],
      said:
        meant === undefined
          ? `по запросу «${wanted.said}» ничего не нашлось — попробуйте одно слово`
          : `по запросу «${wanted.said}» ничего не нашлось — может быть, «${meant}»?`,
      meant,
    };
  }

  return { hits, said: `нашлось ${hits.length} ${plural(hits.length, "факт", "факта", "фактов")} по запросу «${wanted.said}»` };
}

/**
 * Насколько факт отвечает вопросу.
 *
 * Обязательные слова проверяются **все**: если человек написал «папка отчёты», а
 * нашлась только папка, это не ответ на вопрос. Понятия считаются отдельно, так
 * как у них много имён.
 */
function rate(fact: Fact, wanted: Wanted): Hit | null {
  const hay = haystack(fact);
  // Вид факта — это уже понятие, а не слово, которое надо переводить: `folder`
  // и есть «папка». Переводить его обратно через `conceptOf` значило бы гадать,
  // в какой синоним попадёт первое совпадение: `kindWord("folder")` = «папка», и
  // она же есть в словаре — но для программы это давало `program` только
  // случайно.
  const factConcept: Concept | null = fact.kind === "method" ? "method" : (fact.kind as Concept);

  // Считаем не «как нашли в этот раз», а **лучшую** причину: точное слово,
  // затем понятие, затем опечатка. Причина не зависит от того, в каком порядке
  // шла проверка, — иначе один и тот же факт назывался бы по-разному в
  // зависимости от того, что ещё было в вопросе.
  const reasons: string[] = [];
  let sawWord = false;
  let sawTypo = false;

  for (const word of wanted.words) {
    // Существительное-понятие («папка», «директория») — это вопрос о **виде**, а
    // не о слове в подписи: иначе «директория» не нашла бы ни одной папки.
    if (conceptOf(word) !== null) continue;

    if (hay.some((candidate) => candidate === stem(word) || candidate.startsWith(stem(word)))) {
      // Слово нашлось буквально — это точнее, чем «это папка». Факт, найденный
      // и словом, и понятием, обязан называться точным: иначе в списке он
      // встанет ниже догадок, хотя человек написал ровно его.
      sawWord = true;
      continue;
    }
    if (hay.some((candidate) => near(word, candidate))) {
      sawTypo = true;
      reasons.push(`похоже на «${word}»`);
      continue;
    }
    return null;
  }

  for (const concept of wanted.concepts) {
    // Понятие спрашивается о виде факта. «Место» и «путь» — о папке, но не о
    // голосе; поэтому проверяем, к какому виду относится сам факт.
    if (factConcept !== concept) return null;
    // Для способа причина — «это способ»; для остальных — «это папка» и т. д.
    reasons.push(concept === "method" ? "это способ" : `это ${kindWord(concept)}`);
  }

  // Лучшая причина: точное слово, затем опечатка (слово почти то же), затем
  // понятие (совпал только вид). Опечатка выше понятия не по «силе», а по
  // точности: «Отчоты» — это та же папка с ошибкой в одной букве, а не просто
  // «какая-то папка».
  //
  // Понятие **не** даёт точного совпадения, даже если стоит в подписи: слово
  // «папка» есть в подписи каждой папки, и считать это находкой значит
  // объявлять точным всё, что и так одного вида.
  const how: "exact" | "concept" | "typo" = sawWord ? "exact" : sawTypo ? "typo" : "concept";

  return {
    fact,
    how,
    because: reasons.length === 0 ? "совпало слово" : reasons.join(", "),
  };
}

function haystack(fact: Fact): string[] {
  const parts = [fact.label, fact.why, fact.label.replace(/[\\/]+/g, " "), fact.id.slice(fact.id.indexOf(":") + 1)];
  return parts
    .flatMap((part) => normalize(part).split(" "))
    .filter((word) => word.length > 1)
    .map(stem);
}

function kindWord(kind: Fact["kind"]): string {
  if (kind === "folder") return "папка";
  if (kind === "program") return "программа";
  if (kind === "voice") return "голос";
  if (kind === "volume") return "громкость";
  return "способ";
}

/** Ближайшее слово из памяти — для «может быть, вы имели в виду». */
function closest(facts: readonly Fact[], words: readonly string[]): string | undefined {
  let best: { word: string; score: number } | null = null;
  for (const fact of facts) {
    for (const candidate of normalize(fact.label).split(" ")) {
      if (candidate.length <= 2) continue;
      for (const word of words) {
        const score = distance(word, candidate, 3);
        if (score <= 3 && (best === null || score < best.score)) best = { word: candidate, score };
      }
    }
  }
  return best?.word;
}

function plural(n: number, one: string, few: string, many: string): string {
  const ten = n % 100;
  if (ten >= 11 && ten <= 14) return many;
  const unit = n % 10;
  if (unit === 1) return one;
  if (unit >= 2 && unit <= 4) return few;
  return many;
}
