/**
 * Шаг 448: установка и удаление через понятные места, без «мусора».
 *
 * «Мусор после удаления» — это не про размер, а про недоверие: человек удалил
 * программу, а в `AppData`, в реестре и в автозапуске остались её следы. Через
 * месяц он ставит её снова и получает старые настройки, которых не ждал.
 *
 * Поэтому установка и удаление идут **по списку мест**, и список — один:
 *
 *  * **установка**: `Program Files\ZShelper`, ярлык в «Пуск», меню «Установка и
 *    удаление программ», опционально автозапуск;
 *  * **удаление**: всё перечисленное **плюс** вопрос про данные.
 *
 * И главное правило: **данные — отдельный вопрос**. Удалить программу, но
 * сохранить память — нормальное желание. Стереть вместе с памятью — тоже, но
 * это выбор, и он называется вслух.
 */

/** Что установка оставляет. */
export interface Placed {
  readonly what: string;
  readonly where: string;
  /** Удаляется ли при удалении программы. */
  readonly withProgram: boolean;
}

/**
 * Что оставляет установка.
 *
 * `autostart` — только если человек включил: установка не должна ставить
 * автозапуск сама (шаг 443).
 */
export function install(autostart: boolean): Placed[] {
  const places: Placed[] = [
    { what: "программа", where: "C:\\Program Files\\ZShelper", withProgram: true },
    { what: "ярлык в «Пуск»", where: "меню «Пуск»", withProgram: true },
    { what: "запись в «Установка и удаление программ»", where: "реестр, HKLM", withProgram: true },
    { what: "память, журнал и настройки", where: "%APPDATA%\\ZShelper", withProgram: false },
    { what: "скачанная модель", where: "%APPDATA%\\ZShelper\\models", withProgram: false },
  ];

  if (autostart) places.push({ what: "запись автозапуска", where: "реестр, HKCU", withProgram: true });

  return places;
}

/**
 * Удаление.
 *
 * Возвращает два списка: что удалится **точно** и что — **по выбору**. Так
 * человек видит, что «удалить программу» не значит «стереть память».
 */
export function uninstall(autostart: boolean, keepData: boolean): { sure: string[]; choice: string[]; said: string } {
  const places = install(autostart);
  const sure = places.filter((place) => place.withProgram).map((place) => place.what);
  const choice = places.filter((place) => !place.withProgram).map((place) => place.what);

  return {
    sure,
    choice,
    said: keepData
      ? `удалю программу (${sure.length} ${plural(sure.length, "место", "места", "мест")}), а память и модель оставлю: они пригодятся, если поставите снова`
      : `удалю программу и данные: память, журнал, настройки и модель исчезнут — вернуть не получится`,
  };
}

/**
 * Что остаётся после удаления.
 *
 * Если данные сохранены — ничего лишнего: программа удалена, папки данных ждут.
 * Если нет — пусто, и это проверяется.
 */
export function leftovers(keepData: boolean): string[] {
  return keepData
    ? ["папка %APPDATA%\\ZShelper: память и настройки — на случай возврата", "модель: скачивать заново не придётся"]
    : [];
}

/**
 * Что не должно оставаться никогда.
 *
 * Даже если человек оставил данные: запись автозапуска без программы — это
 * ошибка Windows при входе, и её надо убрать в любом случае.
 */
export function neverLeft(autostart: boolean): string[] {
  const out = ["ярлык в «Пуск»", "запись в «Установка и удаление программ»"];
  if (autostart) out.push("запись автозапуска — иначе Windows будет ругаться при входе на несуществующую программу");
  return out;
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу правил.
 */
export function checks(): string[] {
  return [
    "каждое место установки перечислено, и их не больше шести",
    "при удалении программа уходит целиком, а данные — по выбору",
    "запись автозапуска убирается в любом случае",
  ];
}

/** Склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
