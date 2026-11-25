/**
 * Шаг 291: таблица заимствований — что, откуда, зачем, лицензия.
 *
 * Шаг 290 собрал таблицу приёмов. Не хватало одной колонки, и она самая
 * неприятная: **лицензия**. Не потому, что кто-то будет судиться из-за «одного
 * поля как входа», а потому что разница между «взяли приём» и «взяли код»
 * решается именно здесь — и решается **молча**, если колонки нет.
 *
 * Правило: **приём не имеет лицензии, код имеет.** В таблице у каждой строки
 * стоит `idea` — «взято как идея, кода не брали». Если однажды понадобится взять
 * код, строка меняется на конкретную лицензию, и тогда её проверяет шаг 292.
 *
 * Почему это не формальность:
 *
 *  * **идея и выражение.** Патентное и авторское право защищают выражение, а не
 *    идею. «Одно поле ввода» — идея; файл `palette.ts` из Raycast — выражение;
 *  * **«мы посмотрели и переписали»** — самый частый способ случайно скопировать
 *    структуру, а вместе с ней и лицензию;
 *  * **чужая лицензия прилипает к сборке.** Компонент с GPL в сборке делает
 *    сборку GPL, и это выясняется, когда приложение уже раздают.
 */

/** Откуда взято — и на каком основании. */
export type Basis =
  /** Идея: кода не брали, лицензия источника к нам не относится. */
  | { readonly kind: "idea" }
  /** Взяли код: тогда лицензия обязательна и проверяется (шаг 292). */
  | { readonly kind: "code"; readonly license: License };

/** Лицензии — в терминах совместимости, а не текстом. */
export type License = "mit" | "apache" | "bsd" | "gpl" | "proprietary" | "unknown";

/** Строка таблицы с лицензией. */
export interface Line {
  readonly what: string;
  readonly from: string;
  readonly basis: Basis;
}

/**
 * Наша таблица: все строки — идеи.
 *
 * Это не «удобное допущение», а факт, который проверяется: строки те же, что в
 * шаге 290, и ни одной строки с кодом.
 */
export const LINES: readonly Line[] = [
  { what: "одно поле как вход", from: "Raycast", basis: { kind: "idea" } },
  { what: "зрение по сессии", from: "Windows Copilot", basis: { kind: "idea" } },
  { what: "клавиши по стандарту Windows", from: "Microsoft PowerToys", basis: { kind: "idea" } },
  { what: "правила «когда — тогда»", from: "Home Assistant", basis: { kind: "idea" } },
  { what: "память текстом", from: "Obsidian", basis: { kind: "idea" } },
  { what: "недоступное видно и объяснено", from: "VS Code", basis: { kind: "idea" } },
  { what: "требования для этой машины", from: "Jan, LM Studio", basis: { kind: "idea" } },
  { what: "одно действие запускает всё", from: "Ollama", basis: { kind: "idea" } },
  { what: "локальный контур", from: "Whisper.cpp, Piper", basis: { kind: "idea" } },
];

/**
 * Совместима ли лицензия с бесплатным распространением.
 *
 * `unknown` — не «наверное, можно»: неизвестная лицензия означает «не проверяли»,
 * а непроверенное в сборку не идёт.
 */
export function compatible(license: License): { ok: boolean; said: string } {
  if (license === "mit" || license === "apache" || license === "bsd") {
    return { ok: true, said: `${license}: можно использовать и распространять, сохранив уведомление` };
  }
  if (license === "gpl") {
    return {
      ok: false,
      said: "gpl: сборка становится gpl — для бесплатного приложения это отдельное решение, а не мелочь",
    };
  }
  if (license === "proprietary") {
    return { ok: false, said: "несвободная: распространять вместе с приложением нельзя" };
  }
  return { ok: false, said: "лицензия неизвестна — значит, не проверяли; непроверенное в сборку не идёт" };
}

/** Проверить таблицу целиком. */
export function audit(lines: readonly Line[] = LINES): { ok: boolean; said: string; problems: string[] } {
  const problems: string[] = [];

  for (const line of lines) {
    if (line.basis.kind === "code") {
      const verdict = compatible(line.basis.license);
      if (!verdict.ok) problems.push(`«${line.what}»: ${verdict.said}`);
    }
  }

  const ideas = lines.filter((line) => line.basis.kind === "idea").length;
  const code = lines.length - ideas;

  return {
    ok: problems.length === 0,
    said:
      problems.length === 0
        ? `строк ${lines.length}: идей ${ideas}, кода ${code} — ${code === 0 ? "чужих лицензий в сборке нет" : "все лицензии проверены"}`
        : problems.join("; "),
    problems,
  };
}

/**
 * Что будет, если взять код с такой лицензией.
 *
 * Не «нельзя/можно», а **что изменится**: человек должен видеть цену решения, а
 * не запрет.
 */
export function ifTakeCode(license: License): string {
  if (license === "mit" || license === "apache" || license === "bsd") {
    return "можно: сохраним уведомление об авторстве в разделе «О программе»";
  }
  if (license === "gpl") {
    return "сборка обязана стать gpl: придётся открывать исходники, включая свои изменения";
  }
  if (license === "proprietary") {
    return "нельзя: распространять вместе с приложением права не даёт";
  }
  return "сначала узнать лицензию: «неизвестно» — это «не проверяли»";
}
