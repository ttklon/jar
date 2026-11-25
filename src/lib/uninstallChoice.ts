/**
 * Шаг 305: удаление оставляет данные, если попросили; иначе — чисто.
 *
 * Ошибка, которую делают в обе стороны:
 *
 *  * **удаляем всё молча** — человек теряет память, которую собирал год, и
 *    узнаёт об этом, когда поставит заново;
 *  * **оставляем всё молча** — на диске живут гигабайты моделей, а человек
 *    уверен, что «удалил».
 *
 * Поэтому удаление — **вопрос с двумя ответами и списком**, а не галочка
 * «сохранить данные», которую все пролистывают. Ответ по умолчанию — **оставить
 * данные**: удалить можно потом, вернуть собранную память нельзя.
 *
 * Отдельная тонкость: «данные» — не одно. Память и журнал человек хочет
 * сохранить; модель весом в 4 ГБ он, скорее всего, хочет удалить, но это его
 * решение, а не наше. Модель можно скачать заново, память — нет.
 */

/** Что лежит на диске. */
export interface Item {
  readonly id: "memory" | "journal" | "settings" | "models" | "engine";
  /** Как называется для человека. */
  readonly name: string;
  /** Сколько занимает, МБ. */
  readonly mb: number;
  /** Можно ли получить заново самим. */
  readonly renewable: boolean;
}

/** Всё, что удаление может тронуть. */
export const ITEMS: readonly Item[] = [
  { id: "memory", name: "память: факты и предпочтения", mb: 8, renewable: false },
  { id: "journal", name: "журнал действий", mb: 24, renewable: false },
  { id: "settings", name: "настройки", mb: 1, renewable: false },
  { id: "models", name: "скачанные модели", mb: 4200, renewable: true },
  { id: "engine", name: "движок распознавания", mb: 300, renewable: true },
];

/** Ответ человека. */
export type Choice = "keep" | "wipe";

/**
 * Список для окна удаления.
 *
 * У каждой строки — размер и «можно ли получить заново»: без этого выбор
 * превращается в угадывание.
 */
export function listing(): string[] {
  return ITEMS.map((item) => {
    const again = item.renewable ? "скачается заново" : "восстановить нельзя";
    return `${item.name} — ${format(item.mb)}, ${again}`;
  });
}

/** Сколько освободится и что потеряется при ответе. */
export function preview(choice: Choice): { freeMb: number; lost: string[]; said: string } {
  const touched = choice === "wipe" ? ITEMS : ITEMS.filter((item) => item.renewable);
  const freeMb = touched.reduce((sum, item) => sum + item.mb, 0);
  const lost = choice === "wipe" ? ITEMS.filter((item) => !item.renewable).map((item) => item.name) : [];

  const said =
    choice === "wipe"
      ? `будет удалено всё: освободится ${format(freeMb)}; память и журнал восстановить нельзя`
      : `будет удалено ${touched.length} из ${ITEMS.length}: освободится ${format(freeMb)}; память, журнал и настройки останутся`;

  return { freeMb, lost, said };
}

/**
 * Ответ по умолчанию.
 *
 * Не «потому что так безопаснее», а потому что **асимметрия**: удалить забытое
 * можно в любой момент, вернуть собранную память — нельзя.
 */
export function defaultChoice(): { choice: Choice; why: string } {
  return { choice: "keep", why: "данные останутся: их можно удалить потом, а вернуть собранную память — нельзя" };
}

/**
 * Что останется после удаления.
 *
 * Пустой ответ — тоже ответ: если человек выбрал «удалить всё», мы говорим «ничего
 * не осталось», а не молчим.
 */
export function whatRemains(choice: Choice): string {
  if (choice === "wipe") return "ничего не осталось: папка приложения удалена целиком";
  const kept = ITEMS.filter((item) => !item.renewable).map((item) => item.name);
  return `осталось: ${kept.join(", ")}; удалить можно вручную в папке данных`;
}

/**
 * Куда возвращаются данные при повторной установке.
 *
 * Человек должен знать заранее, что «данные остались» — не навсегда: папка
 * называется, и её видно.
 */
export function whereKept(): string {
  return "%LOCALAPPDATA%\\ZShelper\\data — папка данных, переживает удаление программы";
}

/** МБ или ГБ — читаемо, а не «4200 МБ». */
export function format(mb: number): string {
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb % 1 === 0 ? gb : gb.toFixed(1)} ГБ`;
  }
  return `${mb} МБ`;
}
