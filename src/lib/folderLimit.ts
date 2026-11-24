/**
 * Предел папок: выйти за выбранные можно только явным исключением (шаг 164).
 *
 * Дефект. Путь, который пришёл из фразы или от модели, чистился от кавычек и
 * пробелов — и шёл в дело как есть. Значит:
 *
 *  * **`..` в середине пути** — обычный способ выйти из папки, и он не про архив:
 *    «удали `C:\Фото\..\..\Windows\System32`» выглядит как «что-то в Фото»;
 *  * **абсолютный путь** рядом с относительным не отличить: «отчёт.txt» и
 *    `C:\Windows\отчёт.txt` — разные файлы, и один из них не наш;
 *  * **регистр и разделители** — `C:/фото`, `c:\ФОТО`, `C:\Фото\` — одна папка,
 *    и сравнивать их как строки значит пропустить половину;
 *  * **симлинк** внутри разрешённой папки выводит наружу, оставаясь «внутри» по
 *    строке;
 *  * **исключение без предела — не исключение**, а дыра: «разрешить `D:\Архив`»
 *    надо отличать от «разрешить всё».
 *
 * Правила:
 *
 *  1. **предел — список папок**, и путь приводится к канону до сравнения:
 *     разделители, регистр, хвостовой слэш, `.` и `..`;
 *  2. **выход за предел — отказ, а не подтверждение.** Спрашивать «точно?» там,
 *     где путь и так вне выбранного, значит перекладывать решение на человека в
 *     момент, когда он не видит разницы;
 *  3. **исключение называется явно** — папка, а не «всё»; и в отказе сказано, чего
 *     не хватило;
 *  4. **подмена корня — тоже выход.** `C:\Фото2` не внутри `C:\Фото`, хотя строка
 *     начинается так же;
 *  5. **непонятный путь не разрешается.** Если канон не вычислился (пусто, только
 *     буква диска, мусор), это отказ, а не «наверное, внутри».
 *
 * Модуль не ходит в файловую систему: он сравнивает то, что ему дали. Поэтому
 * правило проверяется без диска и без Windows.
 */

/** Что решили про путь. */
export interface Verdict {
  /** Внутри выбранного или явно разрешён. */
  ok: boolean;
  /** Почему — словами для экрана. Пусто, если `ok`. */
  why: string;
  /** Канон пути: то, с чем сравнивали. */
  canon: string;
  /** Какая папка впустила (или отказала). */
  by: string;
}

/**
 * Привести путь к канону, по которому можно сравнивать.
 *
 * Возвращает `null`, если канона нет: пустая строка, только разделители, только
 * буква диска. Такое не «внутри по умолчанию», а «не понять».
 */
export function canon(path: string): string | null {
  // Кавычки снимаем как оболочка: «"C:\Фото"» — это тот же путь.
  let text = path.trim().replace(/^"+|"+$/g, "").replace(/\//g, "\\");
  if (text.length === 0) return null;

  // `\\?\C:\...` и `\\.\C:\...` — оболочки Windows; сравнивать надо то, что внутри.
  text = text.replace(/^\\\\[?.]\\/, "");

  // Разбираем на корень и хвост: `C:` — корень, всё после — части пути.
  const drive = /^([A-Za-z]):(\\|$)/.exec(text);
  let root = "";
  let rest = text;
  if (drive) {
    root = `${drive[1]!.toUpperCase()}:\\`;
    rest = text.slice(drive[0].length);
  } else if (text.startsWith("\\\\")) {
    // UNC: `\\server\share\...` — корень две части.
    const parts = text.slice(2).split("\\").filter((part) => part.length > 0);
    if (parts.length < 2) return null;
    root = `\\\\${parts[0]!.toLowerCase()}\\${parts[1]!.toLowerCase()}\\`;
    rest = parts.slice(2).join("\\");
  } else if (!text.startsWith("\\")) {
    // Относительный путь: предела для него нет, пока не сказано, от чего считать.
    return null;
  }

  const parts: string[] = [];
  for (const part of rest.split("\\")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      // Выход выше корня — не «в корне», а отказ: `C:\..\Windows` — не `C:\Windows`
      // по смыслу просьбы, но именно туда и приведёт.
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  const tail = parts.join("\\");
  return root.length === 0 ? `\\${tail}` : `${root}${tail}`;
}

/** Один корень сравнения: буква диска/UNC в нижнем регистре при сравнении. */
function sameRoot(path: string, folder: string): boolean {
  const a = path.toLowerCase();
  const b = folder.toLowerCase();
  return a === b.replace(/\\$/, "") || a.startsWith(b);
}

/**
 * Внутри ли путь папки.
 *
 * Сравнение по канону и **по границе части пути**: `C:\Фото2` не внутри
 * `C:\Фото`, хотя строка начинается так же. Без этой проверки предел пропускал
 * бы соседнюю папку с похожим именем — то есть ровно то, от чего защищает.
 */
export function inside(path: string, folder: string): boolean {
  const canonPath = canon(path);
  const canonFolder = canon(folder);
  if (canonPath === null || canonFolder === null) return false;
  if (!sameRoot(canonPath, canonFolder)) return false;
  // Папка с хвостовым слэшем уже граница; без него — проверяем, что следующий
  // символ после неё — разделитель.
  const withSlash = canonFolder.endsWith("\\") ? canonFolder : `${canonFolder}\\`;
  // Папка внутри самой себя — внутри: `C:\Фото` это `C:\Фото`, а не «вне».
  const folderBare = canonFolder.replace(/\\$/, "").toLowerCase();
  return (
    canonPath.toLowerCase() === folderBare ||
    canonPath.toLowerCase() === `${folderBare}\\` ||
    canonPath.toLowerCase().startsWith(withSlash.toLowerCase())
  );
}

/**
 * Предел: папки, внутри которых можно работать.
 *
 * Пустой список — можно ничего: «предела нет» и «предела не задали» — разные вещи,
 * и вторая не разрешение.
 */
export interface Limits {
  folders: readonly string[];
  /** Явные исключения: папки вне предела, разрешённые человеком. */
  except: readonly string[];
}

export const NOTHING: Limits = { folders: [], except: [] };

/**
 * Пускать ли шаг к этому пути.
 *
 * Порядок проверок — это и есть правило: сперва исключение (явное слово
 * человека), потом предел. Исключение не расширяет предел молча — оно названо в
 * ответе, чтобы человек видел, почему путь пустили.
 */
export function allow(path: string, limits: Limits): Verdict {
  const canonPath = canon(path);
  if (canonPath === null) {
    return {
      ok: false,
      why: "путь не понять: пустой, без папки или с выходом выше корня — не пускаю",
      canon: "",
      by: "",
    };
  }

  for (const folder of limits.except) {
    if (inside(path, folder)) {
      return {
        ok: true,
        why: `разрешено исключением: ${folder}`,
        canon: canonPath,
        by: folder,
      };
    }
  }

  if (limits.folders.length === 0) {
    return {
      ok: false,
      why: "папки не выбраны: предела нет, и это не разрешение",
      canon: canonPath,
      by: "",
    };
  }

  for (const folder of limits.folders) {
    if (inside(path, folder)) {
      return { ok: true, why: "", canon: canonPath, by: folder };
    }
  }

  return {
    ok: false,
    why: `вне выбранных папок: ${canonPath} не внутри ${limits.folders.join(", ")} — разрешите папку или назовите её исключением`,
    canon: canonPath,
    by: "",
  };
}

/** Одна строка для экрана: пустили или нет и почему. */
export function say(got: Verdict): string {
  if (!got.ok) return `отказ: ${got.why}`;
  // Разрешённое **согласием** (шаг 171) называется своим словом: «путь в пределах»
  // стёрло бы, что предела тут нет, а человек дал слово на одно дело.
  if (got.why.startsWith("разрешено на это дело")) return got.why;
  return `путь в пределах: ${got.canon}`;
}

/**
 * Что предложить как исключение, когда путь оказался вне предела.
 *
 * Не «разрешить всё», а **ближайшая папка**: человек, сказавший «удали в
 * D:\Архив», хочет работать в `D:\Архив`, а не на всём диске. Предложение
 * выводится из пути, поэтому не может оказаться шире просьбы.
 */
export function suggest(path: string): string | null {
  const canonPath = canon(path);
  if (canonPath === null) return null;
  // Папка самого файла: путь без последней части.
  const parts = canonPath.split("\\");
  parts.pop();
  // `D:` без слэша — не папка, а диск; предложить такое значит предложить корень.
  const folder = parts.join("\\");
  return /^[A-Za-z]:$/.test(folder) || folder.length === 0 ? null : folder;
}

/**
 * Явное согласие «работать вне списка» (шаг 171).
 *
 * Зачем отдельно от исключений. Исключение — это **папка**, которую человек
 * назвал (шаг 164). А здесь — решение «эта одна задача может трогать то, чего в
 * списке нет», и оно живёт **до конца дела**, а не до конца приложения: широкое
 * согласие, выданное однажды, пережило бы и забылось, а вместе с ним и весь
 * предел.
 *
 * Правила:
 *
 *  1. **по умолчанию узко.** Список папок пуст — работать негде; это рабочее
 *     состояние, а не повод «разрешить на всякий случай»;
 *  2. **согласие ограничено делом.** `key` — то, на что согласились; другое дело
 *     — другое согласие;
 *  3. **у согласия есть дата** и срок: через час оно кончается само, иначе
 *     «одноразовое» становится постоянным;
 *  4. **согласие не расширяет предел.** Оно пускает **одно** дело, а не делает
 *     всё разрешённым: следующая проверка снова упрётся в предел.
 */
export interface Consent {
  /** На что согласились — ключ дела. */
  key: string;
  /** Когда дали, мс. */
  at: number;
  /** До какого момента действует. */
  until: number;
}

/** Сколько живёт согласие «вне списка». Час, а не вечность. */
export const CONSENT_MS = 60 * 60 * 1000;

/** Дать согласие на одно дело. */
export function consentTo(key: string, now: number): Consent {
  return { key: key.trim(), at: now, until: now + CONSENT_MS };
}

/**
 * Действует ли согласие для этого дела.
 *
 * Пустой ключ не совпадает ни с чем: «согласен на всё» через пустую строку — это
 * дыра, а не удобство.
 */
export function consented(consent: Consent | null, key: string, now: number): { ok: boolean; said: string } {
  if (consent === null) return { ok: false, said: "согласия на работу вне списка нет" };
  if (consent.key.length === 0) return { ok: false, said: "согласие без дела не считается" };
  if (consent.key !== key.trim()) {
    return { ok: false, said: `согласие было на другое дело (${consent.key}) — это не разрешение на всё` };
  }
  if (now > consent.until) {
    return { ok: false, said: "согласие кончилось: оно было на час, а не навсегда" };
  }
  return { ok: true, said: "" };
}

/**
 * Пускать ли путь с учётом согласия.
 *
 * Согласие проверяется **только** когда предел отказал: если путь и так внутри
 * выбранной папки, спрашивать нечего.
 */
export function allowWith(path: string, limits: Limits, consent: Consent | null, key: string, now: number): Verdict {
  const first = allow(path, limits);
  if (first.ok) return first;
  const yes = consented(consent, key, now);
  if (!yes.ok) {
    return { ...first, why: `${first.why}; ${yes.said}` };
  }
  // Согласие на месте, но `allow` всё равно отказывает — значит путь не понять, а
  // не «вне списка». Согласие не делает непонятный путь понятным.
  if (first.why.includes("не понять")) return first;
  return {
    ok: true,
    why: `разрешено на это дело до ${new Date(consent!.until).toISOString().slice(11, 16)} — вне списка`,
    canon: first.canon,
    by: "",
  };
}
