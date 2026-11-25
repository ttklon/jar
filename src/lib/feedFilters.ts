/**
 * Шаг 372: фильтры — сегодня, вчера, только ошибки, только опасные. Без прокрутки.
 *
 * Лента без фильтров через месяц становится непригодной: чтобы найти «что
 * сломалось вчера», человек прокручивает сотню строк. Фильтры — не украшение
 * списка, а способ задать вопрос.
 *
 * Четыре вопроса, и все — те, что задают на самом деле:
 *
 *  * **сегодня / вчера** — «что было только что»;
 *  * **только ошибки** — «что сломалось»;
 *  * **только опасные** — «что моя программа сделала с миром» (удаление,
 *    отправка, оплата — шаг 336).
 *
 * Два правила, без которых фильтры врут:
 *
 *  1. **фильтры складываются**, а не заменяют друг друга: «вчера + ошибки» —
 *     законный вопрос;
 *  2. **пустой результат говорит, что фильтр был**, а не «дел нет»: иначе человек
 *     решит, что ничего не происходило.
 */

/** Род дела. */
export type Risk = "safe" | "dangerous";

/** Дело для фильтра. */
export interface Row {
  readonly id: string;
  /** Когда — миллисекунды. */
  readonly at: number;
  readonly state: "done" | "failed" | "cancelled" | "running";
  readonly risk: Risk;
}

/** Что человек выбрал. */
export interface Filter {
  readonly when: "all" | "today" | "yesterday";
  readonly only: "none" | "failed" | "dangerous";
}

/** Пустой фильтр — всё. */
export const ALL: Filter = { when: "all", only: "none" };

/**
 * Применить фильтр.
 *
 * `now` — миллисекунды; границы суток считаются по местному дню.
 */
export function apply(rows: readonly Row[], filter: Filter, now: number): Row[] {
  return rows
    .filter((row) => {
      if (filter.when === "all") return true;
      const offset = filter.when === "today" ? 0 : -1;
      return dayOf(row.at) === dayOf(now + offset * 86_400_000);
    })
    .filter((row) => {
      if (filter.only === "none") return true;
      if (filter.only === "failed") return row.state === "failed";
      return row.risk === "dangerous";
    });
}

/** Номер дня — без времени. */
export function dayOf(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Что сказать над списком.
 *
 * При пустом результате — «по фильтру ничего», а не «дел нет»: это разные факты, и
 * второй из них ложь.
 */
export function caption(shown: number, total: number, filter: Filter): string {
  if (total === 0) return "дел ещё нет: скажите первое дело";
  if (shown === 0) return `по фильтру «${nameOf(filter)}» ничего; всего дел ${total}`;
  if (filter.when === "all" && filter.only === "none") return `всего ${total}`;
  return `${nameOf(filter)}: ${shown} из ${total}`;
}

/** Имя фильтра по-русски. */
export function nameOf(filter: Filter): string {
  const when = filter.when === "today" ? "сегодня" : filter.when === "yesterday" ? "вчера" : "";
  const only = filter.only === "failed" ? "ошибки" : filter.only === "dangerous" ? "опасные" : "";

  if (when === "" && only === "") return "все";
  if (when === "") return `только ${only}`;
  if (only === "") return when;
  return `${when}, ${only}`;
}

/**
 * Что фильтры не делают.
 *
 * Скрыть неудачное, спрятать опасное, заменить поиск — три способа сделать ленту
 * приятной и бесполезной.
 */
export function notDo(): string[] {
  return [
    "не прячут ошибки по умолчанию: фильтр «только ошибки» — это выбор, а не сокрытие",
    "не заменяют поиск по словам: фильтры сужают, а не ищут",
    "не сбрасываются молча после перезапуска: выбранный фильтр видно над списком",
  ];
}
