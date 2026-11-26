/**
 * Шаг 487: отчёт о покрытии там, где он **не врёт**.
 *
 * Процент покрытия — самый обманчивый показатель в проекте. «Покрытие 94%» звучит
 * как качество, но:
 *
 *  * **исполнение не есть проверка**: тест может вызвать функцию и ничего не
 *    утверждать — покрытие вырастет, доверия не прибавится;
 *  * **100% недостижимо честно**: обработчики ошибок, ветки невозможных состояний,
 *    код для Windows-версий, которой нет;
 *  * **один процент на весь проект** прячет **непокрытый модуль**: 500 файлов по
 *    95% и один по 0% дают прекрасные 94%.
 *
 * Поэтому покрытие считается **по модулю**, а не по проекту, и у него есть два
 * числа: покрыто строк и **сколько из них утверждают** (есть `expect`).
 */

/** Покрытие одного модуля. */
export interface Cover {
  /** Путь модуля. */
  readonly path: string;
  /** Всего строк. */
  readonly lines: number;
  /** Покрыто строк. */
  readonly hit: number;
  /** Из покрытых строк — сколько в тестах, где есть хоть одно утверждение. */
  readonly asserted: number;
  /** Есть ли у модуля тест, который его импортирует. */
  readonly importedByTest: boolean;
}

/** Ниже этого — модуль считается непокрытым, и общий процент его не прикрывает. */
export const FLOOR = 0.5;

/**
 * Как выглядит модуль.
 *
 * Три вида: **проверен** (есть утверждения), **исполнен** (вызывали, но не
 * проверяли — худший случай, потому что выглядит хорошо), **не покрыт».
 */
export function verdict(cover: Cover): "проверен" | "исполнен" | "не покрыт" {
  if (cover.lines === 0 || cover.hit === 0) return "не покрыт";
  if (cover.asserted === 0) return "исполнен";
  return "проверен";
}

/**
 * Что не так.
 *
 * Нарушения: модуль ниже порога, модуль исполнен без утверждений, теста нет вовсе.
 */
export function check(covers: readonly Cover[]): string[] {
  const problems: string[] = [];

  for (const cover of covers) {
    const share = cover.lines === 0 ? 0 : cover.hit / cover.lines;
    if (share < FLOOR) problems.push(`${cover.path}: покрыто ${Math.round(share * 100)}% (ниже ${FLOOR * 100}%)`);
    if (!cover.importedByTest) problems.push(`${cover.path}: тест его не импортирует — покрытие может быть случайным`);
    if (cover.hit > 0 && cover.asserted === 0) problems.push(`${cover.path}: строки исполняются, но ни одного утверждения — это не проверка`);
  }

  return problems;
}

/**
 * Честная сводка.
 *
 * Два числа и **худший модуль**: чтобы «94% по проекту» не скрывало нуля.
 */
export function summary(covers: readonly Cover[]): { average: number; worst: string; said: string } {
  const total = covers.reduce((sum, cover) => sum + cover.lines, 0);
  const hit = covers.reduce((sum, cover) => sum + cover.hit, 0);
  const average = total === 0 ? 0 : Math.round((hit / total) * 100);

  const sorted = [...covers].sort((a, b) => a.hit / Math.max(a.lines, 1) - b.hit / Math.max(b.lines, 1));
  const worstCover = sorted[0];
  const worst = worstCover === undefined ? "—" : `${worstCover.path} (${Math.round((worstCover.hit / Math.max(worstCover.lines, 1)) * 100)}%)`;

  const asserted = covers.reduce((sum, cover) => sum + cover.asserted, 0);
  return { average, worst, said: `среднее ${average}%, но смотрите худший: ${worst}. Строк с утверждениями ${asserted} из ${hit}` };
}

/**
 * Где процент не врёт.
 *
 * Три места; в остальных он «звучит», а не значит.
 */
export function whereItWorks(): string[] {
  return [
    "по модулю: видно непокрытый файл, которого не прикрывает общий процент",
    "по **утверждениям**, а не по исполнению: вызов без `expect` — не проверка",
    "в сравнении с прошлым прогоном: упало — значит правка не проверена",
  ];
}

/**
 * Чего покрытие не делает.
 *
 * Три запрета; первый — не гоняться за ста процентами.
 */
export function notDo(): string[] {
  return [
    "не гонится за 100%: обработчики невозможных состояний честно не тестируются",
    "не считает исполнение проверкой",
    "не показывает один процент на проект без худшего модуля рядом",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по трём местам, где процент значит.
 */
export function checks(): string[] {
  return [
    "модуль ниже порога виден по имени, а не растворён в среднем",
    "модуль без утверждений назван «исполнен», а не «проверен»",
    "рядом со средним всегда стоит худший модуль",
  ];
}
