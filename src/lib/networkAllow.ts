/**
 * Сетевые адреса: по умолчанию запрещены, кроме явно разрешённых (шаг 172).
 *
 * Дефект. Ядро проверяло **схему** (`http`/`https`) и не смотрело на хост:
 * значит «скачать модель» можно было на любой адрес — свой, чужой, купленный у
 * регистратора на день. Пока это так, слово «локально» — слово.
 *
 * Чего стоит одно только «начинается с http»:
 *
 *  * **`https://huggingface.co@evil.example/x.gguf`** — начинается с https, а
 *    хост — `evil.example`: `user@host` читается как логин, а не как адрес;
 *  * **`https://nothuggingface.co/x`** — сравнение «по началу строки» пропустит
 *    соседа с похожим именем;
 *  * **`https://huggingface.co.evil.example/x`** — то же самое с другой стороны;
 *  * **голый IP** — у него нет имени, которое можно сверить со списком;
 *  * **IDN и unicode** — `huggіngface.co` с кириллической «і» выглядит одинаково
 *    и ведёт куда угодно;
 *  * **порт и путь** — `huggingface.co:8080` и `/x` не должны менять ответ про
 *    хост.
 *
 * Правила:
 *
 *  1. **список хостов, а не «всё, что https».** По умолчанию — отказ, и отказ
 *     называет хост: человеку надо знать, куда его не пустили;
 *  2. **сравнение по границе домена.** `huggingface.co` разрешает
 *     `cdn.huggingface.co` и не разрешает `huggingface.co.evil.example`;
 *  3. **`user@host` — отказ.** Адрес с логином — это не адрес, а способ
 *     показать один хост и открыть другой;
 *  4. **голый IP — отказ**, даже «свой»: свой компьютер называется `localhost`,
 *     и путать его с адресом в интернете нельзя;
 *  5. **разрешение называется и имеет дату.** «Разрешено 2026-11-20, а не
 *     навсегда» — проверяемое обещание;
 *  6. **непонятное — отказ.** Пустой хост, мусор, одни точки — не «наверное,
 *     нормально».
 *
 * Модуль ничего не загружает: он отвечает, можно ли, до того как что-то уйдёт.
 */

/** Разрешённые хосты по умолчанию: ровно те, что называет приложение. */
export const DEFAULT_HOSTS: readonly string[] = ["huggingface.co"];

/** Явное разрешение — с датой, чтобы его можно было проверить. */
export interface Allowed {
  /** Хост, без схемы и пути. */
  host: string;
  /** Когда человек разрешил. */
  at: number;
}

/** Итог проверки адреса. */
export interface Verdict {
  ok: boolean;
  /** Хост, который поняли из адреса. Пусто — не поняли вовсе. */
  host: string;
  /** Почему — словами. Пусто, если `ok`. */
  why: string;
  /** Каким правилом пустили: `default` или разрешением. */
  by: "default" | "granted" | "";
}

/**
 * Разобрать адрес в хост.
 *
 * Отдельно от проверки: разбор — это факт, проверка — это правило. Смешав их,
 * нельзя будет показать «что мы поняли», когда решаем «пускать ли».
 */
export function hostOf(url: string): { host: string; why: string } {
  const text = url.trim();
  if (text.length === 0) return { host: "", why: "адрес пуст" };

  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text);
  if (!scheme) return { host: "", why: "нет схемы http:// или https://" };
  const name = scheme[1]!.toLowerCase();
  if (name !== "http" && name !== "https") {
    return { host: "", why: `схема ${name} не годится: только http и https` };
  }

  const rest = text.slice(scheme[0].length);
  // Всё до первого `/`, `?` или `#` — авторитет: `user@host:port`.
  const authority = rest.split(/[/?#]/, 1)[0]!.trim();
  if (authority.length === 0) return { host: "", why: "в адресе нет хоста" };

  if (authority.includes("@")) {
    // `user@host` — способ показать один хост и открыть другой.
    return { host: "", why: "в адресе есть логин (user@host): такие адреса не принимаю" };
  }

  // Порт отрезаем, но IPv6 в скобках — не порт.
  let host = authority;
  if (host.startsWith("[")) {
    return { host: "", why: "адрес в скобках (IPv6) не принимаю: нужен домен из списка" };
  }
  const colon = host.lastIndexOf(":");
  if (colon >= 0) host = host.slice(0, colon);

  host = host.toLowerCase().replace(/\.$/, "");
  if (host.length === 0) return { host: "", why: "в адресе нет хоста" };

  // Голый IP — не домен: сверять его со списком нечем.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { host, why: "голый IP не принимаю: нужен домен из списка" };
  }
  // Не-латиница в домене: `huggіngface.co` с кириллицей выглядит так же и ведёт
  // куда угодно. Такое не «наверное, то же», а отказ.
  if (!/^[a-z0-9.-]+$/.test(host)) {
    return { host, why: "в адресе не латинские буквы: похожий домен — не тот домен" };
  }
  if (host.includes("..") || host.startsWith(".")) {
    return { host, why: "в адресе пустая часть домена" };
  }
  if (!host.includes(".")) return { host, why: "это не домен: нет точки" };

  return { host, why: "" };
}

/**
 * Внутри ли хост домена — **по границе части**, а не по началу строки.
 *
 * `host === allowed` или `host.endsWith("." + allowed)`. Всё остальное —
 * `huggingface.co.evil.example` и `nothuggingface.co` — не внутри.
 */
export function under(host: string, allowed: string): boolean {
  const a = host.toLowerCase();
  const b = allowed.toLowerCase().replace(/^\.+/, "").replace(/\.$/, "");
  if (b.length === 0) return false;
  return a === b || a.endsWith(`.${b}`);
}

/**
 * Пускать ли адрес.
 *
 * Порядок: разбор (не понять — отказ), явные разрешения (слово человека), список
 * по умолчанию. Разрешение не расширяет список по умолчанию — оно называется в
 * ответе, чтобы человек видел, почему прошло.
 */
export function allow(url: string, granted: readonly Allowed[] = [], defaults: readonly string[] = DEFAULT_HOSTS): Verdict {
  const parsed = hostOf(url);
  if (parsed.why.length > 0) {
    return { ok: false, host: parsed.host, why: parsed.why, by: "" };
  }

  for (const item of granted) {
    if (under(parsed.host, item.host)) {
      return {
        ok: true,
        host: parsed.host,
        why: `разрешено вами ${new Date(item.at).toISOString().slice(0, 10)}`,
        by: "granted",
      };
    }
  }

  if (defaults.some((item) => under(parsed.host, item))) {
    return { ok: true, host: parsed.host, why: "", by: "default" };
  }

  return {
    ok: false,
    host: parsed.host,
    why: `хост ${parsed.host} не в списке разрешённых (${defaults.join(", ")}) — разрешите его, если это правда нужно`,
    by: "",
  };
}

/** Одна строка для экрана. */
export function say(got: Verdict): string {
  if (!got.ok) return `отказ: ${got.why}`;
  if (got.by === "granted") return `${got.host}: ${got.why}`;
  return `${got.host}: в списке разрешённых`;
}

/**
 * Что показать человеку до разрешения нового хоста.
 *
 * Не «разрешить?», а «куда это ведёт»: хост, с чего он начнётся, и что будет,
 * если не разрешать.
 */
export function askBefore(url: string): { host: string; said: string } {
  const parsed = hostOf(url);
  if (parsed.why.length > 0) {
    return { host: parsed.host, said: `адрес не понять: ${parsed.why} — разрешать нечего` };
  }
  return {
    host: parsed.host,
    said: `наружу уйдёт запрос на ${parsed.host}: если это не тот сервер, откажитесь — без разрешения скачивание не начнётся`,
  };
}
