/**
 * Шаг 262: память о способах — «как вчера» находит вчерашнюю цепочку.
 *
 * Что уже было и чего не было. `likeYesterday.ts` (шаг 85) умеет **найти**
 * вчерашнюю цепочку по просьбе. Но способ существовал только как ответ на
 * вопрос: его нельзя было ни увидеть списком, ни удалить, ни понять, почему он
 * предлагается. Память, которая работает только по запросу, — это не память, а
 * поиск: человек не знает, что там лежит и как это убрать.
 *
 * Правило шага: **способ — такой же факт памяти, как папка или голос**. У него
 * есть когда, что, чем и почему; его видно в списке; его удаляют одной кнопкой;
 * и он не предлагается, если устарел настолько, что повторять его опасно.
 *
 * Почему «опасно» — не громкое слово. Цепочка «сжать фото, удалить исходники,
 * переименовать» через месяц заденет другие файлы: имена уже не те. Повтор
 * способа — это повтор **решения**, а решение опиралось на то, чего больше нет.
 */

import type { Done } from "./likeYesterday";

/** Способ как факт памяти: что делали в этот день. */
export interface Method {
  /** День, местное время, мс — тот же ключ, что у `Done`. */
  readonly dayStart: number;
  /** Что человек сказал тогда: по этой фразе способ и узнают. */
  readonly said: string;
  /** Шаги по порядку — сама цепочка. */
  readonly steps: readonly string[];
  /** Параметры, без которых повтор бессмысленен. */
  readonly params: Readonly<Record<string, string>>;
}

/**
 * Через сколько дней способ считается старым.
 *
 * Семь — не «неделя ради недели». За неделю меняются имена файлов, папки,
 * проекты; цепочка, снятая на прошлой неделе, чаще заденет не то. Месяц —
 * заведомо другая работа. Семь — граница, за которой повтор требует взгляда.
 */
export const AGES_MS = 7 * 24 * 60 * 60 * 1000;

/** Способ из записи журнала — без потери того, что сказал человек. */
export function from(done: Done): Method {
  return {
    dayStart: done.dayStart,
    said: done.said,
    steps: [...done.steps],
    params: { ...done.params },
  };
}

/** Все способы: новые первыми — так список читают сверху вниз. */
export function list(dones: readonly Done[]): Method[] {
  return dones
    .map(from)
    .sort((left, right) => right.dayStart - left.dayStart);
}

/**
 * Метка возраста для списка.
 *
 * Не «timestamp»: человеку нужно «сегодня», «вчера», «5 дней назад». Число
 * миллисекунд в списке памяти читается как мусор.
 */
export function age(method: Method, now: number): string {
  const days = Math.floor((now - method.dayStart) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 5) return `${days} дня назад`;
  return `${days} дней назад`;
}

/**
 * Устарел ли способ для повтора.
 *
 * Старый способ не удаляется сам: он остаётся в памяти и находится по просьбе
 * «как в прошлый раз». Но предлагать его по умолчанию нельзя — и это разные
 * вещи, которые легко перепутать.
 */
export function old(method: Method, now: number): boolean {
  return now - method.dayStart > AGES_MS;
}

/** Что сказать про способ: возраст, шаги, предупреждение. */
export function say(method: Method, now: number): string {
  const steps = method.steps.length;
  const head = `${method.said || "без слов"} — ${steps} ${steps === 1 ? "шаг" : steps < 5 ? "шага" : "шагов"}, ${age(method, now)}`;
  if (!old(method, now)) return head;
  // Не «устарело» без причины: человек должен понимать, чего боится повтор.
  return `${head} (старый способ: имена и папки могли измениться — проверьте перед повтором)`;
}

/**
 * Удалить способ — ровно один, по дню.
 *
 * По дню, а не по «всей истории»: человек, которому не понравилось, что
 * приложение помнит вчерашнее, не обязан терять и прошлую неделю.
 */
export function forget(dones: readonly Done[], dayStart: number): Done[] {
  return dones.filter((done) => done.dayStart !== dayStart);
}

/**
 * Какой способ предложить по просьбе «как обычно».
 *
 * Берётся **самый свежий не старый**: свежий, но старый (такое бывает, если
 * человек долго не заходил) не предлагается вовсе — вместо него честное «нет
 * подходящего».
 */
export function usual(dones: readonly Done[], now: number): Method | null {
  for (const method of list(dones)) {
    if (!old(method, now)) return method;
  }
  return null;
}

/** Строка для списка памяти: сколько способов и сколько из них старых. */
export function summary(dones: readonly Done[], now: number): string {
  const methods = list(dones);
  if (methods.length === 0) return "способов в памяти нет";
  const stale = methods.filter((method) => old(method, now)).length;
  const word = methods.length === 1 ? "способ" : methods.length < 5 ? "способа" : "способов";
  if (stale === 0) return `${methods.length} ${word} в памяти, все свежие`;
  return `${methods.length} ${word} в памяти, из них старых ${stale}`;
}
