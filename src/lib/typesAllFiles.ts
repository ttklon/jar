/**
 * Шаг 485: проверка линз и типов на **всех** файлах, включая тесты.
 *
 * Ошибка в тесте — такая же ошибка, но её видят позже всех: `vitest` **не**
 * проверяет типы, он просто исполняет. Поэтому тест с неиспользуемым импортом или
 * обращением к несуществующему полю **проходит** локально и падает в CI (или,
 * хуже, не падает никогда, а просто не проверяет то, что должен).
 *
 * Отсюда правило: типы проверяются на **всех** файлах, которые входят в проект, и
 * «файл теста» — не исключение. И проверяется это не обещанием, а списком
 * исключений: если `tsconfig` что-то не включает, это видно списком.
 */

/** Что проверяет типами. */
export interface Scope {
  /** Все файлы проекта. */
  readonly all: readonly string[];
  /** Что реально включено в `tsconfig`. */
  readonly included: readonly string[];
  /** Исключения — с причиной. */
  readonly excluded: readonly { path: string; why: string }[];
}

/**
 * Найти файлы вне проверки типов.
 *
 * Три категории: тесты вне `include`, файлы без причины в исключениях, и
 * исключение с пустой причиной. Все три — «проверка обещана, но не сделана».
 */
export function gaps(scope: Scope): string[] {
  const out: string[] = [];
  const included = new Set(scope.included);
  const excluded = new Map(scope.excluded.map((item) => [item.path, item.why]));

  for (const path of scope.all) {
    if (included.has(path)) continue;
    const why = excluded.get(path);
    if (why === undefined) {
      out.push(`${path}: не включён в проверку типов и не назван в исключениях`);
    } else if (why.trim().length < 10) {
      out.push(`${path}: исключён без причины — «${why}» ничего не объясняет`);
    }
  }

  return out;
}

/**
 * Тесты в проверке типов.
 *
 * Отдельно — потому что именно их забывают и именно они дают «зелёный `vitest` при
 * падающем CI» (шаг 468, шаг 476).
 */
export function testsCovered(scope: Scope): { ok: boolean; said: string } {
  const tests = scope.all.filter((path) => path.endsWith(".test.ts"));
  const included = new Set(scope.included);
  const missing = tests.filter((path) => !included.has(path));

  return missing.length === 0
    ? { ok: true, said: `тестов ${tests.length}: все в проверке типов` }
    : { ok: false, said: `тестов вне проверки типов: ${missing.length} (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}) — vitest типы не проверяет` };
}

/**
 * Исключения — только с причиной.
 *
 * Три допустимые причины; «временно» и «так проще» — не причины.
 */
export function allowedWhy(): string[] {
  return ["сгенерировано: правится генератором, а не руками", "сторонний код: не наш, не правим", "намеренно сломанный пример для теста проверки"];
}

/**
 * Чего проверка не делает.
 *
 * Три запрета; главный — не исключать тесты «пока так».
 */
export function notDo(): string[] {
  return [
    "не исключает тесты из проверки типов «пока так»: именно оттуда приходит CI-падение",
    "не принимает «временно» как причину исключения",
    "не полагается на `vitest` в проверке типов: он их не проверяет",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу категорий.
 */
export function checks(): string[] {
  return [
    "каждый файл проекта либо в проверке типов, либо в исключениях с причиной",
    "тесты — не исключение",
    "«временно» причиной не считается",
  ];
}
