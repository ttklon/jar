/**
 * Замер перебивания: сколько прошло от «человек заговорил» до тишины (шаг 80).
 *
 * Правило `barge` обещает число: не дольше 200 мс. Пока это только правило в
 * библиотеке, обещание не проверено ни на одной живой фразе — а человек
 * чувствует именно задержку, а не наличие кода.
 *
 * Здесь одна засечка на весь экран: `record()` в момент, когда человек начал
 * говорить, `settle()` — когда наша речь действительно замолчала. Разница —
 * число, которое можно показать, а не «перебивание работает».
 *
 * Почему засечка снаружи правила. Правило считает по двум моментам, но не знает,
 * **где** их взять: `performance.now()` в библиотеке означал бы, что мерили
 * момент вызова, а не звук. Замер — это факт, а не решение, поэтому он живёт
 * рядом с местом, где звук начинается.
 *
 * И почему не в состоянии React: `start()` вызывается из обработчика, а `settle`
 * — из другого (успех `speak`) или из очистки. Положись на перерисовку — замер
 * поехал бы на кадр, а кадр — это и есть наша погрешность.
 */

import { BARGE_LIMIT_MS, bargeLine, slowest, withinLimit, type Barge } from "./barge";

/** Часы: `performance.now()`, а в тестах — подменяемые. */
let clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * Когда человек заговорил. `null` — ещё не говорил.
 *
 * Не ноль: `performance.now()` в начале жизни страницы **и есть** около нуля, и
 * первое перебивание после запуска не замерялось бы — ровно то, которое человек
 * и запомнит («только открыл, а оно не замолчало»).
 */
let spokenAt: number | null = null;
/** Замер, который уже готов к отчёту. */
let last: Barge | null = null;
/**
 * Худшее перебивание из всех замеров.
 *
 * Именно **всех**, а не только медленных: экран, который после быстрого
 * перебивания говорит «ещё не мерили», — это отсутствие ответа там, где ответ
 * есть. И наоборот: показать последний значит соврать про обещание — оно про
 * то, что никогда не дольше, а человек запоминает медленное.
 */
let worstSoFar: Barge | null = null;

/** Подменить часы в тесте. Возвращает прежние — чтобы не протекало между тестами. */
export function useClock(next: () => number): () => number {
  const was = clock;
  clock = next;
  return was;
}

/** Человек начал говорить. */
export function record(): void {
  spokenAt = clock();
}

/**
 * Закрыть замер, когда «заговорил» и «стало тихо» — разные места кода.
 *
 * Так и есть на живой машине: человек нажимает кнопку (или клавишу) здесь, а
 * тишина наступает после `stopSpeaking()` там. Передаётся разница, а не пара
 * моментов: мерить часы в двух местах — значит надеяться, что они одни и те же.
 */
export function settleAfter(elapsedMs: number): Barge | null {
  if (spokenAt === null) return null;
  const attempt: Barge = { spokenAt, silentAt: spokenAt + Math.max(0, elapsedMs) };
  spokenAt = null;
  last = attempt;
  worstSoFar = worstSoFar === null ? attempt : slowest([worstSoFar, attempt]);
  return attempt;
}

/**
 * Наша речь замолчала — закрыть замер.
 *
 * `null` — если человек не начинал говорить: тогда это не перебивание, а
 * затихание по концу фразы, и записывать его в статистику значит портить
 * честный замер успехами, которых не было.
 */
export function settle(): Barge | null {
  if (spokenAt === null) return null;
  const attempt: Barge = { spokenAt, silentAt: clock() };
  spokenAt = null;
  last = attempt;
  // Худшее, а не среднее: обещание про «никогда дольше», и один медленный
  // случай важнее девяти быстрых (то же правило, что в `barge.slowest`).
  worstSoFar = worstSoFar === null ? attempt : slowest([worstSoFar, attempt]);
  return attempt;
}

/** Что показать человеку: последний замер словами правила. */
export function said(): string | null {
  return last === null ? null : bargeLine(last);
}

/**
 * Худший замер — для отчёта.
 *
 * Чисел два, и они про разное: последний — «как сейчас», худший — «как вообще
 * бывает». Обещание проверяется по худшему.
 */
export function worst(): { attempt: Barge; line: string; ok: boolean } | null {
  if (worstSoFar === null) return null;
  return {
    attempt: worstSoFar,
    line: bargeLine(worstSoFar),
    ok: withinLimit(worstSoFar),
  };
}

/** Обещание, чтобы экран называл число, а не «быстро». */
export const LIMIT_MS = BARGE_LIMIT_MS;

/** Сброс — между тестами и при новом разговоре. */
export function reset(): void {
  spokenAt = null;
  last = null;
  worstSoFar = null;
}
