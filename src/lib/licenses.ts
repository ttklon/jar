/**
 * Лицензии всего встроенного — одной таблицей в приложении (шаг 217).
 *
 * Дефект. «Бесплатно» — обещание, а обещание проверяют списком. Список был
 * раскидан: лицензия модели и движка — на карточке первого запуска, лицензии
 * пакетов — в `docs/DEPENDENCIES.md` (это **предложение**, а не факт) и в
 * SPDX-документе, который никто не открывает. Человек, которому нужно знать,
 * «что тут под Apache, а что под GPL», не мог получить ответ одним взглядом —
 * а значит верил слову «бесплатно».
 *
 * Что здесь:
 *
 *  * **таблица целиком**, отсортированная по числу пакетов: сначала большое;
 *  * **«неизвестно» — категория, а не пустая клетка.** У Cargo в lock лицензии
 *    нет вовсе (не наша небрежность, формат такой). Додумать «MIT» по памяти
 *    крейта значит соврать в документе, который существует ради доверия;
 *  * **копилефт назван громко**: GPL/AGPL/LGPL меняют ответ на «можно ли это
 *    распространять», и прятать их в общем списке нельзя;
 *  * **скачиваемое отдельно сюда не входит**, и это сказано: у модели и движка
 *    свои источник и лицензия на карточке первого запуска.
 *
 * Модуль не читает файлы: данные приходят из `data/licenses.json`, который
 * собирает `tools/licenses.py` из блокировок.
 */

/** Строка таблицы: лицензия и сколько пакетов. */
export interface Row {
  license: string;
  count: number;
}

/** Пакет с лицензией. */
export interface Pack {
  name: string;
  version?: string | null;
  license: string;
  kind: string;
}

/** Файл `data/licenses.json`. */
export interface LicenseData {
  total: number;
  kinds: Record<string, number>;
  unknown: number;
  groups: Row[];
  packages: Pack[];
}

/** Слово для неизвестной лицензии — одно на весь интерфейс. */
export const UNKNOWN = "не объявлено в lock";

/** Лицензии, влияющие на распространение. */
const COPYLEFT = ["GPL", "AGPL", "LGPL", "MPL", "EPL", "CDDL"];

/**
 * Таблица — как её увидит человек.
 *
 * Сортировка по числу пакетов, а не по алфавиту: искать начинают с большого, а
 * «MIT» на 285 строк внизу — это поиск с конца.
 */
export function rows(data: LicenseData): Row[] {
  return [...data.groups].sort((left, right) => right.count - left.count || left.license.localeCompare(right.license));
}

/**
 * Сходится ли таблица.
 *
 * Проверка не формальность: если сумма по группам не равна общему числу, таблица
 * врёт, и человек, сверивший две строки, этого не заметит. Здесь — заметит.
 */
export function agrees(data: LicenseData): { ok: boolean; why: string } {
  const sum = data.groups.reduce((total, row) => total + row.count, 0);
  if (sum !== data.total) {
    return { ok: false, why: `сумма по строкам ${sum}, а всего ${data.total}` };
  }
  const kinds = Object.values(data.kinds).reduce((total, count) => total + count, 0);
  if (kinds !== data.total) {
    return { ok: false, why: `npm и Cargo дают ${kinds}, а всего ${data.total}` };
  }
  return { ok: true, why: "" };
}

/** Копилефт среди встроенного — по имени, а не по догадке. */
export function copyleft(data: LicenseData): Pack[] {
  return data.packages.filter((pack) => COPYLEFT.some((word) => pack.license.startsWith(word)));
}

/**
 * Что сказать про «неизвестно».
 *
 * Молчаливая цифра «487» читается как «всё плохо» или не читается вовсе. Здесь —
 * причина и следствие: формат lock не хранит лицензии, поэтому их и нет; это не
 * значит, что пакеты без лицензии.
 */
export function unknownNote(data: LicenseData): string {
  if (data.unknown === 0) return "";
  return (
    `У ${data.unknown} пакетов лицензии нет в блокировке: Cargo.lock её не хранит вовсе. ` +
    "Это значит «не объявлено здесь», а не «лицензии нет»: крейты под MIT и Apache " +
    "распространены, но подтверждать это по памяти — врать в таблице доверия."
  );
}

/**
 * Подпись под таблицей: откуда числа.
 *
 * Без неё таблица — просто цифры. Источник — то, что делает её проверяемой:
 * человек может открыть lock и сверить.
 */
export function source(data: LicenseData): string {
  const kinds = Object.entries(data.kinds)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(", ");
  return `Из блокировок проекта (${kinds}), а не из памяти. Собрано tools/licenses.py.`;
}

/**
 * Скачиваемое отдельно — не забыть, иначе таблица выглядит полной, а полной не
 * является: модель и движок весят больше всех пакетов вместе и приходят позже.
 */
export function elsewhere(): string {
  return "Модель, движок и распознавание речи сюда не входят: они скачиваются отдельно, и их лицензия — на карточке первого запуска.";
}
