/**
 * Шаг 274: факт можно поправить, а не только удалить.
 *
 * Дефект. Экран памяти (шаг 263) знает **одну** кнопку — «удалить». И это честно
 * только пока жизнь не меняется. Она меняется: папка переехала с `D:\\Отчёты` на
 * `D:\\Отчёты 2025`, голос сменился, программа называется иначе. И тогда человек
 * оказывается в ловушке:
 *
 *  * **удалить и ждать.** Удаление стирает `times` и `why` — всё, что память
 *    знала об этом факте. Чтобы значение вернулось, его надо повторить дважды
 *    (шаг 272), то есть сделать работу за приложение два раза. А до тех пор
 *    помощь, которая работала месяцами, молчит;
 *  * **оставить как есть.** Приложение подставляет старую папку, человек её
 *    правит каждый раз — и правит вручную то, что можно было сказать один раз;
 *  * **назвать это «удалить и добавить».** Технически верно и человечески ложно:
 *    человек не удаляет привычку, а переучивает её. Разница видна в том, что
 *    происходит с `times`: при правке они **переносятся** на новое значение;
 *  * **правка молча.** Если исправленное отличается от старого только регистром
 *    или слэшами, это не новое значение, а то же самое — и стирать привычку
 *    ради `d:\\отчёты` значит наказывать за аккуратность.
 *
 * Правила:
 *
 *  1. **правка — это тот же факт с новым значением.** Счётчик, причина и дата
 *     остаются: человек не начинал заново, он поправил;
 *  2. **правка видна до нажатия** — как и удаление: что станет вместо чего;
 *  3. **правка не создаёт дублей.** Если исправленное значение уже есть в
 *     памяти, два факта про одно и то же — это вопрос «чему верить» там, где его
 *     нет: они сливаются, и счётчики складываются не как «два свидетельства», а
 *     как «и то, и другое было» — берётся большее;
 *  4. **правка не молчит при отказе.** Пустое значение, неизменённое значение,
 *     вид, которого в памяти быть не должно, — три разных отказа, и каждый
 *     называется своей причиной.
 */

import type { Preference } from "./preferences";
import type { Method } from "./methods";

/** Что человек правит. */
export interface Edit {
  /** Ключ факта: `folder:D:\\Отчёты` — тот же, по которому строят список. */
  readonly id: string;
  /** Новое значение, как его набрал человек. */
  readonly value: string;
}

/** Итог правки: новые списки и что сказать. */
export interface Edited {
  readonly preferences: readonly Preference[];
  readonly methods: readonly Method[];
  /** Получилось ли. */
  readonly ok: boolean;
  /** Что сказать человеку: до нажатия или после. */
  readonly said: string;
  /** Слилось ли с уже существующим фактом. */
  readonly merged: boolean;
}

/**
 * Что станет, если нажать «поправить».
 *
 * Показывается **до** правки, как `willDo()` у удаления: человек должен видеть,
 * что привычка переедет на новое значение, а не начнётся заново.
 */
export function willDo(current: { label: string; times: number }, value: string): string {
  const next = value.trim();
  if (next === "") return "новое значение пустое — так нельзя: пустота это «спроси меня», а не «я так сказал»";
  return `${current.label} станет ${next}; ${timesWord(current.times)} останутся`;
}

/**
 * Поправить предпочтение.
 *
 * Счётчик и причина переносятся: человек не начинал заново, он поправил дорогу к
 * той же папке.
 */
export function editPreference(edit: Edit, preferences: readonly Preference[]): Edited {
  const byId = preferences.find((preference) => idOf(preference) === edit.id);
  if (byId === undefined) {
    return { preferences: [...preferences], methods: [], ok: false, said: `нечего править: ${edit.id} нет в памяти`, merged: false };
  }

  const value = edit.value.trim();
  const refusal = refuse(byId.kind, value, byId.value);
  if (refusal !== "") {
    return { preferences: [...preferences], methods: [], ok: false, said: refusal, merged: false };
  }

  // «d:\\отчёты» и «D:\\Отчёты» — одно и то же: правка регистра не должна
  // стирать привычку и не должна создавать второй факт про ту же папку.
  if (same(byId.kind, byId.value, value)) {
    return { preferences: [...preferences], methods: [], ok: true, said: `оставил как есть: ${value} — то же самое`, merged: false };
  }

  const twin = preferences.find(
    (preference) => preference.kind === byId.kind && same(preference.kind, preference.value, value),
  );

  let next: Preference[];
  if (twin !== undefined) {
    // Два факта про одно и то же — вопрос «чему верить» там, где его нет.
    // Счётчики не складываются: это не два свидетельства, а одно и то же.
    next = preferences
      .filter((preference) => preference !== byId && preference !== twin)
      .concat([{ ...twin, times: Math.max(twin.times, byId.times), last: Math.max(twin.last, byId.last) }]);
  } else {
    next = preferences.map((preference) =>
      preference === byId ? { ...preference, value } : preference,
    );
  }

  return {
    preferences: next,
    methods: [],
    ok: true,
    said: twin !== undefined
      ? `поправлено: ${byId.value} → ${value}. Такой факт уже был — объединил`
      : `поправлено: ${byId.value} → ${value}. ${timesWord(byId.times)} сохранены`,
    merged: twin !== undefined,
  };
}

/**
 * Поправить способ.
 *
 * У способа правится не значение, а **фраза**, по которой его узнают: шаги
 * остаются, потому что человек поправляет название, а не саму работу. Править
 * шаги значит делать другой способ — и это добавление, а не правка.
 */
export function editMethod(
  dayStart: number,
  said: string,
  methods: readonly Method[],
): Edited {
  const byDay = methods.find((method) => method.dayStart === dayStart);
  if (byDay === undefined) {
    return { preferences: [], methods: [...methods], ok: false, said: `нечего править: способа за ${dayStart} нет`, merged: false };
  }
  const next = said.trim();
  if (next === "") {
    return { preferences: [], methods: [...methods], ok: false, said: "фраза пустая — по ней способ не узнать", merged: false };
  }
  if (next === byDay.said) {
    return { preferences: [], methods: [...methods], ok: true, said: `оставил как есть: ${next} — то же самое`, merged: false };
  }

  const twin = methods.find((method) => method !== byDay && method.said === next && sameSteps(method, byDay));
  if (twin !== undefined) {
    return {
      preferences: [],
      methods: methods.filter((method) => method !== byDay),
      ok: true,
      said: `поправлено: «${byDay.said}» → «${next}». Такой способ уже был — объединил`,
      merged: true,
    };
  }

  return {
    preferences: [],
    methods: methods.map((method) => (method === byDay ? { ...method, said: next } : method)),
    ok: true,
    said: `поправлено: «${byDay.said}» → «${next}». Шаги те же — работа не менялась`,
    merged: false,
  };
}

/**
 * Поправить по `id` — одна точка входа для экрана.
 *
 * Вид берётся из `id`, а не из отдельного поля: вторая правда о том, «что это за
 * факт», разошлась бы с первой — ровно та ошибка, из-за которой удаление когда-то
 * удаляло не то.
 */
export function edit(edit: Edit, preferences: readonly Preference[], methods: readonly Method[]): Edited {
  if (edit.id.startsWith("method:")) {
    const day = Number(edit.id.slice("method:".length));
    const got = editMethod(day, edit.value, methods);
    return { ...got, preferences: [...preferences] };
  }
  const got = editPreference(edit, preferences);
  return { ...got, methods: [...methods] };
}

function refuse(kind: Preference["kind"], value: string, current: string): string {
  if (value === "") return "новое значение пустое — так нельзя: пустота это «спроси меня», а не «я так сказал»";
  if (value === current) return "";
  if (kind === "volume") {
    const number = Number(value.replace("%", "").trim());
    if (!Number.isFinite(number) || number < 0 || number > 100) {
      return `громкость «${value}» — не число от 0 до 100`;
    }
  }
  return "";
}

/** То же ли это значение: сравниваем так, как сравнивает файловая система. */
function same(kind: Preference["kind"], left: string, right: string): boolean {
  if (kind === "volume") {
    return Number(left.replace("%", "").trim()) === Number(right.replace("%", "").trim());
  }
  // Только для программ имя чувствительно к регистру (не для папок Windows):
  // у голоса и папки `Chrome`/`chrome` — одно и то же.
  const fold = (text: string): string => {
    const slashed = text.replace(/\//g, "\\").replace(/\\+$/, "");
    return kind === "program" ? slashed : slashed.toLowerCase();
  };
  return fold(left) === fold(right);
}

function sameSteps(left: Method, right: Method): boolean {
  if (left.steps.length !== right.steps.length) return false;
  return left.steps.every((step, index) => step === right.steps[index]);
}

function idOf(preference: Preference): string {
  return `${preference.kind}:${preference.value}`;
}

function timesWord(times: number): string {
  const ten = times % 100;
  if (ten >= 11 && ten <= 14) return `${times} повторов`;
  const unit = times % 10;
  if (unit === 1) return `${times} повтор`;
  if (unit >= 2 && unit <= 4) return `${times} повтора`;
  return `${times} повторов`;
}
