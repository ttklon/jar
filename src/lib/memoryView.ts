/**
 * Шаг 263: просмотр и удаление каждого факта памяти одной кнопкой.
 *
 * Почему это отдельный шаг, а не «удаление уже есть». `forget()` есть и в
 * предпочтениях (шаг 261), и в способах (шаг 262) — по одной на каждый вид. Но
 * **человек не видит памяти**: папки лежат в одном месте, способы в другом,
 * голос в третьем, и чтобы что-то забыть, надо знать, где оно живёт и как
 * называется. Память без управления — это хранение чужих привычек без спроса.
 *
 * Правило: **экран памяти — один список**. Каждый факт в нём назван так, как
 * его узнал бы человек («папка D:\Отчёты», «голос Алла», «способ: переименуй
 * фото»), и у каждого есть ровно одна кнопка. Ни «очистить всё», ни «удалить
 * выбранное» — потому что первое стирает нужное вместе с лишним, а второе
 * требует режима выделения.
 *
 * Три вещи, которые делают удаление честным:
 *
 *  1. **удаление называет, что исчезнет.** Не «удалить факт», а «папка
 *     D:\Отчёты — больше не будет предлагаться»;
 *  2. **удаление необратимо, и это сказано.** Обещание «можно отменить» было бы
 *     ложью: отменить можно только то, что хранится;
 *  3. **что осталось — видно сразу.** После удаления список пересчитывается, и
 *     человек видит, что ушли только эти строки.
 */

import type { Kind as PrefKind, Preference } from "./preferences";
import type { Method } from "./methods";

/**
 * Один факт в общем списке.
 *
 * `id` — устойчивый ключ, по которому удаляют. Он собирается из вида и значения,
 * а не из позиции: позиция меняется, и «удалить третью строку» однажды удалит
 * не то.
 */
export interface Fact {
  /** Ключ для удаления: `folder:D:\Отчёты`. */
  readonly id: string;
  /** Вид факта — для иконки и для общего счёта. */
  readonly kind: PrefKind | "method";
  /** Что человек увидит: без внутренних ключей и путей к базе. */
  readonly label: string;
  /** Откуда взялось и почему предлагается. */
  readonly why: string;
  /** Можно ли удалить. У факта из неизменяемого источника — нет, с причиной. */
  readonly removable: boolean;
  /** Почему нельзя удалить, если `removable` ложно. */
  readonly because: string;
}

/** Список памяти: предпочтения и способы вместе, как их видит человек. */
export function facts(preferences: readonly Preference[], methods: readonly Method[], now: number): Fact[] {
  const out: Fact[] = [];

  for (const preference of preferences) {
    out.push({
      id: `${preference.kind}:${preference.value}`,
      kind: preference.kind,
      label: label(preference.kind, preference.value),
      why: preference.why,
      removable: true,
      because: "",
    });
  }

  for (const method of methods) {
    out.push({
      id: `method:${method.dayStart}`,
      kind: "method",
      label: `способ: «${method.said || "без слов"}» (${method.steps.length} ${
        method.steps.length === 1 ? "шаг" : method.steps.length < 5 ? "шага" : "шагов"
      })`,
      why: ageOf(method, now),
      removable: true,
      because: "",
    });
  }

  return out;
}

function label(kind: PrefKind, value: string): string {
  if (kind === "folder") return `папка ${value}`;
  if (kind === "program") return `программа ${value}`;
  if (kind === "voice") return `голос ${value}`;
  return `громкость ${value}%`;
}

function ageOf(method: Method, now: number): string {
  const days = Math.floor((now - method.dayStart) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "сделан сегодня";
  if (days === 1) return "сделан вчера";
  return `сделан ${days} ${days < 5 ? "дня" : "дней"} назад`;
}

/**
 * Что произойдёт, если нажать «удалить» на этом факте.
 *
 * Сказано **до** нажатия и словами: «больше не будет предлагаться». Не
 * «удалить факт» — человек не обязан знать, что такое факт.
 */
export function willDo(fact: Fact): string {
  if (!fact.removable) return `нельзя удалить: ${fact.because}`;
  return `${fact.label} — больше не будет предлагаться. Вернуть нельзя`;
}

/** Можно ли удалить: одна кнопка, но не на том, что удалять нельзя. */
export function canRemove(fact: Fact): boolean {
  return fact.removable;
}

/** Итог удаления: что осталось и что ушло. */
export interface After {
  readonly left: readonly Fact[];
  /** Что удалилось — по имени, чтобы человек увидел именно это. */
  readonly gone: readonly string[];
  /** Почему не удалилось, если не удалилось. */
  readonly said: string;
}

/**
 * Удалить один факт.
 *
 * Память передаётся сюда в её собственных формах, а возвращается **новыми**
 * списками: удаление не мутирует ни предпочтения, ни способы, иначе «удалить»
 * нельзя ни проверить, ни показать до нажатия.
 */
export function remove(
  fact: Fact,
  preferences: readonly Preference[],
  methods: readonly Method[],
  now: number,
): { preferences: Preference[]; methods: Method[]; after: After } {
  if (!canRemove(fact)) {
    return {
      preferences: [...preferences],
      methods: [...methods],
      after: { left: facts(preferences, methods, now), gone: [], said: willDo(fact) },
    };
  }

  let leftPrefs = [...preferences];
  let leftMethods = [...methods];

  if (fact.kind === "method") {
    // Способы удаляются по дню: ключ `method:<dayStart>`.
    const day = Number(fact.id.slice("method:".length));
    leftMethods = methods.filter((method) => method.dayStart !== day);
  } else {
    // Значение разбирается из `id` — того же ключа, по которому строили список:
    // второй правды о том, «что это за факт», держать нельзя.
    const value = fact.id.slice(fact.kind.length + 1);
    leftPrefs = preferences.filter(
      (preference) => !(preference.kind === fact.kind && preference.value === value),
    );
  }

  const removed = preferences.length + methods.length - (leftPrefs.length + leftMethods.length);
  return {
    preferences: leftPrefs,
    methods: leftMethods,
    after: {
      left: facts(leftPrefs, leftMethods, now),
      gone: removed > 0 ? [fact.label] : [],
      said:
        removed > 0
          ? `удалено: ${fact.label}. Осталось фактов: ${leftPrefs.length + leftMethods.length}`
          : `ничего не удалено: ${fact.label} не было в памяти`,
    },
  };
}

/** Удалить **каждый** факт по одному — то, что делает кнопка на строке. */
export function removeAll(
  chosen: readonly Fact[],
  preferences: readonly Preference[],
  methods: readonly Method[],
  now: number,
): { preferences: Preference[]; methods: Method[]; after: After } {
  let prefs = [...preferences];
  let meths = [...methods];
  const gone: string[] = [];
  for (const fact of chosen) {
    const step = remove(fact, prefs, meths, now);
    prefs = step.preferences;
    meths = step.methods;
    gone.push(...step.after.gone);
  }
  return {
    preferences: prefs,
    methods: meths,
    after: {
      left: facts(prefs, meths, now),
      gone,
      said: `удалено ${gone.length} из ${chosen.length}`,
    },
  };
}

/** Строка для экрана: сколько фактов и сколько из них можно удалить. */
export function summary(list: readonly Fact[]): string {
  if (list.length === 0) return "в памяти ничего нет";
  const removable = list.filter(canRemove).length;
  const word = list.length === 1 ? "факт" : list.length < 5 ? "факта" : "фактов";
  if (removable === list.length) return `${list.length} ${word}, каждый удаляется одной кнопкой`;
  return `${list.length} ${word}, удаляются ${removable}`;
}
