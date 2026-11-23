/**
 * Собирать частые фразы в «быстрые команды» без кода (шаг 99).
 *
 * Дефект. Человек говорит одно и то же каждый день: «покажи, что занимает место»,
 * «найди отчёт за март». Каждый раз это **одна и та же фраза**, произнесённая
 * целиком. Дальше:
 *
 *  * **повтор стоит того же, что первый раз**: ни распознавания, ни разбора, ни
 *    времени на проговаривание — экономии нет;
 *  * **человек не может сократить сам**, потому что сокращение — это код или
 *    настройка, а он не программист;
 *  * **приложение не замечает повторов**: оно каждый раз начинает с нуля, хотя
 *    видит одну и ту же фразу десятый раз.
 *
 * Правило: **повтор — одно слово, и слово выбирает человек**.
 *
 *  1. Команда появляется из **фразы, которую сказали несколько раз** (шаг 60,
 *     журнал): сама, без кода, без настройки.
 *  2. **Имя выбирает человек**, а не приложение: «почисти» — это его слово, а
 *     «очистка диска C:» — наше, и его он не вспомнит.
 *  3. Быстрая команда **показывает, что сделает**, прежде чем сделать: сокращение
 *     не должно скрывать действие. Иначе «мойка» однажды удалит не то.
 *  4. Команда **не обходит подтверждение** (шаг 82): опасное остаётся опасным
 *     даже в одно слово.
 *  5. Частые фразы **не предлагаются назойливо**: предложение — один раз, а не
 *     после каждой фразы. Навязчивое предложение человек отключает вместе с
 *     функцией.
 *
 * Почему не «автоматически сокращать». Приложение сократит «удали отчёты» до
 * «удали», и следующая фраза «удали письма» тоже станет «удали» — и одно слово
 * будет значить разное. Имя даёт человек: он-то знает, что именно повторяет.
 */

/** Как часто фраза должна повториться, чтобы предложить команду. */
export const OFTEN = 3;

/** Одна быстрая команда. */
export interface Quick {
  /** Слово, которым человек её называет. */
  name: string;
  /** Что именно будет сделано — фраза целиком. */
  phrase: string;
  /** Опасна ли: подтверждение остаётся. */
  dangerous: boolean;
  /** Сколько раз фраза повторилась. */
  times: number;
}

/**
 * Что предлагать.
 *
 * Возвращает **фразы, которые стоит сократить**, и ничего больше: имя предлагает
 * человек, а не приложение.
 */
export interface Suggestion {
  /** Фраза — кандидат в быстрые команды. */
  phrase: string;
  /** Сколько раз сказана. */
  times: number;
  /** Есть ли уже команда на эту фразу. */
  taken: boolean;
  /** Почему предлагаем — для показа и теста. */
  why: string;
}

/**
 * Кандидаты из журнала.
 *
 * Сравнение — по **нормализованной** фразе: регистр и лишние пробелы не делают
 * фразу другой. Уже сокращённые не предлагаются: дважды предлагать нечего.
 */
export function suggest(
  heard: readonly { heard: string }[],
  quick: readonly Quick[],
  limit = 3,
): Suggestion[] {
  const counts = new Map<string, { phrase: string; times: number }>();
  for (const row of heard) {
    const phrase = normal(row.heard);
    if (phrase.length === 0) continue;
    const seen = counts.get(phrase);
    if (seen === undefined) counts.set(phrase, { phrase: row.heard.trim(), times: 1 });
    else counts.set(phrase, { phrase: seen.phrase, times: seen.times + 1 });
  }

  return [...counts.entries()]
    .filter(([, value]) => value.times >= OFTEN)
    .sort((left, right) => right[1].times - left[1].times)
    .slice(0, limit)
    .map(([key, value]) => ({
      phrase: value.phrase,
      times: value.times,
      taken: quick.some((item) => normal(item.phrase) === key),
      why: `сказано ${value.times} раз — можно назвать одним словом`,
    }))
    .filter((item) => !item.taken);
}

/** Нормализация: «Найди  отчёт» и «найди отчёт» — одна фраза. */
export function normal(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Проверка имени.
 *
 * Имя нужно **короткое и однозначное**: длинное человек не вспомнит, а имя, уже
 * занятое другой командой, — это путаница.
 */
export interface NameCheck {
  ok: boolean;
  why: string;
}

export function checkName(name: string, quick: readonly Quick[]): NameCheck {
  const clean = name.trim();
  if (clean.length === 0) return { ok: false, why: "слово пустое — назовите команду так, как будете её вспоминать" };
  if (clean.split(/\s+/).length > 2) {
    return { ok: false, why: "слово длиннее двух — его не вспомнят, назовите короче" };
  }
  const clash = quick.find((item) => normal(item.name) === normal(clean));
  if (clash !== undefined) {
    return { ok: false, why: `«${clean}» уже значит «${clash.phrase}» — другое слово` };
  }
  return { ok: true, why: `«${clean}» — ваше слово, я его не придумываю` };
}

/**
 * Создание команды.
 *
 * `dangerous` **обязателен** и передаётся, а не выводится: сокращение не должно
 * становиться безопаснее исходной фразы.
 */
export function create(name: string, suggestion: Suggestion, dangerous: boolean, quick: readonly Quick[]): Quick[] | NameCheck {
  const check = checkName(name, quick);
  if (!check.ok) return check;
  return [
    ...quick,
    { name: name.trim(), phrase: suggestion.phrase, dangerous, times: suggestion.times },
  ];
}

/**
 * Что будет сделано — **до** исполнения.
 *
 * Сокращение не скрывает действие: «мойка» однажды может удалить не то.
 */
export function preview(item: Quick): string {
  return item.dangerous
    ? `«${item.name}» — это «${item.phrase}», и это необратимо: подтверждение остаётся`
    : `«${item.name}» — это «${item.phrase}»`;
}

/**
 * Нужно ли подтверждение.
 *
 * Опасное остаётся опасным **даже в одно слово**: сокращение — это удобство
 * записи, а не разрешение.
 */
export function needsConfirm(item: Quick): boolean {
  return item.dangerous;
}

/**
 * Насколько назойливо предлагать.
 *
 * Предложение — **один раз** на фразу. Навязчивое предложение человек отключает
 * вместе с функцией.
 */
export const OFFER_ONCE = 1;

/** Предлагали ли уже эту фразу. */
export function offer(rules: readonly string[], phrase: string): boolean {
  return rules.filter((rule) => normal(rule) === normal(phrase)).length < OFFER_ONCE;
}

/**
 * Что сказать человеку.
 *
 * Названо **его слово и что за ним стоит**: иначе команда — это пароль, который
 * надо помнить.
 */
export function say(items: readonly Quick[]): string {
  if (items.length === 0) return "быстрых команд пока нет: они появятся из фраз, которые вы говорите часто";
  return items.map(preview).join("; ");
}
