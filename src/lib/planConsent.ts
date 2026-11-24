/**
 * Каждое изменение плана после согласия требует нового согласия (шаг 117).
 *
 * Дефект. Согласие выдаётся на **план**, а план — живой документ:
 *
 *  * **добавили шаг после согласия** — он выполнился без согласия: человек
 *    согласился на два шага, выполнилось три;
 *  * **переставили шаги** — тот же набор, а действие другое («удалить, потом
 *    скопировать» ≠ «скопировать, потом удалить»);
 *  * **сменился риск, не меняя параметров** — рука обновилась и стала опаснее, а
 *    согласие старое;
 *  * **изменился порядок из-за зависимостей** (шаг 112) — параметры те же, а
 *    последовательность другая.
 *
 * Шаг 102 закрыл правку **параметров** (отпечаток шага). Здесь — всё остальное,
 * что меняет смысл согласия: состав, порядок и риск.
 *
 * Правило: **согласие даётся на план, а план сравнивается целиком**.
 *
 *  1. **Сравнивается весь план**: состав (какие руки), порядок (в каком порядке),
 *     риск каждого шага и параметры. Отпечаток — один на план.
 *  2. **Любое различие — новое согласие**, а не «это же тот же план».
 *  3. **Различие названо**: «добавлен шаг 3», «поменялся порядок 1 и 2», «риск шага
 *     2 стал destructive» — человек должен знать, на что соглашается заново.
 *  4. **Ничего не изменилось — согласие в силе**: иначе любая перерисовка экрана
 *     сбрасывает согласие, и человек соглашается не читая.
 *  5. **Различие в опасную сторону — сильнее** (шаг 113): заново не только
 *     согласие, но и вопрос.
 *
 * Почему не «сравнивать только параметры». Параметры — не весь план: добавить шаг
 * можно с пустыми параметрами, и он пройдёт как «ничего не изменилось».
 */

/** Шаг плана, каким он виден согласию. */
export interface Seen {
  /** Адрес руки: `домен|глагол|объект`. */
  tool: string;
  /** Параметры. */
  params: Record<string, string>;
  /** Риск, как его назвал реестр. */
  risk: string;
}

/** Отпечаток плана — один на весь план. */
export function print(plan: readonly Seen[]): string {
  return plan
    .map((step) => {
      const body = Object.entries(step.params)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join("&");
      return `${step.tool}[${body}]@{${step.risk}}`;
    })
    .join("→");
}

/** Что именно изменилось. */
export interface Diff {
  /** Менялся ли план вообще. */
  changed: boolean;
  /** Различия словами — по строке на изменение. */
  why: string[];
  /** Добавлены ли опасные шаги — тогда вопрос сильнее (шаг 113). */
  worse: boolean;
}

/**
 * Сравнить план с тем, на который давали согласие.
 *
 * Сравнение **по порядку**: перестановка — изменение, потому что действие другое,
 * даже когда набор шагов тот же.
 */
export function diff(before: readonly Seen[], after: readonly Seen[]): Diff {
  const why: string[] = [];
  let worse = false;

  const beforeKeys = before.map((step) => step.tool);
  const afterKeys = after.map((step) => step.tool);

  for (let index = 0; index < after.length; index += 1) {
    const step = after[index];
    if (step === undefined) continue;
    const was = before[index];
    if (was === undefined) {
      why.push(`добавлен шаг ${index + 1}: ${step?.tool ?? ""}`);
      if (step.risk !== "read" && step.risk !== "write-local") worse = true;
      continue;
    }
    if (was.tool !== step.tool) {
      why.push(`шаг ${index + 1} заменён: был ${was.tool}, стал ${step.tool}`);
      if (step.risk !== "read" && step.risk !== "write-local") worse = true;
      continue;
    }
    if (was.risk !== step.risk) {
      why.push(`риск шага ${index + 1} изменился: был ${was.risk}, стал ${step.risk}`);
      // Стало опаснее — значит, и вопрос строже (шаг 113). Сравниваем **уровни**,
      // а не «было read»: write-local → destructive тоже стало опаснее.
      const rank = (risk: string): number =>
        risk === "read" ? 0 : risk === "write-local" ? 1 : risk === "money" ? 2 : risk === "destructive" ? 3 : 2;
      if (rank(step.risk) > rank(was.risk)) worse = true;
    }
    const wasBody = print([was]);
    const nowBody = print([step]);
    if (wasBody !== nowBody && was.risk === step.risk) {
      why.push(`параметры шага ${index + 1} изменились`);
    }
  }

  for (let index = after.length; index < before.length; index += 1) {
    why.push(`удалён шаг ${index + 1}: ${before[index]?.tool ?? ""}`);
  }

  // Перестановка при том же наборе — отдельный, самый незаметный вид изменения.
  if (why.length === 0 && beforeKeys.join("|") !== afterKeys.join("|") && before.length === after.length) {
    why.push("поменялся порядок шагов, хотя набор тот же");
  }

  return { changed: why.length > 0, why, worse };
}

/**
 * Нужно ли новое согласие.
 *
 * Отдельная функция, а не `diff(...).changed` на месте вызова: иначе один экран
 * проверит, другой забудет, и обход появится там, где забыли.
 */
export function needsConsent(before: readonly Seen[], after: readonly Seen[]): boolean {
  return diff(before, after).changed;
}

/**
 * Что сказать человеку.
 *
 * Сброс согласия **объясняется**: молчаливое «снова нужно подтверждение» выглядит
 * поломкой (то же правило, что в шаге 102).
 */
export function say(got: Diff): string {
  if (!got.changed) return "план не менялся — согласие в силе";
  const head = got.worse
    ? "план стал опаснее — согласие нужно заново, и вопрос будет строже"
    : "план изменился — согласие нужно заново";
  return `${head}: ${got.why.join("; ")}`;
}

/** Отпечаток плана для хранения согласия. */
export function grant(plan: readonly Seen[], at: number): { print: string; at: number } {
  return { print: print(plan), at };
}

/** Действует ли согласие, данное на этот план. */
export function holds(grant_: { print: string }, plan: readonly Seen[]): boolean {
  return grant_.print === print(plan);
}
