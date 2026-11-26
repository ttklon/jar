/**
 * Шаг 478: ссылки и обещания проверяются в CI — не разъедутся.
 *
 * Документ ссылается на файл, на шаг плана, на действие и на тест. Ни одна из этих
 * ссылок не проверяется глазами: файл переименовали, шаг перенумеровали, действие
 * удалили — и ссылка ведёт в пустоту.
 *
 * Здесь — **все виды ссылок** и то, что для каждого считается «существует»:
 *
 *  * `file:docs/x.md` — есть на диске;
 *  * `step:452` — есть в плане;
 *  * `action:clean` — есть в реестре действий;
 *  * `test:src/lib/x.test.ts` — файл теста есть.
 *
 * Проверка в CI, а не «пройтись глазами»: глаза не перепроверяют после каждого
 * переименования.
 */

/** Ссылка. */
export interface Link {
  /** Что это: файл, шаг, действие, тест. */
  readonly to: "file" | "step" | "action" | "test";
  /** Значение — путь или идентификатор. */
  readonly value: string;
  /** Где стоит ссылка — для сообщения. */
  readonly where: string;
}

/** Что реально есть. */
export interface Have {
  readonly files: readonly string[];
  readonly steps: readonly number[];
  readonly actions: readonly string[];
}

/**
 * Найти битые ссылки.
 *
 * Каждая — с местом: «docs/GUIDE.md → step:452 не существует», чтобы правили
 * строку, а не искали по всему документу.
 */
export function broken(links: readonly Link[], have: Have): string[] {
  const out: string[] = [];

  for (const link of links) {
    const ok =
      link.to === "file" || link.to === "test"
        ? have.files.includes(link.value)
        : link.to === "step"
          ? /^\d+$/.test(link.value) && have.steps.includes(Number(link.value))
          : have.actions.includes(link.value);

    if (!ok) out.push(`${link.where} → ${link.to}:${link.value} не существует`);
  }

  return out;
}

/**
 * Разобрать ссылки из текста.
 *
 * Один вид — `вид:значение` в обратных кавычках. Всё остальное — обычный текст.
 */
export function parse(text: string, where: string): Link[] {
  const out: Link[] = [];
  const pattern = /`(file|step|action|test):([^`]+)`/g;

  for (const match of text.matchAll(pattern)) {
    out.push({ to: match[1] as Link["to"], value: (match[2] ?? "").trim(), where });
  }

  return out;
}

/**
 * Ссылка должна быть проверяемой.
 *
 * `file:` без пути и `step:` без числа — тоже битые: проверке не за что взяться.
 */
export function malformed(link: Link): boolean {
  if (link.value.trim() === "") return true;
  if (link.to === "step") return !/^\d+$/.test(link.value);
  return false;
}

/**
 * Сводка для CI.
 *
 * Три числа: сколько ссылок, сколько битых, сколько проверяемых видов.
 */
export function summary(links: readonly Link[], have: Have): string {
  const bad = broken(links, have).length;
  const kinds = new Set(links.map((link) => link.to)).size;
  return bad === 0
    ? `ссылок ${links.length}: все ведут туда, куда обещают (видов ${kinds})`
    : `битых ссылок ${bad} из ${links.length}: правьте документ, а не проверку`;
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по видам ссылок.
 */
export function checks(): string[] {
  return [
    "ссылка на файл и тест проверяется по диску",
    "ссылка на шаг и действие — по реестру, а не по памяти",
    "битая ссылка называет документ и место, а не «где-то»",
  ];
}

/**
 * Чего проверка не делает.
 *
 * Три запрета: главное — не удалять ссылку, чтобы стало зелено.
 */
export function notDo(): string[] {
  return [
    "не удаляет ссылку, чтобы проверка стала зелёной",
    "не проверяет «примерно»: файл есть или его нет",
    "не ищет ссылки глазами: они собираются из текста одним правилом",
  ];
}
