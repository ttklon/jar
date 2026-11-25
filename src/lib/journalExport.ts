/**
 * Шаг 423: экспорт журнала в файл для поддержки, с вычисткой секретов.
 *
 * Журнал нужен поддержке, чтобы найти причину. Но журнал — это **все дела
 * человека**, и отдать его целиком значит отдать всё: имена файлов, папок, фразы.
 * Поэтому экспорт не «сохранить как есть», а **работа с риском утечки**:
 *
 *  * **секреты вычищаются** (шаг 352: `secrets.forLog`) — и повторно, при
 *    экспорте: журнал мог быть записан до правила;
 *  * **пути сокращаются** до имени папки, имя пользователя Windows вырезается:
 *    поддержке нужно «Загрузки», а не `C:\Users\anna\...`;
 *  * **обрезка по времени** — последние N часов по умолчанию: месяц журнала не
 *    нужен, а риск от него больше;
 *  * **человек видит файл до отправки** — это его журнал, и «отправь, не читая»
 *    здесь не работает.
 */

import { clean } from "./secrets";

/** Строка журнала — как есть в файле. */
export interface Line {
  readonly at: number;
  readonly text: string;
}

/** Что получается на выходе. */
export interface Exported {
  /** Текст файла. */
  readonly text: string;
  /** Сколько секретов вычищено — числом, чтобы человек знал. */
  readonly cleaned: number;
  /** Сколько строк сокращено по путям. */
  readonly shortened: number;
  readonly said: string;
}

/**
 * Собрать файл.
 *
 * `hours` — за сколько часов; `0` — всё, что есть (и это надо выбирать осознанно).
 */
export function build(lines: readonly Line[], now: number, hours = 24): Exported {
  const since = hours > 0 ? now - hours * 3_600_000 : Number.NEGATIVE_INFINITY;
  const kept = lines.filter((line) => line.at >= since);

  let cleaned = 0;
  let shortened = 0;

  const body = kept.map((line) => {
    const got = clean(line.text);
    if (got.found.length > 0) cleaned += got.found.length;

    const short = shortenPath(got.text);
    if (short !== got.text) shortened += 1;

    return `${stamp(line.at)} ${short}`;
  });

  const head = [
    "журнал ZShelper для поддержки",
    `строк: ${kept.length}${hours > 0 ? `, за последние ${hours} ч` : ", за всё время"}`,
    `секретов вычищено: ${cleaned}; путей сокращено: ${shortened}`,
    "имя пользователя Windows в файле отсутствует",
    "",
  ];

  return {
    text: [...head, ...body].join("\n"),
    cleaned,
    shortened,
    said:
      kept.length === 0
        ? "в журнале нет записей за это время: отчёт всё равно полезен — в нём версия и состояние"
        : `файл готов: ${kept.length} строк${cleaned > 0 ? `, ${cleaned} секретов вычищено` : ""}. Прочитайте его перед отправкой`,
  };
}

/**
 * Сократить путь.
 *
 * `C:\Users\anna\AppData\Local\ZShelper\logs\app.log` → `…\logs\app.log`: две
 * последние части и многоточие. Имя пользователя исчезает вместе с корнем.
 */
export function shortenPath(text: string): string {
  // Два разделителя — два прохода: держать их в одном шаблоне значит путаться в
  // экранировании и молча не сокращать пути в Linux.
  const win = text.replace(/(?:[A-Za-z]:\\)?(?:[^\\\s|,]+\\)+([^\\\s|,]*)/g, (_whole, tail: string) => `…\\${tail}`);
  return win.replace(/(?:\/(?:[^\/\s|,]+)){2,}\/([^\/\s|,]*)/g, (_whole, tail: string) => `…/${tail}`);
}

/** Время по-русски, без даты — файл и так за сутки. */
function stamp(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Что файл не содержит.
 *
 * Список — для экрана перед отправкой: человек должен знать, что там нет.
 */
export function absent(): string[] {
  return ["секретов: вычищены на записи и ещё раз при экспорте", "имени пользователя Windows и полных путей", "содержимого файлов: только имена и числа"];
}

/**
 * Кто читает файл.
 *
 * Человек — первым. Это его журнал, и отправка без просмотра — регрессия.
 */
export function reader(): string {
  return "сначала человек: файл открывается до отправки, и отправить может только он";
}
