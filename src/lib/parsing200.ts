/**
 * Тест-обещание: 200 живых фраз, порог понятых ≥ 90%, отказы с причиной (шаг 100).
 *
 * Дефект, ради которого написан шаг. До него «разбор работает» проверялось
 * **ощущением**: примеры из реестра проходили, а живые фразы — нет, и никто не
 * знал, сколько именно. Здесь появляется **число** и **порог**, который ломает
 * сборку.
 *
 * Правило: **два числа, а не одно**.
 *
 *  1. **Найдено** — планировщик вернул хоть что-то. Это «понял ли я, о чём
 *     речь»; до шага это было 171 из 200.
 *  2. **Верное первым** — первая строка принадлежит тому же домену, что и
 *     действие-эталон. Это «понял ли я **то**»; до шага это было **37 из 200**,
 *     и именно этим объяснялись «найди файл по имени → удали корзину».
 *  3. Порог по первому числу — **90%**: ниже значит, что каждая десятая фраза
 *     уходит в «не понял», а это уже не редкий случай, а обычная работа.
 *  4. Второе число **не закрывается порогом молча**: оно названо и растёт
 *     отдельно. Ставить порог 90% на верность первым — значит либо врать, либо
 *     выключить тест.
 *  5. **Отказ — с причиной**: каждая не найденная фраза попадает в список с тем,
 *     чего не хватило. «Не нашлось» без причины — это не отчёт, а счётчик.
 *
 * Почему не «поднять порог до 100%». Часть фраз начинается с объекта («что
 * изменилось между бэкапами») или с редкого глагола реестра; честный ответ там —
 * «не понял», и выдавать его за успех значит опять врать.
 */

/** Насколько понята фраза. */
export type Understanding =
  /** Найдено и первая строка из нужного домена. */
  | "fits"
  /** Найдено, но первая строка — из другого домена. */
  | "wrong-first"
  /** Ничего не найдено. */
  | "nothing";

/** Одна фраза и её судьба. */
export interface Row {
  /** Живая фраза из каталога. */
  phrase: string;
  /** Домен эталона: `files`, `mail`, … */
  domain: string;
  /** Что получилось. */
  got: Understanding;
  /** Причина отказа — только когда не понято. */
  why: string;
}

/** Имя домена действия. */
export function domainOf(key: string): string {
  return key.split("|")[0] ?? "";
}

/**
 * Судьба одной фразы.
 *
 * `keys` — первые строки, которые вернул планировщик, в порядке.
 */
export function judge(phrase: string, domain: string, keys: readonly string[]): Row {
  if (keys.length === 0) {
    return {
      phrase,
      domain,
      got: "nothing",
      why: reasonFor(phrase),
    };
  }
  const first = domainOf(keys[0] ?? "");
  return first === domain
    ? { phrase, domain, got: "fits", why: "" }
    : {
        phrase,
        domain,
        got: "wrong-first",
        why: `первым нашлось «${keys[0] ?? ""}», а просили ${domain}`,
      };
}

/**
 * Почему не нашлось.
 *
 * Не «не нашлось» без причины: причина нужна, чтобы знать, что чинить —
 * глагол, объект или всю фразу.
 */
export function reasonFor(phrase: string): string {
  const clean = phrase.trim().toLowerCase();
  if (clean.length === 0) return "пустая фраза";
  const words = clean.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3);
  if (words.length === 0) return "ни одного значимого слова: фраза из предлогов";
  if (/^(что|как|почему|насколько|нет ли|не)\b/.test(clean)) {
    return "фраза — вопрос, а не просьба: планировщик ищет действия";
  }
  return `нет совпадений по объекту и глаголу: ${words.slice(0, 3).join(", ")}`;
}

/**
 * Итог по всем фразам.
 *
 * Два числа считаются **раздельно** — «найдено» и «верное первым»: одно без
 * другого врёт.
 */
export interface Summary {
  /** Сколько фраз понято. */
  total: number;
  /** Сколько найдено хоть что-то. */
  found: number;
  /** Сколько понято верно. */
  right: number;
  /** Доля найденных. */
  foundShare: number;
  /** Доля верных первым. */
  rightShare: number;
  /** Отказы с причиной. */
  misses: Row[];
}

export function summary(rows: readonly Row[]): Summary {
  const total = rows.length;
  const found = rows.filter((row) => row.got !== "nothing").length;
  const right = rows.filter((row) => row.got === "fits").length;
  return {
    total,
    found,
    right,
    foundShare: total === 0 ? 0 : found / total,
    rightShare: total === 0 ? 0 : right / total,
    misses: rows.filter((row) => row.got !== "fits"),
  };
}

/** Порог «понято» — **обещание**, а не настройка. */
export const THRESHOLD = 0.9;

/**
 * Достигнут ли порог.
 *
 * Ответ словами, чтобы тест падал с понятным текстом, а не с `false`.
 */
export function meets(got: Summary, threshold = THRESHOLD): string | null {
  if (got.foundShare >= threshold) return null;
  const needed = Math.ceil(threshold * got.total);
  return `найдено ${got.found} из ${got.total} — нужно ${needed}; отказы: ${got.misses
    .slice(0, 3)
    .map((row) => `«${row.phrase}» (${row.why})`)
    .join("; ")}`;
}

/**
 * Отчёт человеку.
 *
 * Два числа рядом, потому что по отдельности каждое обманывает: «171 из 200»,
 * если не сказать «верное первым 37», звучит как успех.
 */
export function say(got: Summary): string {
  return `понято ${got.found} из ${got.total} (${Math.round(got.foundShare * 100)}%), из них верно с первой строки ${got.right} (${Math.round(
    got.rightShare * 100,
  )}%)`;
}

/**
 * Что чинить в первую очередь — по отказам.
 *
 * Группировка по причине, а не «плохо понимает»: «вопрос, а не просьба» и «нет
 * совпадений по объекту» — разные дефекты с разным лечением.
 */
export function worst(rows: readonly Row[], limit = 3): { reason: string; times: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.got === "fits") continue;
    const key = row.got === "nothing" ? row.why : "верное не первым";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, times]) => ({ reason, times }))
    .sort((left, right) => right.times - left.times)
    .slice(0, limit);
}
