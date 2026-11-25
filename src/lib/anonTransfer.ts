/**
 * Шаг 276: импорт памяти анонимный — без путей и имён, если так выбрано.
 *
 * Шаг 266 умеет переносить память файлом. Но файл памяти — это **не только
 * факты**: в нём пути (`D:\\Отчёты`, `C:\\Users\\Иван\\Documents`), имена
 * программ, голосов и, бывает, имя человека внутри пути. Пока файл не покидает
 * свой компьютер, это нормально. Но у переноса бывают и другие адресаты:
 *
 *  * **диагностика.** «Пришлите файл памяти, я посмотрю, почему подставляется не
 *    та папка» — и человек отправляет вместе с этим список своих папок;
 *  * **новый компьютер на работе.** Тот же файл, но память о личных папках там
 *    не нужна вовсе;
 *  * **общий профиль.** Настройки переносят на машину, которой пользуются
 *    несколько человек.
 *
 * Требование «если так выбрано» — главное в шаге. Анонимность нельзя включать
 * молча: человек, который переносит память **для себя**, хочет, чтобы папки
 * остались папками, иначе перенос бесполезен. Поэтому режим — отдельный выбор,
 * и он меняет не только содержимое, но и то, что об этом сказано.
 *
 * Что значит «без путей и имён»:
 *
 *  1. **путь заменяется видом, а не пустой строкой.** `D:\\Отчёты` → «папка»:
 *     пустая строка неотличима от испорченной записи, а вид — честная замена;
 *  2. **имя программы и голоса — тоже личное.** «Голос Алла» — это чужое имя в
 *     файле, который уедет;
 *  3. **счётчики и формы остаются.** «Папка открывалась 4 раза» — это привычка,
 *     а не адрес, и она нужна, чтобы файл был полезен;
 *  4. **обрезанное видно как обрезанное.** В файле стоит пометка, что он
 *     анонимный, — иначе получатель примет «папку» за настоящее имя и будет
 *     искать папку с названием «папка».
 */

import { guard } from "./memoryGuard";
import type { Portable } from "./memoryFile";
import type { Preference } from "./preferences";

/**
 * Что именно вырезается.
 *
 * Не «всё личное» одним флагом: диагностике часто нужны счётчики и виды, но не
 * пути, а переносу на общий компьютер не нужны и имена.
 */
export interface Choice {
  /** Заменить пути видом («папка», «программа»). */
  readonly paths: boolean;
  /** Заменить имена голосов и программ видом. */
  readonly names: boolean;
  /** Оставить ли причины (`why`): «открывали 4 раза» — привычка, а не адрес. */
  readonly why: boolean;
}

/** Молча ничего не вырезается: по умолчанию файл полный. */
export const FULL: Choice = { paths: false, names: false, why: true };

/** Самый строгий режим — для отправки наружу. */
export const ANON: Choice = { paths: true, names: true, why: true };

/** Отметка в файле: получатель должен видеть, что значения заменены. */
export const MARK = "[скрыто]";

/** Что получилось и что об этом сказать. */
export interface Anon {
  readonly file: Portable;
  /** Сколько значений заменено — числом, а не «много». */
  readonly hidden: number;
  readonly said: string;
}

/**
 * Сделать файл памяти анонимным.
 *
 * Заменяется **значение**, а вид и счётчики остаются: иначе файл перестаёт
 * отвечать на вопрос «почему подставляется не то», ради которого его и
 * присылают.
 */
export function hide(file: Portable, choice: Choice): Anon {
  if (!choice.paths && !choice.names) {
    // Выбора нет — файл полный. Не «анонимный с нулём замен»: пометка
    // «анонимный» на полном файле — это ложь в обе стороны. Но **секреты**
    // вычищаются и здесь: анонимность не единственная причина их убирать, и
    // полный файл уезжает в диагностику так же, как анонимный.
    const checked: Portable = {
      ...file,
      preferences: file.preferences.map((preference) => {
        const got = guard(preference);
        return got.secret ? { ...preference, value: got.fact.value } : preference;
      }),
    };
    return { file: checked, hidden: 0, said: "файл полный: пути и имена остались как есть" };
  }

  let hidden = 0;
  const preferences: Preference[] = file.preferences.map((preference) => {
    const next = { ...preference };
    const value = hideValue(preference.kind, preference.value, choice);
    if (value !== preference.value) hidden += 1;
    const why = choice.why ? preference.why : "";
    // Секрет всё равно вычищается: анонимность не отменяет правила 269.
    const checked = guard({ kind: next.kind, value });
    return {
      ...next,
      value: checked.secret ? checked.fact.value : value,
      why: choice.why ? why : "",
    };
  });

  const methods = file.methods.map((method) => {
    if (!choice.paths && !choice.names) return { ...method };
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(method.params)) {
      // Параметр с путём или именем — по имени параметра: `папка`, `файл`,
      // `name`. Угадывать по значению («похоже на путь») значит то скрывать,
      // то нет в зависимости от того, начинается ли путь с диска.
      const personal = choice.paths && isPathKey(key) ? true : choice.names && isNameKey(key);
      params[key] = personal ? MARK : value;
    }
    return {
      ...method,
      // Фраза способа — слова человека, и в ней бывают имена файлов. В строгом
      // режиме остаётся только вид: иначе «переименуй фото Ивана» уедет целиком.
      said: choice.names || choice.paths ? hidePhrase(method.said, choice) : method.said,
      params,
    };
  });

  const exceptions = file.exceptions.map((exception) => {
    const value = hideValue("folder", exception.value, choice);
    if (value !== exception.value) hidden += 1;
    return { ...exception, value, said: "" };
  });

  return {
    file: { ...file, preferences, methods, exceptions },
    hidden,
    said:
      hidden === 0
        ? "скрывать нечего: путей и имён в этом файле не было"
        : `скрыто значений: ${hidden}. Виды и счётчики остались — по ним видно, что было`,
  };
}

/** Можно ли пользоваться файлом после анонимизации: отвечает ли он на вопрос. */
export function usable(file: Portable): { ok: boolean; said: string } {
  const facts = file.preferences.filter((preference) => preference.value !== MARK && preference.value !== "папка");
  if (facts.length === 0 && file.preferences.length > 0) {
    return {
      ok: false,
      said: "в анонимном файле не осталось ни одного пути — по нему нельзя понять, какая папка подставлялась; для разбора нужен полный файл",
    };
  }
  return { ok: true, said: "" };
}

/**
 * Заменить значение по виду.
 *
 * Папка и программа — это адреса и имена, они личные. Громкость и голос: громкость
 * — число, она ничего не выдаёт; голос — имя, его скрываем.
 */
function hideValue(kind: string, value: string, choice: Choice): string {
  if (kind === "folder" && choice.paths) return "папка";
  if (kind === "program" && (choice.names || choice.paths)) return "программа";
  if (kind === "voice" && choice.names) return "голос";
  return value;
}

function hidePhrase(phrase: string, choice: Choice): string {
  let out = phrase;
  if (choice.names) {
    // Имена в фразе — это слова с большой буквы не в начале: «Иван», «Алла».
    out = out.replace(/(^|\s)([А-ЯЁ][а-яё]+)/g, (match, space: string, word: string) =>
      word === phrase.trim().split(/\s+/)[0] ? match : `${space}${MARK}`,
    );
  }
  if (choice.paths) {
    // Путь целиком: буква диска, двоеточие, слэши.
    out = out.replace(/[A-Za-z]:[\\/][^\s,;]*/g, MARK);
  }
  return out;
}

function isPathKey(key: string): boolean {
  const clean = key.toLowerCase();
  return clean.includes("папк") || clean.includes("путь") || clean.includes("файл") || clean.includes("path") || clean.includes("folder");
}

function isNameKey(key: string): boolean {
  const clean = key.toLowerCase();
  return clean.includes("имя") || clean.includes("голос") || clean.includes("программ") || clean.includes("name") || clean.includes("voice");
}
