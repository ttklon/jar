/**
 * Шаг 407: перенос профиля на новую машину файлом — как в Obsidian.
 *
 * Файл памяти уже есть (`memoryFile`, шаг 266). Но профиль — это не только
 * память: это ещё имя и разрешения (шаг 401). И перенос «как в Obsidian» —
 * значит **один файл, который человек несёт с собой** и который работает без
 * нас: без сервера, без входа, без «подтвердите перенос на почте».
 *
 * Главная сложность не в формате, а в том, что новая машина **другая**:
 *
 *  * папок, на которые выданы разрешения, может не быть — «C:\Users\anna\Загрузки»
 *    на новом компьютере не существует;
 *  * имя пользователя Windows другое, и путь выглядит знакомо, но ведёт не туда;
 *  * модели ещё нет, и первый запуск — про скачивание, а не про профиль.
 *
 * Поэтому перенос честно делит содержимое на три части: что переносится как есть,
 * что нужно переподтвердить и что остаётся на старой машине.
 */

/** Что несём в файле. */
export interface Bundle {
  readonly version: 1;
  readonly person: { readonly id: string; readonly name: string };
  readonly facts: readonly string[];
  readonly grants: readonly { readonly risk: string; readonly scope: string }[];
  /** Откуда перенесено — чтобы человек помнил, с какой машины. */
  readonly from: string;
}

/** Что будет на новой машине. */
export interface After {
  /** Переносится без изменений. */
  readonly stays: string[];
  /** Требует переподтверждения. */
  readonly askAgain: string[];
  /** Остаётся на старой машине. */
  readonly left: string[];
  readonly said: string;
}

/**
 * Собрать файл.
 *
 * Имя — обязательно: профиль без имени на новой машине станет «я», и человек не
 * поймёт, чья это память.
 */
export function pack(bundle: Omit<Bundle, "version">): { text: string; ok: boolean; said: string } {
  if (bundle.person.name.trim() === "") {
    return { text: "", ok: false, said: "у профиля нет имени: на новой машине он станет «я», и будет непонятно, чья это память" };
  }
  const text = JSON.stringify({ version: 1, ...bundle }, null, 2);
  return { text, ok: true, said: `профиль «${bundle.person.name}» собран в один файл: ${bundle.facts.length} фактов, ${bundle.grants.length} разрешений` };
}

/**
 * Что станет с содержимым на новой машине.
 *
 * `paths` — какие папки на ней есть. Несуществующие разрешения не выбрасываются
 * молча: они переходят в «переподтвердить», чтобы человек увидел, что именно
 * потеряло силу.
 */
export function after(bundle: Bundle, paths: readonly string[]): After {
  const alive = bundle.grants.filter((grant) => scopeExists(grant.scope, paths));
  const dead = bundle.grants.filter((grant) => !scopeExists(grant.scope, paths));

  const askAgain = dead.map((grant) => `${grant.risk} в «${grant.scope}»: такой папки здесь нет — переподтвердить, когда появится`);
  const says: string[] = [];
  says.push(`перенесено: имя «${bundle.person.name}» и ${bundle.facts.length} фактов`);
  if (alive.length > 0) says.push(`${alive.length} разрешений действуют: папки на месте`);
  if (dead.length > 0) says.push(`${dead.length} разрешений потеряли силу: папок с той машины здесь нет`);

  return {
    stays: [`имя: ${bundle.person.name}`, ...bundle.facts.map((fact) => `факт: ${fact}`)],
    askAgain,
    left: ["скачанная модель: она про машину, а не про человека", "общие расписания: они ведут в папки старой машины", "журнал дел: он остался там, где был"],
    said: says.join("; "),
  };
}

/** Есть ли папка разрешения на новой машине. */
function scopeExists(scope: string, paths: readonly string[]): boolean {
  if (scope === "всё") return true;
  const clean = scope.replace(/[\\/]+$/, "").toLowerCase();
  return paths.some((path) => {
    const have = path.replace(/[\\/]+$/, "").toLowerCase();
    return have === clean;
  });
}

/**
 * Чего перенос не делает.
 *
 * Не «синхронизирует» и не «связывает» машины: файл — это снимок, а не канал.
 */
export function notSync(): string[] {
  return [
    "не связывает машины: после переноса они не видят друг друга, и это нормально",
    "не переносит модель: её скачает новая машина, и профиль от этого не зависит",
    "не переписывает пути: папка, которой нет, не превращается в похожую — она честно исчезает из разрешений",
  ];
}
