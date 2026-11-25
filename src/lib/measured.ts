/**
 * Шаг 287: Jan/LM Studio — каталог моделей и честные требования по железу.
 *
 * Что взято. У Jan и LM Studio каталог говорит про **требования**: сколько
 * памяти нужно, сколько останется после загрузки, потянет ли это машина. Это
 * лучше, чем «модель на 7B, качественная».
 *
 * Что не взято:
 *
 *  * **«рекомендуется 16 ГБ».** Рекомендация — это чужая машина. У нас
 *    требование считается **для этой**: сколько памяти нужно сейчас, сколько
 *    свободно, сколько останется;
 *  * **«поддерживает до …».** Верхняя граница без нижней не отвечает на вопрос
 *    «запустится ли у меня»;
 *  * **звёздочки и бенчмарки.** Меряны на чужом железе (шаги 63, 65): «4.5
 *    звезды» на 4 ГБ и на 64 ГБ — разные модели.
 *
 * Правило: **число, замер и запас**, и всё три — про эту машину. «Не влезет» —
 * тоже ответ, и он лучше, чем «попробуйте».
 */

/** Что каталог знает о модели. */
export interface Item {
  readonly id: string;
  readonly name: string;
  /** Сколько займёт диск, МБ. */
  readonly diskMb: number;
  /** Сколько нужно памяти на загрузку, МБ: вес плюс накладные. */
  readonly needMb: number;
  /** Лицензия — свободным текстом, чтобы не выдавать за юридическую справку. */
  readonly license: string;
  /** Замер на этой машине, если он есть. */
  readonly measured?: { tokensPerSecond: number; at: number };
}

/** Накладные расходы: веса в памяти плюс контекст и служебное. */
export const OVERHEAD_MB = 1200;

/**
 * Сколько памяти нужно модели.
 *
 * Не «вес файла»: файл на диске сжат, а в памяти веса распаковываются и рядом
 * живёт контекст. Обещать по размеру файла — самая частая ложь в таких каталогах.
 */
export function need(item: Pick<Item, "diskMb">): number {
  return Math.round(item.diskMb * 1.1) + OVERHEAD_MB;
}

/** Влезет ли — с ответом и запасом. */
export function fitsHere(item: Item, freeMb: number): { ok: boolean; said: string } {
  const want = need(item);
  if (want > freeMb) {
    return {
      ok: false,
      said: `не влезет: нужно ${gb(want)}, свободно ${gb(freeMb)} — не хватает ${gb(want - freeMb)}`,
    };
  }
  const rest = freeMb - want;
  // Запас меньше 512 МБ — «влезет» правда, но система начнёт свопиться, и
  // человек получит не модель, а зависание.
  if (rest < 512) {
    return { ok: true, said: `влезет, но почти без запаса: останется ${gb(rest)} — система может начать тормозить` };
  }
  return { ok: true, said: `влезет: нужно ${gb(want)}, останется ${gb(rest)}` };
}

/**
 * Скорость — замером, а не паспортом.
 *
 * Нет замера — так и говорится: «не мерили», а не «быстро». Обещание скорости,
 * которого не проверяли, — то же, что обещание результата.
 */
export function speed(item: Item): string {
  if (item.measured === undefined) return "не мерили на этой машине";
  const rate = item.measured.tokensPerSecond;
  if (rate >= 20) return `${Math.round(rate)} слов в секунду — быстрее, чем читает человек`;
  if (rate >= 8) return `${Math.round(rate)} слов в секунду — примерно как речь`;
  if (rate >= 3) return `${Math.round(rate)} слов в секунду — медленно, но ждать можно`;
  return `${Math.round(rate)} слов в секунду — на этой машине слишком медленно`;
}

/**
 * Отсортировать каталог **для этой машины**.
 *
 * Сначала влезающие, внутри — по скорости (замер), затем по размеру: маленькая
 * без замера полезнее большой без замера.
 */
export function offered(items: readonly Item[], freeMb: number): Item[] {
  const ok = items.filter((item) => fitsHere(item, freeMb).ok);
  const no = items.filter((item) => !fitsHere(item, freeMb).ok);
  const byFit = [...ok].sort(
    (a, b) =>
      (b.measured?.tokensPerSecond ?? 0) - (a.measured?.tokensPerSecond ?? 0) ||
      need(a) - need(b),
  );
  return [...byFit, ...no];
}

/** Одна строка каталога: всё, что нужно для выбора. */
export function line(item: Item, freeMb: number): string {
  const verdict = fitsHere(item, freeMb);
  return `${item.name}: ${gb(item.diskMb)} диск, ${gb(need(item))} память, ${speed(item)} — ${verdict.said}`;
}

/** Что сказать, когда ничего не влезает. */
export function nothingFits(freeMb: number): string {
  return `ни одна модель не влезает в ${gb(freeMb)}: закройте лишние программы или возьмите модель поменьше`;
}

function gb(mb: number): string {
  if (mb < 1000) return `${Math.round(mb)} МБ`;
  return `${Math.round(mb / 100) / 10} ГБ`;
}
