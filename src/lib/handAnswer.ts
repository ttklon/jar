/**
 * Любая рука отвечает: что сделано, чем это доказано, что не отменяется (шаг 105).
 *
 * Дефект. Отчёт есть не у всех, и у разных рук он разной полноты:
 *
 *  * **«нажал» вместо «сделано»**: шаг отчитывается `ok`, а что изменилось — не
 *    сказано; человек идёт проверять руками то, о чём приложение уже знает;
 *  * **доказательство есть не всегда**: у одной руки `evidence` заполнен, у
 *    другой пустая строка — и пустая читается как «всё хорошо», а не как «не
 *    проверяли»;
 *  * **отменяемость не сказана**: человек узнаёт, что шаг необратим, только после
 *    того, как нажал «отменить» и ничего не вернулось;
 *  * **формы расходятся**: две руки отвечают по-разному, и сравнить два дела
 *    нельзя.
 *
 * Правило: **у любого ответа руки три поля, и все три обязательны**.
 *
 *  1. **Что сделано** — словами и конкретно: «создал папку `D:\Отчёты`», а не
 *     «выполнено».
 *  2. **Чем доказано** — либо проверка (её текст), либо честное «не проверено».
 *     Пустая строка запрещена: она читается как успех.
 *  3. **Что не отменяется** — названо **до** нажатия «отменить», а не после.
 *  4. **Одна форма на все руки**: одна и та же структура, поэтому дела сравнимы, а
 *     экран не учится говорить по-новому для каждой руки.
 *
 * Почему не «добавить поле в отчёт там, где не хватает». Отчёт правится по месту,
 * и через месяц у семи рук семь форм — ровно та болезнь, от которой `deed.ts`.
 * Здесь форма одна, и её нельзя заполнить наполовину: `answer` возвращает отчёт
 * только с тремя полями, а недостающее называет причиной.
 */

/** Что рука вернула — как есть, до превращения в отчёт. */
export interface Raw {
  /** Что сделано: `null`, если рука не сказала. */
  did?: string | null;
  /** Доказательство: текст проверки, `null`, если проверки не было. */
  proof?: string | null;
  /** Отменяемо ли сделанное. `null` — рука не сказала, и это **не** «нет». */
  undoable?: boolean | null;
  /** Риск шага, как его назвал реестр. */
  risk?: string | null;
}

/** Отчёт руки: три поля, все заполнены. */
export interface Answer {
  /** Что сделано — словами. */
  did: string;
  /** Чем доказано. */
  proof: string;
  /** Что не отменяется; пусто, если отменяется всё. */
  permanent: string;
  /** Полон ли отчёт: чего не хватило. Пусто — полон. */
  gaps: string[];
}

/**
 * Риск, при котором сделанное не отменяется.
 *
 * Список **узкий**: `read` и `write-local` отменяемы, `money` и `destructive` —
 * нет. Незнакомый риск считается неотменяемым: неизвестное не должно выглядеть
 * безопасным (то же правило, что в шаге 101).
 */
const PERMANENT = new Set(["destructive", "money", "external"]);

export function permanent(risk: string | null | undefined): boolean {
  if (risk === null || risk === undefined || risk === "") return true;
  if (risk === "read" || risk === "write-local") return false;
  return PERMANENT.has(risk) || !["read", "write-local"].includes(risk);
}

/**
 * Отчёт по тому, что вернула рука.
 *
 * Недостающее **называется**, а не подставляется: «доказательства нет» — это
 * факт, а придуманная галочка — враньё.
 */
export function answer(raw: Raw, what: string): Answer {
  const gaps: string[] = [];

  const did = raw.did?.trim();
  if (!did) gaps.push("что сделано");

  const proof = raw.proof?.trim();
  if (!proof) gaps.push("чем доказано");

  // Отменяемость. Риск из реестра — уже ответ: рука, которая назвала риск,
  // сказала и об отменяемости. Дыра — только когда нет **ни того, ни другого**.
  const knowsRisk = raw.risk !== null && raw.risk !== undefined && raw.risk !== "";
  const undoable = raw.undoable ?? (knowsRisk ? !permanent(raw.risk) : null);
  if (undoable === null) gaps.push("что не отменяется");

  const permanentNote =
    undoable === false
      ? `${what}: сделанное не отменяется — «отменить» вернёт только то, что ещё не начато`
      : "";

  return {
    // Что сделано — словами и с предметом: «создал папку D:\Отчёты».
    did: did || `${what}: рука не сказала, что сделала`,
    // Пустая строка читается как успех, поэтому её здесь нет.
    proof: proof || "не проверено — доказательства нет",
    permanent: permanentNote,
    gaps,
  };
}

/** Полон ли отчёт: рука ответила на все три вопроса. */
export function full(got: Answer): boolean {
  return got.gaps.length === 0;
}

/** Что показать человеку — одной строкой, без служебных полей. */
export function line(got: Answer): string {
  const parts = [got.did, `доказательство: ${got.proof}`];
  if (got.permanent) parts.push(got.permanent);
  if (got.gaps.length > 0) parts.push(`рука не ответила: ${got.gaps.join(", ")}`);
  return parts.join(" · ");
}

/**
 * Доля рук, которые отвечают полностью.
 *
 * Нужна, чтобы «любая рука отвечает» было **числом**, а не обещанием: 7 из 56 —
 * это не «любая».
 */
export function coverage(answers: readonly Answer[]): { full: number; total: number; share: number } {
  const complete = answers.filter(full).length;
  return {
    full: complete,
    total: answers.length,
    share: answers.length === 0 ? 0 : complete / answers.length,
  };
}

/**
 * Что чинить в первую очередь — по тому, какого поля не хватает чаще.
 *
 * Без группировки «руки отвечают неполно» не говорит, что делать: чаще всего
 * не хватает доказательства, и это одна правка во всех руках сразу.
 */
export function worst(answers: readonly Answer[]): { gap: string; times: number }[] {
  const counts = new Map<string, number>();
  for (const got of answers) {
    for (const gap of got.gaps) {
      counts.set(gap, (counts.get(gap) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([gap, times]) => ({ gap, times }))
    .sort((left, right) => right.times - left.times);
}
