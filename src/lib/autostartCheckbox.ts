/**
 * Шаг 451: автозапуск с галочкой в настройках и записью без дублей.
 *
 * Правила автозапуска уже есть (`autostartChoice`, шаг 443) и жизненный цикл
 * проверен (`autostartTest`, шаг 450). Здесь — **то, что видит человек**: одна
 * галочка, которая честно показывает состояние из реестра, а не из памяти
 * программы.
 *
 * Главный дефект, который надо исключить: **галочка врёт**. Программа помнит «я
 * включила», а запись кто-то удалил (чистильщик реестра, обновление, другой
 * пользователь). Галочка стоит, а при входе ничего не запускается.
 *
 * Поэтому состояние галочки читается **из реестра при каждом показе**, а не из
 * сохранённого флага. И три состояния, а не два:
 *
 *  * **включено** — запись одна и она наша;
 *  * **выключено** — записи нет;
 *  * **сломано** — записи две или путь не тот: тогда галочка показывает «есть
 *    ошибка» и предлагает исправить.
 */

/** Что в реестре. */
export interface Registry {
  /** Записей с нашим именем. */
  readonly ours: number;
  /** Указывает ли хотя бы одна на текущий exe. */
  readonly rightPath: boolean;
}

/** Что видит человек. */
export interface View {
  readonly checked: boolean;
  readonly broken: boolean;
  readonly hint: string;
}

/**
 * Показать галочку.
 *
 * Три состояния, и третье — обязательное: без него «сломано» выглядит как
 * «включено» или «выключено», и человек не поймёт, почему при входе ничего нет.
 */
export function view(registry: Registry): View {
  if (registry.ours === 0) return { checked: false, broken: false, hint: "при входе в Windows программа не запускается" };
  if (registry.ours > 1) {
    return { checked: true, broken: true, hint: `нашлось ${registry.ours} записей: запустились бы ${registry.ours} копии. Нажмите «исправить» — останется одна` };
  }
  if (!registry.rightPath) return { checked: true, broken: true, hint: "запись есть, но указывает на старую папку программы: при входе ничего не запустится. Нажмите «исправить»" };
  return { checked: true, broken: false, hint: "при входе в Windows программа откроется в трее" };
}

/**
 * Нажали галочку.
 *
 * Включение идемпотентно: сколько раз ни нажимай, запись одна.
 */
export function toggle(registry: Registry, want: boolean): { registry: Registry; said: string } {
  if (want) {
    if (registry.ours === 1 && registry.rightPath) return { registry, said: "уже включено: запись одна, ничего не меняю" };
    return { registry: { ours: 1, rightPath: true }, said: "включено: одна запись, путь верный" };
  }
  if (registry.ours === 0) return { registry, said: "уже выключено: записи нет" };
  return { registry: { ours: 0, rightPath: false }, said: "выключено: записи нет" };
}

/**
 * «Исправить».
 *
 * Отдельная кнопка, а не автоматическое исправление: удаление чужих записей —
 * не то, что делают молча. Но когда человек нажал — остаётся ровно одна.
 */
export function repair(registry: Registry): { registry: Registry; said: string } {
  // «Исправлять нечего» — только когда одна запись и путь верный: `view` и
  // `repair` должны отвечать про одно и то же состояние одинаково.
  if (view(registry).broken === false && registry.ours === 1) return { registry, said: "исправлять нечего" };
  const removed = registry.ours > 1 ? registry.ours - 1 : 0;
  return {
    registry: { ours: 1, rightPath: true },
    said: removed > 0 ? `исправлено: убрано ${removed} лишн${removed === 1 ? "яя" : "их"} ${removed === 1 ? "запись" : "записи"}, осталась одна` : "исправлено: путь в записи обновлён",
  };
}

/**
 * Что проверяет тест.
 *
 * Четыре состояния галочки — и все четыре видны.
 */
export function states(): { name: string; view: View }[] {
  return [
    { name: "выключено", view: view({ ours: 0, rightPath: false }) },
    { name: "включено", view: view({ ours: 1, rightPath: true }) },
    { name: "дубли", view: view({ ours: 2, rightPath: true }) },
    { name: "старый путь", view: view({ ours: 1, rightPath: false }) },
  ];
}

/**
 * Что не делает галочка.
 *
 * Три дефекта, которые встречаются в реальных установщиках.
 */
export function notDo(): string[] {
  return [
    "не показывает сохранённый флаг вместо реестра: запись могли удалить, и галочка врала бы",
    "не исправляет дубли молча при открытии настроек: удаление записей — действие человека",
    "не включает автозапуск при первом запуске программы: только галочкой",
  ];
}
