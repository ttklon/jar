/**
 * Откат: показать, **что именно** вернётся, до нажатия (шаг 175).
 *
 * Дефект. Шаг 120 связал отчёт с откатом и назвал, какие **шаги** вернуть можно.
 * Но человек нажимает «Вернуть сделанное» и до нажатия не знает, какие **файлы**
 * вернутся: «шаг 2: переместить» — это не «вернётся `D:\Фото\IMG_0001.jpg` на
 * `C:\Фото\IMG_0001.jpg`». Разница не косметическая:
 *
 *  * **куда** вернётся — не помнит никто: шаг «переместить» помнит только пару
 *    путей, и её надо показать;
 *  * **что уже не вернуть** — файл могли убрать руками, и журнал об этом не знает;
 *  * **что вернётся с потерей** — вернуть копию поверх изменённого файла значит
 *    стереть правки, сделанные после;
 *  * **сколько места** — возврат 40 ГБ на диск с 2 ГБ свободного места не
 *    «сюрприз», а известный факт;
 *  * **порядок** — вернуть последнее первым, иначе откат ломает то, что ещё стоит.
 *
 * Правила:
 *
 *  1. **предмет, а не номер шага.** «IMG_0001.jpg: D:\Фото → C:\Фото» — ответ;
 *     «шаг 2» — нет;
 *  2. **пара путей названа целиком** — откуда и куда: именно её и вернут;
 *  3. **чего нет — не обещать.** Файл исчез — «вернуть нельзя: файла уже нет»,
 *     и это видно **до** нажатия;
 *  4. **замена поверх — это потеря**, а не возврат: «вернётся копия, правки
 *     после неё пропадут»;
 *  5. **порядок обратный и он же в списке**, а не подразумевается;
 *  6. **пусто — сказать пусто**: «возвращать нечего» — законный ответ.
 *
 * Модуль не ходит на диск: существование файлов приносит вызывающий. Поэтому
 * правило проверяется без файловой системы.
 */

/** Одна запись журнала отката — то, что нужно списку. */
export interface Entry {
  /** Что вернут: `move` | `rename` | `copy` | `compress` … */
  kind: string;
  /** Откуда (для отката — куда **вернётся**). */
  from: string;
  /** Куда (для отката — откуда **уйдёт**). */
  to: string;
  /** Размер в байтах, если известен: возврат места — тоже факт. */
  bytes?: number;
}

/** Что будет с одной записью. */
export interface Item {
  /** Имя предмета: «IMG_0001.jpg». */
  name: string;
  /** Куда вернётся: `from`. */
  back: string;
  /** Откуда уйдёт: `to`. */
  away: string;
  /** Что сделать — словами. */
  what: string;
  /** Можно ли вернуть. */
  undoable: boolean;
  /** Почему нельзя. Пусто, если можно. */
  refusal: string;
  /** Строка для показа до нажатия. */
  said: string;
}

const NAMES: Readonly<Record<string, string>> = {
  move: "перемещение",
  rename: "переименование",
  copy: "копия",
  compress: "сжатие",
  product: "свёрстанный файл",
  autostart: "запись автозапуска",
  service: "служба",
};

function leaf(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? path;
}

/**
 * Что вернётся по журналу — до нажатия.
 *
 * `exists` — проверка «файл ещё на месте», принесённая снаружи: модуль не читает
 * диск, но и не притворяется, что знает.
 */
export function items(entries: readonly Entry[], exists: (path: string) => boolean): Item[] {
  // Порядок отката — обратный порядку записи: вернуть последнее первым.
  return [...entries].reverse().map((entry) => {
    const name = leaf(entry.from);
    const what = NAMES[entry.kind] ?? entry.kind;
    // Куда вернётся — главное; «откуда уйдёт» печатается, только если оно есть:
    // пустая половина пары читается как «второй путь забыли», а не «его нет».
    const both = entry.to.trim().length > 0 ? `${entry.from} ← ${entry.to}` : entry.from;

    // Записи без пары путей — не возврат файла: автозапуск и службы откатываются
    // иначе, и обещать «вернётся файл» для них нельзя.
    if (entry.kind === "autostart" || entry.kind === "service") {
      return {
        name,
        back: entry.from,
        away: entry.to,
        what,
        undoable: true,
        refusal: "",
        said: `${what}: вернётся ${entry.from}`,
      };
    }

    if (entry.from.trim().length === 0) {
      return {
        name: "",
        back: "",
        away: entry.to,
        what,
        undoable: false,
        refusal: "в журнале нет пути возврата — вернуть некуда",
        said: `${what}: вернуть некуда — в журнале нет пути`,
      };
    }

    if (!exists(entry.from)) {
      return {
        name,
        back: entry.from,
        away: entry.to,
        what,
        undoable: false,
        refusal: `файла ${entry.from} уже нет — вернуть нечего`,
        said: `${name}: вернуть нельзя — файла ${entry.from} уже нет`,
      };
    }

    // Куда вернётся — главное: человек узнаёт место, а не только имя.
    return {
      name,
      back: entry.from,
      away: entry.to,
      what,
      undoable: true,
      refusal: "",
      said: `${name}: ${both} · ${what}`,
    };
  });
}

/** Список для показа: одной строкой на предмет, порядок — обратный. */
export function lines(got: readonly Item[]): string[] {
  return got.map((item) => item.said);
}

/**
 * Что вернётся, а что перезапишет чужое.
 *
 * Отдельно от `items`: «вернётся» и «вернётся поверх изменённого» — разные
 * обещания, и второе человек должен видеть до нажатия, а не узнать по факту.
 */
export interface Overwrite {
  /** Что перезапишется. */
  back: string;
  /** Что при этом пропадёт — словами. */
  loss: string;
}

export function overwrites(got: readonly Item[], exists: (path: string) => boolean): Overwrite[] {
  return got
    .filter((item) => item.undoable && exists(item.back))
    .map((item) => ({
      back: item.back,
      loss: `вернётся поверх: правки в ${item.back} после отката пропадут`,
    }));
}

/**
 * Итог отката: сколько вернётся, сколько нет, сколько места это займёт.
 *
 * Числа, потому что «вернуть можно» без числа — не ответ: 3 из 5, 40 ГБ, и
 * «два файла уже не вернуть» — ответ.
 */
export interface Summary {
  can: number;
  total: number;
  bytes: number;
  said: string;
  /** Есть ли что нажимать. */
  offer: boolean;
}

export function summary(got: readonly Item[], bytes: number): Summary {
  const total = got.length;
  const can = got.filter((item) => item.undoable).length;
  if (total === 0) return { can: 0, total: 0, bytes: 0, said: "возвращать нечего: журнал пуст", offer: false };
  const weight = bytes > 0 ? `, ${human(bytes)}` : "";
  if (can === total) {
    return { can, total, bytes, said: `вернётся всё: ${total} из ${total}${weight}`, offer: true };
  }
  if (can === 0) {
    return {
      can,
      total,
      bytes,
      said: `вернуть нельзя ничего: ${total} ${total === 1 ? "запись" : "записи"} — причины названы`,
      offer: false,
    };
  }
  return {
    can,
    total,
    bytes,
    said: `вернётся ${can} из ${total}: остальные вернуть нельзя, и причины названы${weight}`,
    offer: true,
  };
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} МБ`;
  return `${(mb / 1024).toFixed(2)} ГБ`;
}
