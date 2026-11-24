/**
 * Перед запуском внешней программы — что запускается и откуда (шаг 173).
 *
 * Дефект. Рука «запустить программу» показывает путь (`C:\Program Files\…\x.exe`)
 * и подтверждение. Но путь — это **где**, а не **откуда**: одинаково выглядят:
 *
 *  * программа из `Program Files` — ставилась установщиком, подписана;
 *  * программа из `%TEMP%` — распакована из архива минуту назад, и кто её туда
 *    положил, неизвестно;
 *  * программа из `Downloads` — пришла из интернета, и подпись могла не
 *    проверяться;
 *  * программа из `%APPDATA%` — положена каким-то приложением, а не человеком;
 *  * программа из `C:\Windows\System32` — системная, и подменять её нельзя.
 *
 * Правила:
 *
 *  1. **источник называется словом, а не только путём.** «из Program Files»,
 *     «из загрузок», «из временной папки» — разные ответы, и третий обязан
 *     насторожить;
 *  2. **временная папка — самый опасный источник**, и это сказано; `%TEMP%` —
 *     место, куда пишет кто угодно;
 *  3. **имя, а не путь целиком.** Человеку нужно «notepad++.exe», а не сорок
 *     символов до него;
 *  4. **чего не понять — назвать честно.** Диск `E:\` без известной папки —
 *     «на другом диске, откуда — не понять», а не «программа»;
 *  5. **сеть и съёмный носитель — отдельно.** Запуск с `\\server\share` или с
 *     флешки — это другой риск, чем запуск с диска `C:`.
 *
 * Модуль не запускает и не читает диск: он разбирает путь. Поэтому правило
 * проверяется без Windows и без файлов.
 */

/** Откуда программа. */
export type Origin =
  | "program-files"
  | "system"
  | "downloads"
  | "temp"
  | "appdata"
  | "user"
  | "network"
  | "removable"
  | "other";

/** Что сказать человеку про источник. */
export interface Source {
  origin: Origin;
  /** Имя файла — то, что запускается. */
  name: string;
  /** Куда смотреть: папка. */
  folder: string;
  /** Словами: «из Program Files». */
  said: string;
  /** Насторожить ли: временная папка, сеть, съёмный носитель. */
  warn: string;
}

const TEMP_MARKERS = ["\\temp\\", "\\tmp\\", "\\windows\\temp\\", "\\appdata\\local\\temp\\"];

/** Разобрать путь в источник. */
export function origin(path: string): Source {
  const raw = path.trim().replace(/^"+|"+$/g, "").replace(/\//g, "\\");
  const parts = raw.split("\\").filter((part) => part.length > 0);
  const name = parts[parts.length - 1] ?? raw;
  const lower = raw.toLowerCase();

  const make = (got: Origin, folder: string, said: string, warn = ""): Source => ({
    origin: got,
    name,
    folder,
    said,
    warn,
  });

  if (raw.length === 0) {
    return make("other", "", "путь пуст — запускать нечего", "нечего запускать");
  }

  // Сеть: `UNC`-путь начинается с двух слэшей — файл лежит не на этой машине.
  if (raw.startsWith("\\\\")) {
    const server = parts[0] ?? "";
    return make("network", `\\\\${server}`, `с сетевого диска (\\\\${server})`, "программа лежит не на этой машине");
  }

  const drive = /^([A-Za-z]):/.exec(raw)?.[1]?.toUpperCase() ?? "";

  if (TEMP_MARKERS.some((marker) => lower.includes(marker))) {
    return make(
      "temp",
      parts.slice(0, -1).join("\\"),
      "из временной папки",
      "во временную папку пишет кто угодно — откуда файл, по пути не понять",
    );
  }
  if (lower.includes("\\downloads\\") || lower.includes("\\загрузки\\")) {
    return make(
      "downloads",
      parts.slice(0, -1).join("\\"),
      "из загрузок",
      "файл пришёл из интернета: подпись могла не проверяться",
    );
  }
  if (lower.includes("\\program files (x86)\\")) {
    return make("program-files", parts.slice(0, -1).join("\\"), "из Program Files (x86)");
  }
  if (lower.includes("\\program files\\")) {
    return make("program-files", parts.slice(0, -1).join("\\"), "из Program Files");
  }
  if (lower.includes("\\appdata\\")) {
    return make(
      "appdata",
      parts.slice(0, -1).join("\\"),
      "из папки приложения (AppData)",
      "положена программой, а не вами",
    );
  }
  if (drive === "C" && /^C:\\WINDOWS\\(SYSTEM32|SYSWOW64)\\/.test(raw.toUpperCase())) {
    return make("system", parts.slice(0, -1).join("\\"), "системная, из Windows");
  }
  if (drive === "C" && lower.includes("\\windows\\")) {
    return make("system", parts.slice(0, -1).join("\\"), "из папки Windows");
  }
  if (drive === "C" && lower.includes("\\users\\")) {
    return make("user", parts.slice(0, -1).join("\\"), "из вашей папки");
  }
  // Съёмный носитель: диск не `C:` и не системный — чаще всего флешка.
  if (drive.length === 1 && drive !== "C") {
    return make("removable", parts.slice(0, -1).join("\\"), `с диска ${drive}:`, `диск ${drive}: — не системный: проверьте, что это ваш носитель`);
  }
  return make("other", parts.slice(0, -1).join("\\"), "откуда — не понять по пути");
}

/**
 * Строка «что запускается и откуда» — до нажатия.
 *
 * Названы три вещи: имя файла (что), источник словами (откуда) и папка (где
 * посмотреть). Предупреждение — отдельной фразой, а не знаком вопроса в конце.
 */
export function line(source: Source): string {
  const base = `запустится ${source.name} — ${source.said}`;
  const where = source.folder.length > 0 ? ` (${source.folder})` : "";
  return source.warn.length > 0 ? `${base}${where} · ${source.warn}` : `${base}${where}`;
}

/**
 * Стоит ли спрашивать отдельно.
 *
 * Не «всегда»: запуск из `Program Files` — обычная работа. Вопрос нужен там, где
 * источник не даёт оснований доверять: временная папка, сеть, съёмный носитель,
 * неопознанное.
 */
export function needsAsk(source: Source): { ask: boolean; why: string } {
  if (source.origin === "temp") return { ask: true, why: "из временной папки: откуда файл — не понять" };
  if (source.origin === "network") return { ask: true, why: "с сетевого диска: файл не на этой машине" };
  if (source.origin === "removable") return { ask: true, why: "с несистемного диска: проверьте носитель" };
  if (source.origin === "downloads") return { ask: true, why: "из загрузок: пришёл из интернета" };
  if (source.origin === "other") return { ask: true, why: "источник не понять: незнание не разрешение" };
  return { ask: false, why: "" };
}

/**
 * Годится ли файл к запуску по одному имени.
 *
 * Рука берёт `.exe`; ярлык `.lnk` — это ссылка, и её цель не видна, поэтому
 * ярлык — отказ, а не «наверное, то же самое».
 */
export function executable(path: string): { ok: boolean; said: string } {
  const name = origin(path).name.toLowerCase();
  if (name.length === 0) return { ok: false, said: "имя файла пусто — запускать нечего" };
  if (name.endsWith(".lnk")) {
    return { ok: false, said: "ярлык не запускаю: его цель не видна, а запускать надо то, что видно" };
  }
  if (name.endsWith(".exe")) return { ok: true, said: "" };
  if (name.endsWith(".bat") || name.endsWith(".cmd") || name.endsWith(".ps1")) {
    return {
      ok: false,
      said: "это скрипт, а не программа: он исполняется по строкам, и что в нём — по имени не видно",
    };
  }
  return { ok: false, said: `это не .exe (${name}): рука запускает программы, а не файлы данных` };
}
