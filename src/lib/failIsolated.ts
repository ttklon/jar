/**
 * Шаг 369: чужой сбой не прячет моё дело — изоляция.
 *
 * В ленте дел одно упавшее дело не должно превращаться в «экран ошибки»: если
 * разбор отчёта упал, человек всё равно должен видеть, что уборка загрузок
 * закончилась и что голос ждёт ответа.
 *
 * Почему это не «само собой»: общий рендер ленты падает на первом исключении, и
 * один битый отчёт прячет весь список. А битые отчёты бывают — их пишет та же
 * программа, что и падает.
 *
 * Правила:
 *
 *  1. **сбой одного дела — одна строка** в его месте: «отчёт не читается, вот что
 *     делать»;
 *  2. **соседние дела не страдают** — ни скрытием, ни «упрощением» списка;
 *  3. **сбой виден и не исчезает** — «скрыть нечитаемое» значит потерять отчёт о
 *     том, что случилось.
 */

/** Дело в ленте, как его видит экран. */
export interface Row {
  readonly id: string;
  readonly what: string;
  /** Данные дела прочитались. */
  readonly readable: boolean;
  /** Что за сбой, если не прочиталось. */
  readonly error?: string;
}

/** Что показывает строка. */
export interface Shown {
  readonly id: string;
  readonly text: string;
  /** Строка — это ошибка чтения, а не дело. */
  readonly broken: boolean;
}

/**
 * Отрисовать ленту.
 *
 * `render` падает — но падение ловится здесь, и лента остаётся целой. Это не
 * «try/catch вокруг всего»: каждая строка изолирована.
 */
export function render(rows: readonly Row[], render: (row: Row) => string): Shown[] {
  return rows.map((row) => {
    if (!row.readable) {
      return {
        id: row.id,
        broken: true,
        text: `«${row.what}»: отчёт не читается — ${row.error ?? "причина не записана"}. Остальные дела на месте`,
      };
    }
    try {
      return { id: row.id, text: render(row), broken: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { id: row.id, broken: true, text: `«${row.what}»: не показать — ${message}. Остальные дела на месте` };
    }
  });
}

/**
 * Сколько строк показано из скольких.
 *
 * Счёт нужен, чтобы «одно скрыто» не выглядело как «всё в порядке».
 */
export function coverage(rows: readonly Row[], shown: readonly Shown[]): string {
  const broken = shown.filter((row) => row.broken).length;
  if (broken === 0) return `показано ${shown.length} из ${rows.length}`;
  return `показано ${shown.length - broken} из ${rows.length}, ${broken} ${plural(broken, "дело", "дела", "дел")} не читается`;
}

/**
 * Что делать с нечитаемым.
 *
 * Не «удалить»: отчёт о сбое — единственная запись о том, что случилось.
 */
export function whatToDo(row: Row): string {
  return `«${row.what}»: откройте журнал — там причина; удалять отчёт не нужно, он не мешает остальным`;
}

/**
 * Чего изоляция не делает.
 *
 * Три вещи, которые превращают изоляцию в сокрытие.
 */
export function notDo(): string[] {
  return [
    "не скрывает нечитаемое: «спрятать» значит потерять запись о том, что случилось",
    "не заменяет весь список экраном ошибки: один сбой — одна строка",
    "не «упрощает» ленту, оставляя только удачные дела: именно неудачные человек и ищет",
  ];
}

/** Русское склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
