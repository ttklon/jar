/**
 * Шаг 466: changelog по-человечески — одна строка на изменение.
 *
 * «Исправлены ошибки и улучшена стабильность» — это не запись об изменении, а
 * отписка. Человек не узнаёт, затронуло ли это его, стоит ли обновляться и
 * сломается ли что-то привычное.
 *
 * Хорошая строка отвечает: **что изменилось** для человека, и **что делать**
 * (ничего / скачать заново / переназначить клавишу).
 *
 * И главное: если изменение **не видно человеку** (рефакторинг, тесты, скорость
 * сборки), его в changelog для человека нет. Оно есть в журнале коммитов, но не
 * здесь — иначе одна настоящая строка тонет в двадцати технических.
 */

/** Строка changelog. */
export interface Line {
  /** Что изменилось — для человека. */
  readonly what: string;
  /** Вид: новое, исправлено, изменилось, убрано. */
  readonly kind: "новое" | "исправлено" | "изменилось" | "убрано";
  /** Что делать человеку; `null` — ничего. */
  readonly todo: string | null;
}

/** Максимум слов в строке — иначе это не строка. */
export const MAX_WORDS = 25;

/**
 * Проверить строку.
 *
 * Нарушения: длинно, без глагола-действия, «улучшена стабильность» без смысла.
 */
export function check(line: Line): string[] {
  const problems: string[] = [];
  const words = line.what.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) problems.push("пустая строка: не сказано, что изменилось");
  if (words.length > MAX_WORDS) problems.push(`строк ${words.length} слов, а больше ${MAX_WORDS} не читают`);

  const empty = /исправлены ошибки|улучшена стабильность|разные улучшения|оптимизация/i;
  if (empty.test(line.what)) problems.push(`«${line.what}» — отписка: что именно изменилось?`);

  if (/\bи\b.*\bи\b/.test(line.what) && words.length > 18) problems.push("в одной строке слишком много «и»: разделить на строки");

  return problems;
}

/**
 * Проверить список.
 *
 * `shown` — видны ли изменения человеку. Технические — не сюда.
 */
export function checkAll(lines: readonly Line[]): string[] {
  const problems: string[] = [];
  for (const line of lines) problems.push(...check(line).map((problem) => `«${line.what}»: ${problem}`));

  const seen = new Set<string>();
  for (const line of lines) {
    const key = line.what.toLowerCase().trim();
    if (seen.has(key)) problems.push(`«${line.what}» повторяется`);
    seen.add(key);
  }

  return problems;
}

/**
 * Строка целиком.
 *
 * Вид первым словом, действие — в конце в скобках: «Исправлено: … (скачать заново)».
 */
export function text(line: Line): string {
  const kind = line.kind.charAt(0).toUpperCase() + line.kind.slice(1);
  return line.todo === null ? `${kind}: ${line.what}` : `${kind}: ${line.what} (${line.todo})`;
}

/**
 * Что попадает в changelog.
 *
 * Только то, что человек увидит или почувствует.
 */
export function belongsToHuman(): string[] {
  return ["новая фраза, которую программа понимает", "изменившееся поведение", "исправленный дефект, который мешал", "то, что человек должен сделать после обновления"];
}

/**
 * Что не попадает.
 *
 * Список — про то, что иначе утопит настоящие строки.
 */
export function notBelongs(): string[] {
  return ["рефакторинг и переименования в коде", "новые тесты и правки тестов", "ускорение сборки и правки CI", "обновление зависимостей без изменения поведения"];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу правил.
 */
export function checks(): string[] {
  return [
    "одна строка на изменение, не длиннее 25 слов",
    "никаких «исправлены ошибки»: что именно изменилось",
    "техническое — в журнал коммитов, а не сюда",
  ];
}
