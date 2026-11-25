/**
 * Шаг 333: условие «только если…» словами человека — точность без кода.
 *
 * «Каждый день в 9 — отчёт о диске, только если место меньше 10 %». Такая фраза
 * должна работать как есть: человек не будет писать выражения и не должен.
 *
 * Ловушка — **порядок слов**. «Только если» может стоять где угодно, а условие
 * бывает и отрицательным: «только если я не в отпуске». И то и другое ломает
 * простой разбор «всё после „только если“».
 *
 * Правило: разбираем **условие целиком**, а если не поняли — спрашиваем, а не
 * создаём правило, которое молча не сработает.
 */

/** Разобранное условие. */
export type Condition =
  | { kind: "diskBelow"; percent: number }
  | { kind: "diskAbove"; percent: number }
  | { kind: "fileCount"; folder: string; op: "more" | "fewer"; count: number }
  | { kind: "notYetDoneToday" }
  | { kind: "unknown"; text: string };

/** Что человек сказал. */
export interface Parsed {
  /** Что делать — без условия. */
  readonly what: string;
  readonly condition: Condition | null;
}

/**
 * Разобрать «только если…».
 *
 * Возвращает условие и **остаток фразы** — дело. Если условие не понято, дело
 * всё равно возвращается: человеку надо увидеть, что мы услышали.
 */
export function parse(text: string): Parsed {
  const match = text.match(/[,;]?\s*только\s+если\s+(.+?)$/i);
  if (!match) return { what: text.trim(), condition: null };

  const said = match[1]!.trim().replace(/[.!?]+$/, "");
  const what = text.slice(0, match.index).trim().replace(/[,;]$/, "");
  return { what, condition: classify(said) };
}

/** Что значит условие. */
export function classify(said: string): Condition {
  const lower = said.toLowerCase().replace(/ё/g, "е");

  const disk = lower.match(/места\s+(?:меньше|мало|меньше\s+чем)\s+(\d{1,2})\s*%|(\d{1,2})\s*%\s+(?:свободн|места)/);
  if (disk) {
    const percent = Number(disk[1] ?? disk[2]);
    return percent >= 1 && percent <= 99 ? { kind: "diskBelow", percent } : { kind: "unknown", text: said };
  }

  const more = lower.match(/места\s+больше\s+(\d{1,2})\s*%|(\d{1,2})\s*%[\s\S]*больше/);
  if (more) return { kind: "diskAbove", percent: Number(more[1] ?? more[2]) };

  const files = lower.match(/(?:файлов|файла)\s+(?:больше|меньше)\s+(\d+)|(больше|меньше)\s+(\d+)\s+файл/);
  if (files) {
    const count = Number(files[1] ?? files[3]);
    const op = lower.includes("больше") === (files[2] === undefined || files[2] === "больше") ? "more" : "fewer";
    return { kind: "fileCount", folder: "любой", op, count };
  }

  if (/сегодня\s+(?:еще\s+)?не\s+(?:было|делал)/i.test(lower)) return { kind: "notYetDoneToday" };

  return { kind: "unknown", text: said };
}

/**
 * Что сказать человеку, если условие не понято.
 *
 * Три примера вместо «не понял»: человеку надо увидеть, что мы умеем.
 */
export function notUnderstood(text: string): string {
  return `не понял условие «${text}». Понимаю так: «только если места меньше 10 %», «только если сегодня ещё не было», «только если в загрузках больше 5 файлов»`;
}

/**
 * Проверка условия — без сети и без побочных эффектов.
 *
 * `null` значит «не знаю» и **не** значит «да»: неизвестное условие не запускает
 * дело (шаг 326 — пропуск с причиной).
 */
export interface Facts {
  /** Свободное место, %. */
  readonly freePercent: number;
  /** Файлов в папке. */
  readonly files: number;
  /** Уже срабатывало сегодня. */
  readonly ranToday: boolean;
}

export function holds(condition: Condition, facts: Facts): boolean | null {
  if (condition.kind === "diskBelow") return facts.freePercent < condition.percent;
  if (condition.kind === "diskAbove") return facts.freePercent > condition.percent;
  if (condition.kind === "fileCount") {
    const op = condition.op;
    return op === "more" ? facts.files > condition.count : facts.files < condition.count;
  }
  if (condition.kind === "notYetDoneToday") return !facts.ranToday;
  return null;
}

/** Строка для списка расписаний: условие по-человечески. */
export function describe(condition: Condition): string {
  if (condition.kind === "diskBelow") return `только если места меньше ${condition.percent} %`;
  if (condition.kind === "diskAbove") return `только если места больше ${condition.percent} %`;
  if (condition.kind === "fileCount") {
    return `только если ${condition.op === "more" ? "больше" : "меньше"} ${condition.count} файлов`;
  }
  if (condition.kind === "notYetDoneToday") return "только если сегодня ещё не было";
  return `условие не понято: «${condition.text}»`;
}
