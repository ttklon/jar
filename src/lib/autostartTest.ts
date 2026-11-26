/**
 * Шаг 450: тест — автозапуск включается и выключается, запись одна, без дублей.
 *
 * `autostart.rs` (Rust) пишет в реестр; правила — в `autostartChoice` (шаг 443).
 * Здесь — **проверка жизненного цикла целиком**, на поддельном реестре:
 *
 *  1. выключен → записи нет;
 *  2. включили → ровно одна;
 *  3. включили **ещё раз** → по-прежнему одна (самый частый дефект: каждая
 *     установка/обновление дописывает новую строку, и при входе запускается
 *     несколько копий);
 *  4. выключили → записи нет;
 *  5. включили после выключения → одна, а не две.
 *
 * Поддельный реестр — не «чтобы проще»: настоящий нельзя проверить в тесте, а
 * логика `add/delete/query` в Rust уже проверена своими тестами. Здесь проверяется
 * **поведение с точки зрения человека**: сколько копий запустится при входе.
 */

/** Строка реестра. */
export interface Entry {
  readonly name: string;
  readonly command: string;
}

/** Поддельный реестр. */
export interface Registry {
  readonly entries: Entry[];
}

/** Имя записи — одно на программу, без версии в имени. */
export const ENTRY_NAME = "ZShelper";

/** Команда запуска: путь в кавычках и тихий старт. */
export function command(target: string): string {
  return `"${target}" --minimized`;
}

/**
 * Включить.
 *
 * Идемпотентно: повторный вызов не добавляет вторую строку. Это и есть проверка
 * «без дублей».
 */
export function enable(registry: Registry, target: string): { registry: Registry; said: string } {
  const exists = registry.entries.find((entry) => entry.name === ENTRY_NAME);
  const line = command(target);

  if (exists !== undefined) {
    if (exists.command === line) return { registry: { entries: [...registry.entries] }, said: "уже включено: запись одна, ничего не меняю" };
    // Путь изменился (переустановили в другую папку) — заменяем, а не добавляем.
    return {
      registry: { entries: registry.entries.map((entry) => (entry.name === ENTRY_NAME ? { name: ENTRY_NAME, command: line } : entry)) },
      said: "путь программы изменился: запись заменена, а не добавлена — иначе при входе запускались бы обе",
    };
  }

  return { registry: { entries: [...registry.entries, { name: ENTRY_NAME, command: line }] }, said: "включено: одна запись" };
}

/**
 * Выключить.
 *
 * Удаляет **все** записи с нашим именем, а не первую: дубли могли остаться от
 * старой версии, и оставить один из них значит «выключил, а оно запускается».
 */
export function disable(registry: Registry): { registry: Registry; said: string } {
  const ours = registry.entries.filter((entry) => entry.name === ENTRY_NAME).length;
  if (ours === 0) return { registry: { entries: [...registry.entries] }, said: "выключено и так: записи нет" };

  return {
    registry: { entries: registry.entries.filter((entry) => entry.name !== ENTRY_NAME) },
    said: ours === 1 ? "выключено: записи нет" : `выключено: убрано ${ours} ${ours === 1 ? "запись" : "записи"} — дубли тоже`,
  };
}

/**
 * Сколько копий запустится при входе.
 *
 * Главное число теста. Больше одной — дефект, и он называется.
 */
export function launches(registry: Registry): { count: number; ok: boolean; said: string } {
  const count = registry.entries.filter((entry) => entry.name === ENTRY_NAME).length;
  if (count === 0) return { count, ok: true, said: "при входе не запускается" };
  if (count === 1) return { count, ok: true, said: "при входе запустится одна копия" };
  return { count, ok: false, said: `при входе запустится ${count} копии — это дефект: вторая займёт память и будет спорить за горячие клавиши` };
}

/**
 * Что проверяет тест.
 *
 * Пять шагов жизненного цикла — и каждый своими руками.
 */
export function steps(): string[] {
  return [
    "выключен — записи нет",
    "включили — ровно одна",
    "включили ещё раз — по-прежнему одна",
    "выключили — записи нет",
    "включили снова — одна, а не две",
  ];
}

/**
 * Что нельзя делать с записью.
 *
 * Три дефекта, которые встречаются на самом деле.
 */
export function notDo(): string[] {
  return [
    "не дописывать строку при каждом запуске установщика: обновление не должно добавлять вторую копию",
    "не держать версию в имени записи: «ZShelper 1.2», «ZShelper 1.3» — это две копии при входе",
    "не удалять по одной записи, если их несколько: дубли от старой версии останутся",
  ];
}
