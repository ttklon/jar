/**
 * Шаг 309: сборка воспроизводима и SBOM на каждый релиз.
 *
 * Два требования, и оба про одно: **человек должен иметь возможность проверить,
 * что мы ему дали**.
 *
 *  * **воспроизводимость** — две сборки одного коммита дают одинаковый бинарник.
 *    Это ломается по мелочам: время сборки внутри файла, порядок файлов в
 *    архиве, путь сборки, случайный порядок зависимостей. Проверка простая:
 *    собрать дважды и сравнить хеши;
 *  * **SBOM** (список компонентов) — все зависимости с версиями и лицензиями,
 *    включая **транзитивные**: человек, у которого из-за зависимости нашли
 *    уязвимость, должен узнать об этом от нас, а не из новостей.
 *
 * SBOM без лицензий бесполезен для вопроса «можно ли это распространять», а без
 * транзитивных зависимостей — для вопроса «что случилось».
 */

/** Компонент в списке. */
export interface Component {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  /** Прямая зависимость или пришла с другой. */
  readonly direct: boolean;
}

/** Итог сборки. */
export interface Build {
  /** Хеш бинарника. */
  readonly hash: string;
  /** Когда собрали — миллисекунды. */
  readonly at: number;
  /** Путь, где собирали: попадает в бинарник чаще, чем думают. */
  readonly path: string;
}

/**
 * Воспроизводима ли сборка.
 *
 * Два хеша — из одного коммита. Разные — ответ не «плохо», а **что именно**
 * разошлось, насколько это возможно понять по метаданным.
 */
export function reproducible(first: Build, second: Build): { ok: boolean; said: string } {
  if (first.hash === second.hash) return { ok: true, said: "две сборки одного коммита совпали побайтно" };

  const reasons: string[] = [];
  if (first.at !== second.at) reasons.push("в бинарник попало время сборки");
  if (first.path !== second.path) reasons.push(`в бинарник попал путь сборки «${first.path}»`);
  if (reasons.length === 0) reasons.push("разница не в метаданных: скорее всего, порядок файлов или случайность в зависимостях");

  return { ok: false, said: `сборки разные: ${reasons.join("; ")}` };
}

/**
 * Чего не хватает в SBOM.
 *
 * Три вещи, из-за которых список компонентов не отвечает на настоящие вопросы:
 * нет транзитивных, нет лицензий, нет версий.
 */
export function sbomProblems(components: readonly Component[]): string[] {
  const problems: string[] = [];
  if (components.length === 0) return ["SBOM пуст — значит, его не собирали"];

  if (!components.some((item) => !item.direct)) {
    problems.push("в списке только прямые зависимости: уязвимость обычно приходит с транзитивной");
  }
  const noLicense = components.filter((item) => item.license.trim() === "" || item.license === "unknown");
  if (noLicense.length > 0) problems.push(`без лицензии ${noLicense.length}: ${noLicense.map((item) => item.name).join(", ")}`);
  const noVersion = components.filter((item) => item.version.trim() === "");
  if (noVersion.length > 0) problems.push(`без версии ${noVersion.length} — такой компонент не найти в базе уязвимостей`);

  return problems;
}

/**
 * Строка SBOM для человека.
 *
 * Не JSON, а строка — чтобы её можно было прочитать глазами в «О программе».
 */
export function line(component: Component): string {
  const kind = component.direct ? "прямая" : "транзитивная";
  return `${component.name} ${component.version} — ${component.license}, ${kind}`;
}

/**
 * Уязвимость в компоненте.
 *
 * Не «критично/не критично» по нашей оценке, а **что человек может сделать**:
 * обновиться, подождать, или это нас не касается, и почему.
 */
export function vulnerable(component: Component, affectsUsed: boolean): string {
  if (!affectsUsed) return `${component.name} ${component.version}: уязвимость в части, которую мы не используем — обновим в плановом порядке`;
  return `${component.name} ${component.version}: уязвимость в используемой части — обновляем в ближайшем релизе, до него не запускаем этот путь`;
}

/** Что прикладываем к релизу — списком, без «и так далее». */
export function attachments(): string[] {
  return [
    "хеш установщика и хеш портативной сборки",
    "SBOM со всеми компонентами, версиями и лицензиями",
    "две сборки одного коммита с совпавшими хешами (подтверждение воспроизводимости)",
    "отчёт проверки на чистой машине",
  ];
}
