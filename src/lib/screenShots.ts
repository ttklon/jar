/**
 * Шаг 463: скриншот каждого экрана в актуальном состоянии.
 *
 * Скриншот в документации — самый быстрый способ соврать. Кнопка переехала,
 * надпись изменилась, тема стала светлой — а скриншот остался, и человек ищет
 * на экране то, чего нет. Хуже: он решает, что у него старая версия.
 *
 * Два способа не соврать, и оба нужны:
 *
 *  * **скриншот привязан к состоянию экрана**: к версии и к «отпечатку» разметки.
 *    Изменилась разметка — скриншот помечается **устаревшим**, а не остаётся
 *    молча;
 *  * **нет скриншота — так и написано**: «здесь будет снимок экрана», и список
 *    таких мест виден в CI, а не теряется.
 *
 * Проверка не «есть ли файл», а «соответствует ли файл текущему экрану».
 */

/** Скриншот. */
export interface Shot {
  /** Какой экран. */
  readonly screen: string;
  /** Когда снят — миллисекунды. */
  readonly at: number;
  /** Отпечаток разметки, при которой снят. */
  readonly fingerprint: string;
  /** Файл существует? */
  readonly exists: boolean;
}

/** Что говорит проверка. */
export interface Verdict {
  readonly ok: boolean;
  readonly stale: string[];
  readonly missing: string[];
  readonly said: string;
}

/**
 * Проверить.
 *
 * `current` — текущие отпечатки экранов. Сравнение **по отпечатку, а не по
 * дате**: экран могли пересобрать, ничего не изменив, и «старый по дате»
 * скриншот может быть верным.
 */
export function check(shots: readonly Shot[], current: Readonly<Record<string, string>>): Verdict {
  const stale: string[] = [];
  const missing: string[] = [];

  for (const shot of shots) {
    if (!shot.exists) {
      missing.push(shot.screen);
      continue;
    }
    const now = current[shot.screen];
    if (now !== undefined && now !== shot.fingerprint) stale.push(shot.screen);
  }

  const known = new Set(shots.map((shot) => shot.screen));
  for (const screen of Object.keys(current)) {
    if (!known.has(screen)) missing.push(screen);
  }

  if (stale.length === 0 && missing.length === 0) {
    return { ok: true, stale, missing, said: `все ${shots.length} скриншотов соответствуют экранам` };
  }

  const parts: string[] = [];
  if (stale.length > 0) parts.push(`устарели (экран изменился): ${stale.join(", ")} — снять заново`);
  if (missing.length > 0) parts.push(`нет снимка: ${missing.join(", ")} — в документе будет «снимок экрана здесь»`);
  return { ok: false, stale, missing, said: parts.join("; ") };
}

/**
 * Что подписано под скриншотом.
 *
 * Не «главный экран», а «та же версия, что у вас, и та же тема». Подпись с
 * версией объясняет, почему у человека может выглядеть иначе.
 */
export function caption(screen: string, app: string, theme: string): string {
  return `${screen} — ${app}, тема «${theme}»`;
}

/**
 * Что делать с устаревшим.
 *
 * Не «оставим, вроде похоже»: устаревший скриншот убирается или помечается прямо
 * в документе. «Похоже» — это и есть та ложь, от которой защищаемся.
 */
export function onStale(screen: string): string {
  return `снимок экрана «${screen}» устарел: в документе он заменяется на «снимок будет после обновления экрана», а не остаётся как «похожий»`;
}

/**
 * Сколько тем снимать.
 *
 * Две: тёмная и светлая. Каждая следующая — это ещё N скриншотов, которые тоже
 * устареют.
 */
export function themes(): string[] {
  return ["тёмная", "светлая"];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу правил.
 */
export function checks(): string[] {
  return [
    "у каждого скриншота есть отпечаток разметки",
    "изменившийся экран делает скриншот устаревшим, а не «похожим»",
    "отсутствующий скриншот назван, а не пропущен молча",
  ];
}
