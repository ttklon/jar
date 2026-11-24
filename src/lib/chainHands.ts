/**
 * Связать руки в сценарий без ручного JSON (шаг 108).
 *
 * Дефект. Сценарий из нескольких рук существует, но **собирается конфигом**: чтобы
 * «создай папку и перенеси туда отчёт» стало сценарием, человек (или разработчик)
 * пишет JSON, где руками прописаны ключи реестра, порядок и связи параметров.
 *
 *  * **это не для человека**: он говорит «сделай то и то», а не конфиг;
 *  * **порядок держится на памяти**: в JSON порядок есть, но почему он такой — не
 *    сказано, и перестановка двух шагов ломает сценарий молча;
 *  * **связи параметров невидимы**: то, что второй шаг берёт путь из первого,
 *    видно только по совпадению имён;
 *  * **дыра не называется**: недостающий шаг («сначала придётся скачать») никак не
 *    показан — сценарий просто не выполняется.
 *
 * Правило: **связка собирается из сказанного, а дыры называются**.
 *
 *  1. **Фраза → список дел**: «создай папку и перенеси туда отчёт» — это два дела,
 *     а не одно («и» и «потом» разделяют дела; запятая — тоже).
 *  2. **Порядок — из зависимостей, а не из порядка в файле**: шаг, чей параметр
 *     берётся из результата другого, идёт **после** него. Иначе перестановка
 *     ломает сценарий молча.
 *  3. **Связи названы**: «путь берётся из шага 1» — видно, а не угадывается по
 *     совпадению имён.
 *  4. **Дыра — это строка**, а не молчание: чего не хватает для связки, сказано
 *     словами.
 *  5. **Зависимость по кругу — ошибка**, а не «как-нибудь выполним»: сценарий,
 *     который не может начаться, не начинается.
 *
 * Почему не «оставить JSON». JSON — хороший формат **хранения**; плохой формат
 * просьбы. Человек говорит словами, и ошибка в словах понятна, а ошибка в JSON —
 * нет.
 */

/** Дело в связке — то, что пришло из разбора фразы. */
export interface Deed {
  /** Что делать: адрес руки `домен|глагол|объект`. */
  tool: string;
  /** Параметры как есть; значения вида `{from: 0}` — ссылка на шаг 0. */
  params: Record<string, string>;
  /** Словами — для показа человеку. */
  said: string;
}

/** Связка: дела по порядку и названные связи. */
export interface Chain {
  steps: Deed[];
  /** Связи: «параметр `to` шага 2 берётся из шага 1». */
  links: { step: number; param: string; from: number }[];
  /** Чего не хватает — словами. Пусто — связка полна. */
  gaps: string[];
}

/**
 * Разделить сказанное на дела.
 *
 * «И», «потом», «затем» и запятая разделяют дела. НО: «и» внутри названия
 * («файлы и папки») — не разделитель; поэтому делим только там, где после
 * разделителя начинается глагол из известных рук (его передают явно).
 */
export function split(phrase: string, verbs: readonly string[]): string[] {
  if (verbs.length === 0) return [phrase.trim()].filter((part) => part.length > 0);
  // Граница — пробелы, а не `\b`: в JavaScript `\b` считается по латинице и с
  // кириллицей не работает вовсе (проверено тестом: «и» не делило фразу).
  const parts = phrase.split(/\s*(?:[,;]|(?<=^|\s)(?:и|потом|затем|после)(?=\s|$))\s*/u);
  const out: string[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (text.length === 0) continue;
    // Часть без глагола — продолжение предыдущего дела, а не отдельное дело:
    // «файлы и папки» не должно стать двумя делами.
    const startsWithVerb = verbs.some((verb) =>
      new RegExp(`^${verb}(?=\\s|$)`, "u").test(text),
    );
    if (!startsWithVerb && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}, ${text}`;
      continue;
    }
    out.push(text);
  }
  return out;
}

/**
 * Порядок по зависимостям.
 *
 * Ссылка — значение параметра вида `@1` (шаг 1). Порядок **из зависимостей**, а
 * не из порядка массива: иначе перестановка двух дел ломает сценарий молча.
 */
export function order(deeds: readonly Deed[]): { steps: Deed[]; links: Chain["links"]; gaps: string[] } {
  const links: Chain["links"] = [];
  const gaps: string[] = [];
  const need = new Map<number, Set<number>>();

  deeds.forEach((deed, index) => {
    for (const [param, value] of Object.entries(deed.params)) {
      const ref = /^@(\d+)$/u.exec(value);
      if (ref === null) continue;
      const from = Number(ref[1]);
      if (Number.isNaN(from) || from === index || from < 0 || from >= deeds.length) {
        gaps.push(`шаг ${index + 1}: параметр ${param} ссылается на несуществующий шаг`);
        continue;
      }
      links.push({ step: index, param, from });
      const deps = need.get(index) ?? new Set<number>();
      deps.add(from);
      need.set(index, deps);
    }
  });

  // Топологический порядок: шаг идёт после тех, на кого ссылается.
  const order_: number[] = [];
  const state = new Map<number, "visiting" | "done">();
  let cycle = false;
  const visit = (index: number): void => {
    const mark = state.get(index);
    if (mark === "done") return;
    if (mark === "visiting") {
      // Круг: сценарий, который не может начаться, не начинается.
      cycle = true;
      return;
    }
    state.set(index, "visiting");
    for (const dep of need.get(index) ?? []) visit(dep);
    state.set(index, "done");
    order_.push(index);
  };
  for (let index = 0; index < deeds.length; index += 1) visit(index);

  if (cycle) {
    return { steps: [], links, gaps: [...gaps, "шаги ссылаются друг на друга по кругу — сценарий не начать"] };
  }

  return { steps: order_.map((index) => deeds[index]!).filter(Boolean), links, gaps };
}

/**
 * Собрать связку из сказанного.
 *
 * `resolve` — как фраза превращается в дело; передаётся снаружи, чтобы здесь не
 * было второй копии разбора (шаг 100: разбор один).
 */
export function chain(
  phrase: string,
  resolve: (said: string) => Deed | null,
  verbs: readonly string[],
): Chain & { unknown: string[] } {
  const parts = split(phrase, verbs);
  const deeds: Deed[] = [];
  const unknown: string[] = [];

  for (const part of parts) {
    const deed = resolve(part);
    if (deed === null) {
      // Непонятое — не теряется: оно названо, и связка не притворяется полной.
      unknown.push(part);
      continue;
    }
    deeds.push(deed);
  }

  const ordered = order(deeds);
  return { ...ordered, unknown };
}

/**
 * Что показать человеку до запуска.
 *
 * Связка, которая молчит о своих дырах, выполняется наполовину — и это выясняется
 * по результату.
 */
export function say(got: Chain & { unknown: string[] }): string[] {
  const lines: string[] = [];
  if (got.steps.length === 0) {
    lines.push("связку собрать не из чего — не понял ни одного дела");
  } else {
    lines.push(`дел в связке: ${got.steps.length}`);
    got.steps.forEach((deed, index) => {
      lines.push(`${index + 1}. ${deed.said}`);
    });
  }
  for (const link of got.links) {
    lines.push(`связь: параметр ${link.param} шага ${link.step + 1} берётся из шага ${link.from + 1}`);
  }
  for (const gap of got.gaps) lines.push(`дыра: ${gap}`);
  for (const part of got.unknown) lines.push(`не понял: «${part}»`);
  return lines;
}

/**
 * Безопасна ли связка целиком.
 *
 * Связка опасна, если опасен **любой** её шаг: согласие дают на самое опасное, а
 * не на среднее (шаг 101).
 */
export function risky(risks: readonly string[]): boolean {
  return risks.some((risk) => risk !== "read" && risk !== "write-local");
}
