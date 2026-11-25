/**
 * Шаг 268: поиск по памяти словами человека.
 *
 * Почему нельзя «просто LIKE по базе». В памяти лежит `folder:D:\Отчёты` и
 * `method:переименуй фото`, а человек ищет словами, которыми сам говорил:
 * «отчёты», «переименовать фото», «та папка с отчётами». Три вещи ломают наивный
 * поиск подстрокой:
 *
 *  1. **регистр и окончания.** «Отчёты» в памяти, «отчеты» в вопросе — одно и то
 *     же; «папка с отчётами» тоже про неё. Сравнивать надо основы, а не строки;
 *  2. **пути — не слова.** `D:\Отчёты\2024` человек набирает как «отчёты», а не
 *     как `D:\\Отчёты\\2024`. Обратные слэши, диск и расширения — не то, что он
 *     помнит;
 *  3. **пустой ответ — тоже ответ.** «Ничего не нашлось» должно отличаться от
 *     «память пуста» и от «вопрос пустой»: иначе человек ищет сбой там, где
 *     просто не то слово.
 *
 * И порядок. Найденное сортируется не по алфавиту, а по тому, **насколько это
 * то**: сначала совпало всё, потом часть; при равенстве — то, что свежее.
 */

import type { Fact } from "./memoryView";

/** Что человек спросил, разобранное на слова. */
export interface Query {
  /** Нормальные слова: без регистра, ё→е, без пустых. */
  readonly words: readonly string[];
  /** Исходная строка — её показывают обратно, чтобы человек видел, что искали. */
  readonly said: string;
}

/** Одно найденное: факт и почему он здесь. */
export interface Hit {
  readonly fact: Fact;
  /** Счёт совпадения: больше — ближе. Для порядка, не для показа. */
  readonly score: number;
  /** Что именно совпало — словами человека, а не ключами. */
  readonly because: string;
}

/** Что нашлось и что об этом сказать. */
export interface Result {
  readonly hits: readonly Hit[];
  /** Готовое объяснение: сколько нашлось или почему ничего. */
  readonly said: string;
}

/**
 * Разобрать вопрос.
 *
 * «Папка с отчётами» — это слова `папка`, `с`, `отчётами`. Служебные слова
 * выбрасываются: они есть в любом вопросе и только размывают совпадение.
 */
export function parse(query: string): Query {
  const said = query.trim();
  const words = normalize(said)
    .split(/[^a-zа-я0-9]+/)
    // Одна буква — не слово: из `D:\Фото` приходит `d`, и оно совпало бы с
    // каждой папкой на диске D, то есть со всей памятью сразу.
    .filter((word) => word.length > 1 || /^\d$/.test(word))
    .filter((word) => !STOP.has(word));
  return { words, said };
}

/**
 * Служебные слова.
 *
 * Без них «папка с отчётами» не отличалась бы от «папка с фотографиями»: слово
 * «с» совпало бы в обеих.
 */
const STOP: ReadonlySet<string> = new Set([
  "и", "в", "во", "на", "с", "со", "по", "из", "от", "до", "для", "что", "где",
  "как", "это", "тот", "та", "те", "мой", "моя", "мои", "мне", "я",
]);

/**
 * Привести строку к сравнимому виду.
 *
 * `ё` → `е` (её пишут по-разному в одной и той же памяти), нижний регистр,
 * обратные слэши и прямой слэш — в пробел: `D:\Отчёты` и `D:/Отчёты` — один
 * путь, а диск и расширения человек не помнит.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\\/]+/g, " ")
    .replace(/[.,;:!?"'«»()\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Основа слова — грубо, но честно.
 *
 * Не стеммер: русская морфология в пяти строках не живёт. Но «отчёты»,
 * «отчётами», «отчетов» должны сходиться, и для этого достаточно отрезать
 * окончание. Опасность обратная — склеить «папка» и «папки» (правильно) и
 * «ток» и «токи» (тоже правильно), а вот «дом» и «дома» — тоже правильно.
 */
export function stem(word: string): string {
  const w = word.toLowerCase().replace(/ё/g, "е");
  if (w.length <= 4) return w;
  for (const suffix of ENDINGS) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 4) {
      return w.slice(0, w.length - suffix.length);
    }
  }
  return w;
}

/** Окончания — от длинных к коротким, иначе «ами» съест «и» и останется «ам». */
const ENDINGS: readonly string[] = [
  "ами", "ями", "ов", "ев", "ий", "ый", "ая", "ое", "ые", "ых", "им", "ем",
  "ах", "ях", "ам", "ям", "ой", "ей", "ую", "юю", "ет", "ут", "ют", "ит",
  "ат", "ят", "ли", "ла", "ло", "а", "я", "ы", "и", "у", "ю", "е", "о", "ь",
];

/**
 * Найти в памяти то, о чём спросили.
 *
 * Вопрос сравнивается не с `id` (в нём `folder:` и путь), а с тем, **что
 * человек видит**: подпись, вид и причина. Иначе поиск «отчёты» не нашёл бы
 * папку, у которой в базе `D:\Отчёты\2024`.
 */
export function search(facts: readonly Fact[], query: string): Result {
  const parsed = parse(query);

  if (facts.length === 0) {
    return { hits: [], said: "память пуста — искать нечего" };
  }
  if (parsed.words.length === 0) {
    // Пустой вопрос — не «нашлось всё»: это «вы ничего не спросили».
    return { hits: [], said: "скажите, что искать, — например «отчёты» или «фото»" };
  }

  const stems = parsed.words.map(stem);
  const hits: Hit[] = [];

  for (const fact of facts) {
    const words = wordsOf(fact);
    const matched = stems.filter((wanted) => words.some((word) => same(word, wanted)));
    if (matched.length === 0) continue;

    // Совпало всё — это «то самое»; совпала часть — «похожее».
    const all = matched.length === stems.length;
    hits.push({
      fact,
      score: matched.length * 10 + (all ? 5 : 0),
      because: `совпало: ${matched.join(", ")}`,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.fact.label.localeCompare(b.fact.label, "ru"));

  if (hits.length === 0) {
    return {
      hits: [],
      said: `по запросу «${parsed.said}» ничего не нашлось — попробуйте одно слово, например «папка» или название программы`,
    };
  }

  return { hits, said: `нашлось ${hits.length} ${plural(hits.length, "факт", "факта", "фактов")} по запросу «${parsed.said}»` };
}

/**
 * Одна ли это основа.
 *
 * Грубого стеммера мало: «переименовать» и «переименуй» — формы одного глагола,
 * но отрезание окончаний даёт `переименоват` и `переименуй`, которые не
 * совпадают ни целиком, ни по началу. Поэтому при длинном общем начале (5 букв)
 * слова считаются теми же: этого хватает для глаголов, а «фото» и «фотограф»
 * остаются разными словами.
 */
function same(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  return prefix >= 5;
}

/**
 * Слова факта — основа для сравнения.
 *
 * В `id` лежит `folder:D:\Отчёты`, и путь оттуда тоже нужен: «отчёты» должно
 * находить папку, даже когда подпись обрезана. Но `folder` — служебное имя вида,
 * и оно не должно давать совпадение слову «папка»... на самом деле должно:
 * человек так и говорит. Поэтому вид берётся в двух формах: `folder` и «папка».
 */
function wordsOf(fact: Fact): string[] {
  const parts = [
    fact.label,
    fact.why,
    fact.kind,
    labelOfKind(fact.kind),
    fact.id.slice(fact.id.indexOf(":") + 1),
  ];
  return parts
    .flatMap((part) => normalize(part).split(" "))
    .filter((word) => word.length > 1 || /^\d$/.test(word))
    .map(stem);
}

function labelOfKind(kind: Fact["kind"]): string {
  if (kind === "folder") return "папка";
  if (kind === "program") return "программа";
  if (kind === "voice") return "голос";
  if (kind === "volume") return "громкость";
  return "способ";
}

/**
 * Что делать, если нашлось много.
 *
 * Пять — столько человек удерживает взглядом, не читая список. Дальше поиск
 * бесполезен: это уже не «найди», а «просмотри всё».
 */
export const SHOWN = 5;

/** Показать первые найденные и честно сказать, что есть ещё. */
export function shortlist(hits: readonly Hit[]): { shown: readonly Hit[]; more: number; said: string } {
  const shown = hits.slice(0, SHOWN);
  const more = Math.max(0, hits.length - shown.length);
  return {
    shown,
    more,
    said: more === 0 ? "" : `и ещё ${more} ${plural(more, "похожий", "похожих", "похожих")} — уточните запрос`,
  };
}

function plural(n: number, one: string, few: string, many: string): string {
  const ten = n % 100;
  if (ten >= 11 && ten <= 14) return many;
  const unit = n % 10;
  if (unit === 1) return one;
  if (unit >= 2 && unit <= 4) return few;
  return many;
}
