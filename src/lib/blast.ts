/**
 * Смета последствий: «удалить 340 файлов», а не «удалить папку» (шаг 162).
 *
 * Дефект. Перед опасным шагом человек видел риск словом: «удаление/перезапись —
 * нужно подтверждение». Слово верное и бесполезное: согласие даётся на **объём**,
 * а объём не назван. «Удалить папку» — это может быть и один пустой каталог, и
 * триста сорок файлов с фотографиями. Человек, которому не сказали число,
 * соглашается на неизвестное — то есть не соглашается вовсе.
 *
 * Правила:
 *
 *  1. **число, а не папка.** Смета считается по снимку содержимого: сколько
 *     файлов, сколько байт, какие имена **будут** затронуты;
 *  2. **образцы, а не весь список.** Три имени дают понять «что это за файлы»;
 *     триста строк не читает никто, и они прячут главное — число;
 *  3. **что не попадёт — тоже сказать.** «вложенная папка «архив» не тронется» —
 *     это ответ на страх «а вдруг оно полезет глубже»;
 *  4. **нечего смотреть — сказать честно.** Снимок не получен — это «сколько
 *     затронется, неизвестно», а не «мало»: пустая смета читается как «ничего не
 *     случится»;
 *  5. **за корзиной — восстановимость.** Удаление в корзину обратимо, и это
 *     сказано рядом с числом: иначе число пугает сильнее, чем надо.
 *
 * Модуль не ходит на диск: снимок приносит вызывающий. Поэтому правило
 * проверяется без файловой системы, а тест не зависит от машины.
 */

/** Снимок содержимого: то, что принесла рука «найти/показать». */
export interface Snapshot {
  /** Файлы, которые будут затронуты: путь и размер. */
  files: readonly { path: string; bytes: number }[];
  /** Сколько вложенных папок, в которые шаг **не** пойдёт. */
  skippedFolders?: number;
}

/** Какой шаг и что он делает. */
export type Kind = "delete" | "trash" | "move" | "copy" | "rename" | "overwrite" | "unknown";

/** Смета для показа до нажатия. */
export interface Blast {
  /** Число и размер словами: «340 файлов, 1.8 ГБ». */
  count: string;
  /** Образцы имён: три, чтобы понять, что это за файлы. */
  samples: string[];
  /** Обратимо ли: корзина — да, перемещение — можно вернуть, удаление мимо — нет. */
  undo: string;
  /** Что **не** тронется. Пусто, если нечего сказать. */
  spared: string;
  /** Почему сметы нет. Пусто, если смета есть. */
  unknown: string;
}


/** Байты по-человечески. КБ и МБ — округлением, ГБ — сотыми: 1.83 ГБ читается. */
export function weight(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} МБ`;
  return `${(mb / 1024).toFixed(2)} ГБ`;
}

/** Имя файла без папок: в смете важны имена, а не полные пути. */
function leaf(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

function plural(count: number, one: string, few: string, many: string): string {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return many;
  const last = count % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

/** Слово объёма: «340 файлов, 1.83 ГБ». */
export function countWords(files: readonly { path: string; bytes: number }[]): string {
  const total = files.reduce((sum, file) => sum + Math.max(0, file.bytes), 0);
  if (files.length === 0) return `ни одного файла, 0 Б`;
  return `${files.length} ${plural(files.length, "файл", "файла", "файлов")}, ${weight(total)}`;
}

/** Образцы имён: не больше трёх, и без повторов. */
export function sample(files: readonly { path: string }[], take = 3): string[] {
  const out: string[] = [];
  for (const file of files) {
    const name = leaf(file.path);
    if (out.includes(name)) continue;
    out.push(name);
    if (out.length >= take) break;
  }
  return out;
}

const UNDO: Readonly<Record<Kind, string>> = {
  delete: "удаление мимо корзины не вернуть: файлы пропадут",
  trash: "удаление в корзину: вернуть можно, пока корзину не очистили",
  move: "перемещение обратимо: файлы можно вернуть на место",
  copy: "копирование ничего не теряет: оригиналы останутся",
  rename: "переименование обратимо: имена можно вернуть",
  overwrite: "запись поверх: прежнее содержимое пропадёт",
  unknown: "обратимость шага неизвестна — считайте, что не вернуть",
};

/** Смета по снимку. `kind` — из шага, а не из имени руки: важнее, что делает. */
export function blast(kind: Kind, snapshot: Snapshot | null, why = ""): Blast {
  if (snapshot === null) {
    // Снимка нет — это не «мало файлов», а «неизвестно». Сказать «0 файлов»
    // значит соврать в самую опасную сторону.
    return {
      count: "сколько затронется, неизвестно",
      samples: [],
      undo: UNDO[kind],
      spared: "",
      unknown: why.trim() || "содержимое не удалось посмотреть — число не назову, пока не увижу",
    };
  }

  const files = snapshot.files;
  const samples = sample(files);
  const sparedFolders = snapshot.skippedFolders ?? 0;
  const spared =
    sparedFolders > 0
      ? `вложенные папки не тронутся: ${sparedFolders} ${plural(sparedFolders, "папка", "папки", "папок")} останутся как есть`
      : "";

  return {
    count: countWords(files),
    samples,
    undo: UNDO[kind],
    spared,
    unknown: "",
  };
}

/**
 * Смета одной строкой — то, что читается до нажатия.
 *
 * Порядок не косметичен: сначала **сколько**, потом что именно, потом
 * обратимость. Человек, прочитавший только начало, узнаёт главное.
 */
export function line(got: Blast): string {
  if (got.unknown.length > 0) {
    return `последствия: ${got.count} — ${got.unknown}`;
  }
  const names = got.samples.length > 0 ? `: ${got.samples.join(", ")}` : "";
  const more = got.samples.length === 3 ? " и другие" : "";
  return `последствия: ${got.count}${names}${more} · ${got.undo}`;
}

/**
 * Стоит ли спрашивать отдельно, зная объём.
 *
 * Правило не «всегда»: удаление одного файла в корзину — обычная работа, а
 * триста файлов без корзины — разговор. Порог назван числом, чтобы вопрос не
 * зависел от настроения экрана.
 */
export const MANY_FILES = 20;

export function louder(got: Blast, files: number, kind: Kind): { loud: boolean; why: string } {
  if (got.unknown.length > 0) {
    return { loud: true, why: "объём неизвестен — согласие на неизвестное это не согласие" };
  }
  const lost = kind === "delete" || kind === "overwrite";
  if (lost && files >= MANY_FILES) {
    return {
      loud: true,
      why: `${files} ${plural(files, "файл", "файла", "файлов")} без возврата — это не «удалить папку»`,
    };
  }
  if (lost) return { loud: false, why: "" };
  if (files >= MANY_FILES * 5) {
    return {
      loud: true,
      why: `${files} ${plural(files, "файл", "файла", "файлов")} за раз — много: проверьте, что это те файлы`,
    };
  }
  return { loud: false, why: "" };
}

/**
 * Что за шаг — по реестру руки, а не по глаголу во фразе.
 *
 * Глагол во фразе ненадёжен: «убери это отсюда» — и удаление, и перемещение.
 * Реестр называет руку, рука называет действие.
 */
export function kindOf(registry: string): Kind {
  const text = registry.toLowerCase();
  if (text.includes("корзин")) return "trash";
  if (text.includes("удал") || text.includes("стереть") || text.includes("очист")) return "delete";
  if (text.includes("перемест") || text.includes("перелож")) return "move";
  if (text.includes("скопир")) return "copy";
  if (text.includes("переимен")) return "rename";
  if (text.includes("запис") || text.includes("перезапис")) return "overwrite";
  return "unknown";
}

/**
 * Снимок из параметров шага — то, что уже известно до запуска.
 *
 * Если параметры называют **конкретные** файлы (списком или через `*`), смета
 * считается по ним. Если назван только путь к папке — содержимое неизвестно, и
 * это честно говорится: выдумать «0 файлов» значило бы соврать в самую опасную
 * сторону. Смотреть в диск отсюда нельзя: модуль не ходит в файловую систему.
 */
export function fromParams(params: Readonly<Record<string, string>>): Snapshot | null {
  const named = Object.values(params)
    .flatMap((value) => value.split(/[\n;]+/))
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.includes("."));
  if (named.length === 0) return null;
  return { files: named.map((path) => ({ path, bytes: 0 })) };
}
