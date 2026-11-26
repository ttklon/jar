/**
 * Шаг 474: changelog генерируется из реестра и коммитов — без ручной скуки.
 *
 * Ручной changelog пишут в пятницу вечером, «примерно как было», и он расходится с
 * кодом в первый же день. Здесь он **собирается** из двух источников, которые
 * иначе рушатся:
 *
 *  * **реестр** — новые и изменившиеся действия с текстом из `data/` (шаг 466 берёт
 *    строку кода, здесь — источник);
 *  * **коммиты** — те, что помечены `feat:` / `fix:` / `break:`; остальные
 *    (`chore:`, `test:`, `docs:`) в changelog для человека не попадают.
 *
 * Генератор **не** решает, что важно, — он собирает, сортирует и запрещает
 * расхождение: одна и та же строка из реестра и из коммита — **одна запись**, а не
 * две.
 */

/** Источник записи. */
export type From = "registry" | "commit";

/** Запись до сборки. */
export interface Entry {
  /** Что изменилось, для человека. */
  readonly what: string;
  readonly from: From;
  /** Вид изменения. */
  readonly kind: "новое" | "исправлено" | "изменилось" | "убрано";
  /** Область реестра (только для `registry`). */
  readonly area?: string;
  /** Префикс коммита (только для `commit`). */
  readonly prefix?: string;
}

/** Виды, которые попадают в changelog (по префиксу коммита). */
export const PREFIXES: Record<string, Entry["kind"]> = { "feat:": "новое", "fix:": "исправлено", "break:": "изменилось" };

/**
 * Прочитать коммит.
 *
 * `chore:`, `test:`, `docs:`, `refactor:` — `null`: в changelog для человека их нет.
 */
export function fromCommit(subject: string): Pick<Entry, "what" | "kind" | "prefix"> | null {
  const match = /^(feat|fix|break|chore|test|docs|refactor):\s*(.+)$/.exec(subject.trim());
  if (match === null) return null;

  const prefix = `${match[1]}:`;
  const kind = PREFIXES[prefix];
  if (kind === undefined) return null;

  return { what: (match[2] ?? "").trim(), kind, prefix };
}

/**
 * Собрать changelog.
 *
 * Порядок: новое → изменилось → исправлено → убрано. Внутри вида — как пришло.
 * Дубль «то же самое из реестра и из коммита» исчезает: реестр точнее, он и
 * остаётся.
 */
export function build(entries: readonly Entry[]): string[] {
  const kindOrder: Entry["kind"][] = ["новое", "изменилось", "исправлено", "убрано"];

  const seen = new Set<string>();
  const kept: Entry[] = [];
  for (const entry of entries) {
    const key = entry.what.toLowerCase().trim();
    if (key === "" || seen.has(key)) continue;
    // Реестр точнее коммита: если оба про одно, остаётся реестр.
    if (entry.from === "commit" && entries.some((other) => other.from === "registry" && other.what.toLowerCase().trim() === key)) continue;
    seen.add(key);
    kept.push(entry);
  }

  return kept
    .sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind))
    .map((entry) => `${entry.kind.charAt(0).toUpperCase()}${entry.kind.slice(1)}: ${entry.what}`);
}

/**
 * Сколько записей получилось.
 *
 * Числом — чтобы заголовок «изменений 12» не врал.
 */
export function count(entries: readonly Entry[]): number {
  return build(entries).length;
}

/**
 * Чего генератор не делает.
 *
 * Три запрета; первый — главный.
 */
export function notDo(): string[] {
  return [
    "не придумывает строки, которых нет ни в реестре, ни в коммите",
    "не тащит `chore:`/`test:`/`docs:`: они утопят настоящие строки",
    "не ставит две записи про одно и то же: реестр точнее коммита",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу источников и порядка.
 */
export function checks(): string[] {
  return [
    "из коммитов попадают только `feat:`/`fix:`/`break:`",
    "порядок видов: новое, изменилось, исправлено, убрано",
    "дубль реестр+коммит исчезает, и остаётся реестр",
  ];
}
