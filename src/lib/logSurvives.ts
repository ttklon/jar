/**
 * Шаг 429: журнал читается, даже если база повреждена.
 *
 * Журнал живёт в базе (SQLite). База ломается — питание выключили, диск сбойный,
 * миграция не доехала. И именно тогда журнал нужнее всего: он объясняет, что
 * произошло **до** поломки.
 *
 * Поэтому журнал пишется **двумя способами**:
 *
 *  * в базу — быстро ищется, живёт рядом с делами;
 *  * в файл построчно (`jsonl`) — медленнее ищется, но **читается даже битым**:
 *    одна испорченная строка не портит остальные.
 *
 * Три правила:
 *
 *  * **битая строка пропускается, а не обрывает чтение** — иначе один сбойный
 *    байт в середине делает нечитаемым всё после него;
 *  * **нечитаемая строка называется** — «2 строки испорчены», а не тихо;
 *  * **файл дописывается, а не перезаписывается**: обрыв на записи стоит одной
 *    строки, а не всего журнала.
 */

/** Строка файла. */
export interface Row {
  readonly at: number;
  readonly text: string;
}

/** Что прочитали. */
export interface Read {
  readonly rows: Row[];
  /** Сколько строк не разобралось. */
  readonly broken: number;
  readonly said: string;
}

/**
 * Прочитать файл.
 *
 * `text` — содержимое построчного JSON. Читаем **по строкам**, а не `JSON.parse`
 * целиком: в этом весь смысл.
 */
export function read(text: string): Read {
  const rows: Row[] = [];
  let broken = 0;

  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      if (typeof raw["at"] !== "number" || typeof raw["text"] !== "string") {
        broken += 1;
        continue;
      }
      rows.push({ at: raw["at"] as number, text: raw["text"] as string });
    } catch {
      broken += 1;
    }
  }

  if (rows.length === 0 && broken === 0) return { rows, broken, said: "журнал пуст: записей ещё не было" };
  if (rows.length === 0) return { rows, broken, said: `журнал не читается: ${broken} ${plural(broken, "строка", "строки", "строк")} испорчены` };

  return {
    rows,
    broken,
    said: broken === 0 ? `журнал прочитан: ${rows.length} строк` : `журнал прочитан: ${rows.length} строк, ${broken} испорчены и пропущены`,
  };
}

/**
 * Дописать строку.
 *
 * Возвращает **новое содержимое** файла. Дописывание, а не перезапись: обрыв на
 * записи стоит одной строки.
 */
export function append(text: string, row: Row): { text: string; said: string } {
  const line = JSON.stringify({ at: row.at, text: row.text });
  const next = text === "" || text.endsWith("\n") ? `${text}${line}\n` : `${text}\n${line}\n`;
  return { text: next, said: "записано" };
}

/**
 * Что делать, если база повреждена.
 *
 * Не «переустановите»: сначала достаём журнал — он и есть ответ на «что было».
 */
export function rescue(rows: readonly Row[]): string[] {
  return [
    rows.length === 0
      ? "записей нет: журнал был пуст"
      : `достали ${rows.length} ${plural(rows.length, "запись", "записи", "записей")} из файла — они про то, что было до поломки`,
    "базу можно восстановить из резервной копии отдельно (шаг 349)",
    "журнал в файле не трогаем: он читается и без базы",
  ];
}

/**
 * Что не теряется.
 *
 * Список — обещание при сбое.
 */
export function survives(): string[] {
  return ["строки до сбойной", "строки после сбойной: битая одна, а не всё после неё", "смысл: JSON-строка сама себе граница"];
}

/** Склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
