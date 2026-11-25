/**
 * Шаг 425: нет скрытых сетевых запросов — список разрешённых адресов в сборке.
 *
 * «Мы ничего не отправляем» — это обещание. Чтобы оно стало проверкой, нужен
 * **список**, с которым сверяются: всё, что не в нём, — ошибка сборки.
 *
 * И список должен быть коротким настолько, чтобы его можно было прочитать
 * глазами и понять, зачем каждый адрес:
 *
 *  * `huggingface.co` — скачивание модели, один раз, по кнопке;
 *  * `github.com` / `api.github.com` — проверка обновлений, без тела дела;
 *  * всё остальное — нельзя.
 *
 * Плюс три вещи, без которых список бесполезен:
 *
 *  * **адрес проверяется целиком**, а не «содержит домен»: `huggingface.co.evil.com`
 *    содержит `huggingface.co`;
 *  * **порт и схема тоже** — `http://` вместо `https://` это уже другая сеть;
 *  * **запрос без цели — ошибка**: каждый адрес в списке обязан сказать, зачем он.
 */

/** Разрешённый адрес. */
export interface Allowed {
  /** Домен целиком, без пути. */
  readonly host: string;
  /** Зачем он нужен — по-русски, для человека. */
  readonly why: string;
  /** Когда нужен: только по кнопке или регулярно. */
  readonly when: "по кнопке" | "при проверке обновлений";
}

/** Список, который едет в сборке. */
export const MANIFEST: readonly Allowed[] = [
  { host: "huggingface.co", why: "скачивание модели: один раз, по кнопке и с вашего согласия", when: "по кнопке" },
  { host: "github.com", why: "проверка обновлений: версия, без ваших данных", when: "при проверке обновлений" },
  { host: "api.github.com", why: "то же, что github.com: адрес последнего выпуска", when: "при проверке обновлений" },
];

/**
 * Разрешать ли запрос.
 *
 * Строгое сравнение по хосту: поддомен `cdn.huggingface.co` — **другой** хост, и
 * он должен быть в списке явно, а не «раз уж родитель есть».
 */
export function allow(url: string, manifest: readonly Allowed[] = MANIFEST): { ok: boolean; host: string; said: string } {
  const parsed = parse(url);
  if (parsed === null) return { ok: false, host: "", said: "адрес не разбирается: такой запрос точно не должен уходить" };

  if (parsed.scheme !== "https") {
    return { ok: false, host: parsed.host, said: `только https: «${parsed.scheme}» — это открытая сеть, и адрес мог подменить кто угодно` };
  }

  const found = manifest.find((item) => item.host === parsed.host);
  if (found === undefined) {
    return { ok: false, host: parsed.host, said: `«${parsed.host}» нет в списке разрешённых: скрытых запросов быть не должно` };
  }
  return { ok: true, host: parsed.host, said: `разрешено: ${found.why}` };
}

/** Разобрать адрес: схема, хост. Без пути — путь нам не нужен. */
export function parse(url: string): { scheme: string; host: string } | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(url.trim());
  if (match === null) return null;
  const scheme = match[1]!.toLowerCase();
  const host = match[2]!.toLowerCase().replace(/:\d+$/, "");
  if (host === "" || host.includes("@")) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  return { scheme, host };
}

/**
 * Проверить адреса, найденные в сборке.
 *
 * Возвращает **чужие** — те, что не в списке. Пустой список и есть доказательство.
 */
export function strangers(urls: readonly string[], manifest: readonly Allowed[] = MANIFEST): string[] {
  return urls.filter((url) => !allow(url, manifest).ok);
}

/**
 * Чего список не разрешает.
 *
 * Три соблазна, и все — скрытые запросы.
 */
export function notAllowed(): string[] {
  return [
    "поддомены: «cdn.huggingface.co» — другой хост, и он должен быть в списке явно",
    "http: адрес без шифрования мог подменить кто угодно по пути",
    "адреса без цели: каждый в списке обязан объяснить, зачем он",
  ];
}
