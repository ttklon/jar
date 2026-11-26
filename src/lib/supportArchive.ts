/**
 * Шаг 440: экспорт для поддержки — архив с манифестом, без путей.
 *
 * Отдать один файл журнала мало: поддержке нужны версия, система, состояние
 * модели — иначе начнётся «а какая у вас версия?». Но и «соберите всё, что есть»
 * нельзя: в папке данных лежат память, профили, фразы.
 *
 * Поэтому архив — **с манифестом**, и манифест читается человеком:
 *
 *  * **что внутри** — по пунктам, с числом строк;
 *  * **чего нет** — память, профили, содержимое файлов: их туда не кладут;
 *  * **чем собран** — версия программы и формат архива, чтобы поддержка знала,
 *    что получила.
 *
 * Имя файла — с датой, без имени пользователя: файл может уехать в общий чат.
 */

/** Что кладём в архив. */
export interface Part {
  /** Имя внутри архива. */
  readonly name: string;
  /** Что это, по-русски. */
  readonly about: string;
  /** Размер в строках или байтах — для манифеста. */
  readonly size: number;
}

/** Манифест. */
export interface Manifest {
  readonly version: number;
  readonly app: string;
  readonly parts: readonly Part[];
  readonly text: string;
}

/**
 * Собрать манифест.
 *
 * `parts` — уже подготовленные (с вычищенными секретами и сокращёнными путями).
 * Здесь проверяется только одно: **память и профили не должны попасть внутрь**.
 */
export function manifest(parts: readonly Part[], app: string): { manifest: Manifest; refused: string[] } {
  const forbidden = /памят|профил|memory|profile/i;
  const refused = parts.filter((part) => forbidden.test(part.name) || forbidden.test(part.about)).map((part) => part.name);
  const kept = parts.filter((part) => !refused.includes(part.name));

  const lines = [
    "манифест архива для поддержки",
    `программа: ${app}`,
    `версия формата архива: 1`,
    `файлов: ${kept.length}`,
    "",
    ...kept.map((part) => `— ${part.name}: ${part.about} (${part.size})`),
    "",
    "чего в архиве нет: памяти, профилей, содержимого файлов",
    "имя пользователя Windows и полные пути вырезаны",
  ];

  return {
    manifest: { version: 1, app, parts: kept, text: lines.join("\n") },
    refused,
  };
}

/**
 * Имя архива.
 *
 * Дата и версия: «zshelper-support-2026-11-20.zip». Ни имени, ни машины.
 */
export function fileName(at: Date, app: string): string {
  const version = app.match(/\d+\.\d+\.\d+/)?.[0] ?? "dev";
  const d = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return `zshelper-support-${version}-${d}.zip`;
}

/**
 * Проверить, что архив не содержит путей.
 *
 * Ищем `C:\` и `/home/` в манифесте: если нашли — утечка, и об этом надо сказать
 * **до** сохранения.
 */
export function hasPaths(text: string): boolean {
  return /[A-Za-z]:\\\\|[A-Za-z]:\\[A-Za-z]|\/home\/|\/Users\//.test(text);
}

/**
 * Что архив содержит всегда.
 *
 * Три вещи, без которых поддержка начнёт переписку с вопросов.
 */
export function always(): string[] {
  return ["версия программы и версия формата архива", "журнал за сутки с вычищенными секретами", "состояние модели и диска — числами"];
}

/**
 * Что в архив не попадает никогда.
 *
 * Список — обещание, и оно важнее удобства: файл уходит наружу.
 */
export function neverInside(): string[] {
  return ["память и факты: это личное, и для разбора они не нужны", "профили и разрешения", "содержимое файлов: только имена и размеры"];
}
