/**
 * Шаг 344: самопроверка после обновления — что изменилось на этой машине.
 *
 * Обычная самопроверка (шаг 341) отвечает «всё ли в порядке сейчас». После
 * обновления нужен другой вопрос: **что стало иначе, чем было**. Регрессия,
 * которую видно сразу, — это «до обновления движок работал, после — нет», и без
 * сравнения человек узнаёт об этом через неделю, когда понадобится голос.
 *
 * Сравниваем снимок **до** обновления с состоянием **после**, по пунктам, и
 * разницу называем в трёх видах:
 *
 *  * **стало лучше** — было «нет», стало «да»: об этом можно не говорить;
 *  * **сломалось** — было «да», стало «нет». Это главное: с этого начинается
 *    сообщение, а не с «проверка пройдена»;
 *  * **изменилось** — версия, число моделей: не хуже, но человек должен видеть.
 *
 * Тонкость с первым запуском: сравнивать не с чем — и «сравнения нет» надо
 * назвать, а не показать «всё хорошо» на основании пустоты.
 */

/** Что проверяет самопроверка. */
export type Check = "engine" | "model" | "memory" | "voice" | "hands" | "network";

/** Состояние одного пункта. */
export interface Point {
  readonly check: Check;
  readonly passed: boolean;
  /** Деталь: версия, имя модели, число фактов — что угодно, что полезно сравнить. */
  readonly detail: string;
}

/** Снимок — до или после. */
export type Snapshot = readonly Point[];

/** Что изменилось. */
export type Change =
  | { kind: "broke"; check: Check; detail: string }
  | { kind: "fixed"; check: Check; detail: string }
  | { kind: "changed"; check: Check; detail: string };

/**
 * Сравнить снимки.
 *
 * `before === null` — первый запуск после установки: сравнения нет.
 */
export function compare(before: Snapshot | null, after: Snapshot): { changes: Change[]; said: string } {
  if (before === null) {
    return {
      changes: [],
      said: "сравнивать не с чем: это первый запуск, снимка «до» нет — покажу текущее состояние, а не «всё хорошо»",
    };
  }

  const changes: Change[] = [];
  for (const now of after) {
    const was = before.find((item) => item.check === now.check);
    if (!was) continue;

    if (was.passed && !now.passed) changes.push({ kind: "broke", check: now.check, detail: now.detail });
    else if (!was.passed && now.passed) changes.push({ kind: "fixed", check: now.check, detail: now.detail });
    else if (was.detail !== now.detail) changes.push({ kind: "changed", check: now.check, detail: `было «${was.detail}», стало «${now.detail}»` });
  }

  const broke = changes.filter((change) => change.kind === "broke").length;
  const said =
    changes.length === 0
      ? "после обновления ничего не изменилось: все пункты как были"
      : broke > 0
        ? `после обновления сломалось ${broke} ${plural(broke, "пункт", "пункта", "пунктов")}: ${changes.filter((c) => c.kind === "broke").map((c) => nameOf(c.check)).join(", ")}`
        : `после обновления изменилось ${changes.length}: ничего не сломалось`;

  return { changes, said };
}

/**
 * Что показать человеку.
 *
 * Сломанное — первым и с действием. «Стало лучше» — в конце, одной строкой: это
 * не причина читать сообщение.
 */
export function show(result: { changes: Change[]; said: string }): string[] {
  const broke = result.changes.filter((change) => change.kind === "broke");
  const fixed = result.changes.filter((change) => change.kind === "fixed");
  const changed = result.changes.filter((change) => change.kind === "changed");

  const lines = [result.said];
  for (const change of broke) lines.push(`сломалось: ${nameOf(change.check)} — ${change.detail}`);
  for (const change of changed) lines.push(`изменилось: ${nameOf(change.check)} — ${change.detail}`);
  if (fixed.length > 0) lines.push(`стало лучше: ${fixed.map((change) => nameOf(change.check)).join(", ")}`);
  return lines;
}

/**
 * Что делать со сломанным.
 *
 * Ремонт предлагается сразу (шаги 341/342), но **не запускается сам**: человек
 * только что обновился и не ждёт, что программа начнёт что-то переставлять.
 */
export function nextStep(change: Change): string {
  if (change.kind !== "broke") return "ничего делать не нужно";
  if (change.check === "engine") return "переустановить движок: модели и память останутся на месте";
  if (change.check === "model") return "перекачать модель: файл не дошёл или испортился при замене";
  if (change.check === "memory") return "восстановить память из последней копии: копия была сделана до обновления";
  return "открыть журнал ошибок: причина названа там, и там же действие";
}

/** Имя пункта по-русски. */
export function nameOf(check: Check): string {
  const names: Record<Check, string> = {
    engine: "движок",
    model: "модель",
    memory: "память",
    voice: "голос",
    hands: "руки",
    network: "сеть",
  };
  return names[check];
}

/**
 * Когда делать сравнение.
 *
 * Сразу после первого запуска новой версии — до того как человек начнёт
 * работать: если что-то сломалось, лучше узнать до дела, а не посреди.
 */
export function when(): string {
  return "на первом запуске новой версии, до первого дела: регрессия видна сразу, а не через неделю";
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
