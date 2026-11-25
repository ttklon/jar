/**
 * Шаг 319: удаление — выбор «оставить данные» / «удалить всё» с **явным списком**.
 *
 * Шаг 305 отвечал, что происходит по умолчанию и почему. Здесь — то, чего там
 * нет: **список перед подтверждением**, с путями и размерами, потому что
 * «данные» и «настройки» для человека ничего не значат, а `%LOCALAPPDATA%\…` и
 * «4,1 ГБ моделей» — значат.
 *
 * Отдельно проверяется то, что легче всего испортить: **удаление идёт по списку,
 * а не по маске**. «Удалить папку `ZShelper`» на деле удаляет и то, что рядом
 * положил человек (он мог сохранить туда файл) — а удаление по списку его не
 * тронет.
 */

/** Строка списка: что и где. */
export interface Row {
  /** Что это для человека. */
  readonly what: string;
  /** Полный путь. */
  readonly path: string;
  readonly mb: number;
  /** Восстановить нельзя. */
  readonly precious: boolean;
}

/** Что удалять. */
export const KEEP_DATA: readonly Row[] = [
  { what: "программа и движок", path: "%LOCALAPPDATA%\\ZShelper\\app", mb: 320, precious: false },
  { what: "скачанные модели", path: "%LOCALAPPDATA%\\ZShelper\\models", mb: 4200, precious: false },
  { what: "ярлыки и запись «Программы и компоненты»", path: "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\ZShelper", mb: 0, precious: false },
];

/** Что удалять при «удалить всё». */
export const WIPE_ALL: readonly Row[] = KEEP_DATA.concat([
  { what: "память: факты и предпочтения", path: "%LOCALAPPDATA%\\ZShelper\\data\\memory.md", mb: 8, precious: true },
  { what: "журнал действий", path: "%LOCALAPPDATA%\\ZShelper\\data\\journal.jsonl", mb: 24, precious: true },
  { what: "настройки", path: "%LOCALAPPDATA%\\ZShelper\\data\\settings.json", mb: 1, precious: true },
]);

/** Список для выбранного ответа. */
export function listing(choice: "keep" | "wipe"): readonly Row[] {
  return choice === "wipe" ? WIPE_ALL : KEEP_DATA;
}

/**
 * Подтверждение перед удалением.
 *
 * Считает то, что человеку важно: сколько освободится и что не вернуть.
 */
export function confirm(choice: "keep" | "wipe"): string {
  const rows = listing(choice);
  const mb = rows.reduce((sum, row) => sum + row.mb, 0);
  const precious = rows.filter((row) => row.precious).map((row) => row.what);

  if (precious.length === 0) {
    return `Будет удалено ${rows.length} пунктов, освободится ${size(mb)}. Память и настройки останутся — их можно удалить позже в настройках`;
  }
  return `Будет удалено ${rows.length} пунктов, освободится ${size(mb)}. Безвозвратно: ${precious.join(", ")}`;
}

/**
 * Удаление по списку, а не по маске.
 *
 * Проверка ловит опасное: путь, который является родителем папки данных, —
 * значит, удаление по нему снесёт и чужое.
 */
export function byList(rows: readonly Row[], all: readonly string[]): { remove: string[]; kept: string[] } {
  const wanted = new Set(rows.map((row) => row.path));
  return {
    remove: all.filter((path) => wanted.has(path)),
    kept: all.filter((path) => !wanted.has(path)),
  };
}

/**
 * Опасные строки списка.
 *
 * Маска (`*`), корень диска и папка, внутри которой лежит что-то ещё, — три
 * способа удалить лишнее.
 */
export function dangers(rows: readonly Row[]): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    if (/[*?]/.test(row.path)) problems.push(`«${row.what}»: маска вместо пути — удалит всё, что попадёт`);
    if (/^[A-Za-z]:\\?$/.test(row.path)) problems.push(`«${row.what}»: корень диска`);
    const clean = row.path.replace(/[\\/]+$/, "");
    // Папка ярлыков в «Пуск» — законная цель; опасна папка приложения, где рядом лежат данные человека.
    const isStartMenu = /Start Menu/i.test(clean);
    if (!isStartMenu && clean.endsWith("\\ZShelper")) {
      problems.push(`«${row.what}»: папка приложения целиком — там может лежать файл человека`);
    }
  }
  return problems;
}

/** Размер по-человечески. */
export function size(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb : gb.toFixed(1)} ГБ`;
  }
  return `${mb} МБ`;
}
