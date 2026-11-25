/**
 * Шаг 272: не запоминать то, что человек не повторил.
 *
 * Дефект. В одной памяти жили два правила про повторы, и оба были неверны:
 *
 *  * `preferences.pick()` запоминает со второго раза — но считает повторы
 *    **внутри вида**, и «дважды открыл папку» становится предпочтением, даже если
 *    второй раз был случайным промахом рядом в списке;
 *  * `facts.factsToRemember()` запоминает **после одного раза** — это было
 *    задумано («сказал один раз — помнит»), но одна фраза не привычка: человек
 *    назвал папку, потому что она под рукой сегодня, а завтра работает в другой.
 *
 * Опасность не в том, что память чего-то не запомнит. Опасность — **ложное
 * предпочтение**: приложение подставляет папку, которую человек однажды открыл,
 * с уверенностью «вы так всегда делаете». Ошибка не в том, что подставилось —
 * человек это поправит, — а в том, что подставленное **выглядит знанием**.
 *
 * Поэтому правило одно на всю память, и оно про три вещи:
 *
 *  1. **повтор — это разное время, а не два раза подряд.** Два клика за одну
 *     секунду — один поступок, а не два свидетельства. Иначе любое дрожание руки
 *     становится привычкой;
 *  2. **повтор — это то же самое значение, а не тот же вид.** Две разные папки
 *     дважды — это не привычка к папке, это работа в разных местах;
 *  3. **редкость должна быть видна.** «Из пяти раз — один» и «из одного — один»
 *     выглядят одинаково, если показывать только число повторов. Поэтому кроме
 *     «сколько раз» помнится «сколько было случаев».
 *
 * Что при этом **не** отвергается: то, что человек сказал прямо и осознанно
 * («запомни: моя папка — D:\Отчёты»). Прямая просьба — это не наблюдение, и
 * требовать её повторения значит спорить с человеком о его же словах.
 */

/** Что человек сделал, когда и при каких обстоятельствах. */
export interface Act {
  /** Вид: `folder`, `program`, `voice`, `volume`, `answer` … */
  readonly kind: string;
  /** Значение — то, что запомнилось бы. */
  readonly value: string;
  /** Когда, мс. */
  readonly at: number;
  /**
   * Прямая просьба запомнить: «запомни, что …». Такое не наблюдение, а слово
   * человека, и повтора не требует.
   */
  readonly asked?: boolean;
  /**
   * Чем закончилось: `ok` — получилось, `failed` — нет, `cancelled` — бросили.
   * Провал **не подтверждает** значение: человек ввёл папку, но её не было —
   * запоминать нечего.
   */
  readonly outcome?: "ok" | "failed" | "cancelled";
}

/**
 * Сколько нужно повторов.
 *
 * Два — тот же порог, что у предпочтений (`preferences.THRESHOLD`), и теперь он
 * общий: второе число в той же памяти означало бы, что «привычка» настраивается
 * дважды и по-разному.
 */
export const NEED = 2;

/**
 * Насколько далеко должны стоять два повтора, чтобы считаться двумя.
 *
 * Пять минут — не «пять минут»: это граница между «повторил» и «кликнул дважды».
 * Человек, который действительно вернулся к тому же делу, делает это через
 * минуты и часы; даблклик и промах — за секунды.
 */
export const APART_MS = 5 * 60 * 1000;

/**
 * Сколько случаев помнить для честной оценки.
 *
 * Тридцать — как у памяти дел (`deedMemory.KEEP`): дальше это архив, а не «как
 * часто человек это делает».
 */
export const KEEP = 30;

/**
 * Стоит ли запоминать значение по его истории.
 *
 * Возвращает и объяснение: без него «не запомнил» неотличимо от сбоя, и человек
 * не понимает, почему приложение снова спросило то же самое.
 */
export function worth(acts: readonly Act[], kind: string, value: string): { remember: boolean; because: string } {
  const mine = acts.filter((act) => act.kind === kind && act.value.trim() === value.trim() && act.value.trim() !== "");
  if (mine.length === 0) return { remember: false, because: "такого ещё не было" };

  // Прямая просьба сильнее любого счёта: человек уже сказал, что это не случайность.
  if (mine.some((act) => act.asked === true)) {
    return { remember: true, because: "вы просили это запомнить" };
  }

  // Провал не подтверждает значение: папки не было, программа не открылась.
  const kept = mine.filter((act) => act.outcome !== "failed" && act.outcome !== "cancelled");
  if (kept.length === 0) {
    return { remember: false, because: "в прошлый раз не получилось — это не привычка" };
  }

  const times = spread(kept);
  if (times < NEED) {
    return {
      remember: false,
      because: `${once(kept.length)} — не привычка: повторю, если это случится ещё раз`,
    };
  }
  return { remember: true, because: `${times} ${plural(times, "раз", "раза", "раз")} в разное время` };
}

/**
 * Сколько разных случаев в наборе действий — по промежуткам, а не по сетке.
 *
 * Нарезка времени на пятиминутки (`floor(at / APART_MS)`) — не то же самое:
 * два действия в две миллисекунды друг от друга, но по разные стороны границы,
 * дали бы два «случая». Границы сетки не имеют отношения к тому, что делал
 * человек, поэтому случаи считаются промежутками.
 */
export function occasions(acts: readonly Act[]): number {
  const sorted = [...acts].sort((a, b) => a.at - b.at);
  let count = 0;
  let last = -Infinity;
  for (const act of sorted) {
    if (act.at - last >= APART_MS) count += 1;
    last = act.at;
  }
  return count;
}

/**
 * Сколько **разных случаев** в истории.
 *
 * Два действия подряд с одним значением — один случай: это и есть «человек не
 * повторил». Счёт по времени, а не по числу записей.
 */
export function spread(acts: readonly Act[]): number {
  const sorted = [...acts].sort((a, b) => a.at - b.at);
  let count = 0;
  let last = -Infinity;
  for (const act of sorted) {
    if (act.at - last >= APART_MS) {
      count += 1;
      last = act.at;
    }
  }
  return count;
}

/**
 * Доля подтверждений: сколько раз из скольких случаев.
 *
 * Нужна, чтобы редкость была **видна**: «из пяти раз — один» и «из одного —
 * один» при показе только числа повторов выглядят одинаково.
 */
export function confidence(acts: readonly Act[], kind: string, value: string): { times: number; cases: number; share: number } {
  const mine = acts.filter((act) => act.kind === kind);
  const same = mine.filter((act) => act.value.trim() === value.trim() && act.value.trim() !== "");
  const cases = occasions(mine);
  const times = spread(same);
  return { times, cases, share: cases === 0 ? 0 : Math.min(1, times / cases) };
}

/**
 * Что сказать, когда повтора не хватило.
 *
 * Не «недостаточно данных»: человеку нужно знать, что сделать, чтобы память
 * заработала. Нажатие «повторить» — и есть это действие, поэтому оно так и
 * называется, а не «подтвердить».
 */
export function say(verdict: { remember: boolean; because: string }, value: string): string {
  if (verdict.remember) return `${value} — запомню: ${verdict.because}`;
  return `${value} — пока не запоминаю: ${verdict.because}`;
}

/**
 * Отфильтровать историю на запись: то, что не повторилось, не становится фактом.
 *
 * Возвращает и отвергнутое с причиной — молча выброшенное наблюдение выглядит
 * как потеря, и человек будет искать, куда делась папка, которую он точно
 * называл.
 */
export function keep(
  acts: readonly Act[],
): { facts: { kind: string; value: string; why: string }[]; dropped: { kind: string; value: string; why: string }[] } {
  const pairs = new Map<string, { kind: string; value: string }>();
  for (const act of acts) {
    const value = act.value.trim();
    if (value === "") continue;
    pairs.set(`${act.kind}:${value}`, { kind: act.kind, value });
  }

  const facts: { kind: string; value: string; why: string }[] = [];
  const dropped: { kind: string; value: string; why: string }[] = [];
  for (const pair of pairs.values()) {
    const verdict = worth(acts, pair.kind, pair.value);
    if (verdict.remember) facts.push({ ...pair, why: verdict.because });
    else dropped.push({ ...pair, why: verdict.because });
  }
  return { facts, dropped };
}

/** Обрезать историю до `KEEP` последних действий. */
export function trim(acts: readonly Act[]): Act[] {
  const sorted = [...acts].sort((a, b) => a.at - b.at);
  return sorted.length <= KEEP ? sorted : sorted.slice(sorted.length - KEEP);
}

function once(n: number): string {
  if (n === 1) return "один раз";
  return `${n} раза подряд`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const ten = n % 100;
  if (ten >= 11 && ten <= 14) return many;
  const unit = n % 10;
  if (unit === 1) return one;
  if (unit >= 2 && unit <= 4) return few;
  return many;
}
