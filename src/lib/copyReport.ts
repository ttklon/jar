/**
 * Шаг 374: скопировать отчёт одной кнопкой, по-русски и по-человечески.
 *
 * Отчёт копируют **для другого человека**: в поддержку, в чат, в письмо. Значит,
 * он должен читаться без нас: без идентификаторов, без JSON, без путей вида
 * `C:\Users\anna\AppData\...`, которые ничего не говорят и выдают лишнее.
 *
 * Что в отчёте:
 *
 *  * **что просили** — фразой человека;
 *  * **что получилось** — по шагам, с доказательствами;
 *  * **что не получилось** — если было, с причиной;
 *  * **что делать** — если человеку есть что сделать.
 *
 * Чего в отчёте нет: полных путей (только имена папок), секретов (шаг 352),
 * внутренних номеров и «stack trace».
 */

/** Что попадает в отчёт. */
export interface Report {
  /** Фраза человека. */
  readonly said: string;
  /** Когда — «20 ноября, 09:12» или подобное. */
  readonly when: string;
  readonly steps: readonly { readonly name: string; readonly detail: string }[];
  /** Что не получилось — если было. */
  readonly failed?: string;
  /** Что человеку делать. */
  readonly next?: string;
}

/**
 * Отчёт текстом.
 *
 * Собирается как письмо: сначала что просили, потом что вышло, потом что делать.
 */
export function text(report: Report): string {
  const lines = [`Что просили: ${report.said}`, `Когда: ${report.when}`];
  lines.push("Что получилось:");
  if (report.steps.length === 0) lines.push("  — ничего не выполнилось");
  for (const step of report.steps) lines.push(`  — ${step.name}: ${step.detail}`);
  if (report.failed) lines.push(`Что не получилось: ${report.failed}`);
  if (report.next) lines.push(`Что делать: ${report.next}`);
  return lines.join("\n");
}

/**
 * Убрать из пути лишнее.
 *
 * `C:\Users\anna\AppData\Local\ZShelper\data` → `…\ZShelper\data`. Имя
 * пользователя не нужно ни поддержке, ни чату, а вставит человек отчёт — вставит
 * и его.
 */
export function shorten(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== "");
  if (parts.length <= 2) return path;
  return `…${sep(path)}${parts.slice(-2).join(sep(path))}`;
}

/** Разделитель, как в исходном пути. */
function sep(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

/**
 * Куда копировать.
 *
 * Одна кнопка — в буфер обмена, и **сказать**, что скопировано: без этого
 * человек нажимает второй раз и думает, что не сработало.
 */
export function copied(): string {
  return "отчёт скопирован: его можно вставить в чат или письмо как есть";
}

/**
 * Чего в отчёте не бывает.
 *
 * Список — проверка перед копированием, а утечка пути с именем пользователя тут
 * самая частая.
 */
export function audit(report: Report): string[] {
  const problems: string[] = [];
  const body = text(report);

  if (/[A-Za-z]:\\Users\\/i.test(body)) problems.push("в отчёте полный путь с именем пользователя: заменить на короткий вид");
  if (/api[_-]?key|token|пароль|password/i.test(body)) problems.push("в отчёте похоже на секрет: вырезать перед копированием");
  if (/\{[\s\S]*"[\w-]+":/.test(body)) problems.push("в отчёте JSON: человеку в чате он не читается");
  if (/\bat [A-Za-z_$][\w.]*\s*\(/.test(body)) problems.push("в отчёте stack trace: причину надо назвать словами");

  return problems;
}

/**
 * Что отчёт делает полезным для поддержки.
 *
 * Три вещи, без которых в чате начнётся «а какая версия? а что вы нажимали?».
 */
export function essentials(): string[] {
  return ["фраза человека", "шаги с результатом", "что делать дальше — или что уже сделано"];
}
