/**
 * Шаг 480: документация собирается в один читаемый файл для офлайн-просмотра.
 *
 * Документация лежит двадцатью файлами в `docs/`. Человек без интернета — а
 * программа работает локально, и это её главное обещание — не может прочитать
 * ничего: ссылки ведут на сайт, сайт недоступен, файлы он не найдёт.
 *
 * Поэтому собирается **один файл**, и в нём:
 *
 *  * **порядок чтения**, а не алфавит: сначала «что это», потом «как начать»,
 *    потом подробности;
 *  * **ссылки внутри файла** — якоря, а не пути к другим документам: файл можно
 *    отправить, распечатать и открыть на другом компьютере;
 *  * **оглавление** сверху, потому что файл длинный и без него в нём не найти
 *    ничего.
 *
 * И правило: собранный файл **не правится руками**. Он производный — как `INDEX.md`;
 * правят источники, а файл пересобирают (шаг 469: сгенерирован — значит, генератор
 * и проверка).
 */

/** Документ-источник. */
export interface Source {
  /** Путь. */
  readonly path: string;
  /** Заголовок — он же строка оглавления. */
  readonly title: string;
  /** Порядок чтения: меньше — раньше. */
  readonly order: number;
  /** Тело. */
  readonly body: string;
}

/** Собранный файл. */
export interface Build {
  readonly text: string;
  /** Заголовки в порядке появления — для проверки оглавления. */
  readonly headings: string[];
  /** Предупреждения: пропуски, дубли порядка. */
  readonly problems: string[];
}

/** Якорь из заголовка: нижний регистр, пробелы — дефисы, ничего лишнего. */
export function anchor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Собрать.
 *
 * Порядок — по `order`, при равенстве — как пришло (стабильно). Оглавление — из
 * заголовков. Пустой документ — предупреждение, а не тишина.
 */
export function build(sources: readonly Source[]): Build {
  const problems: string[] = [];
  const sorted = [...sources].sort((a, b) => a.order - b.order);

  const orders = sorted.map((source) => source.order);
  const dup = orders.filter((order, i) => orders.indexOf(order) !== i);
  if (dup.length > 0) problems.push(`порядок ${[...new Set(dup)].join(", ")} повторяется: порядок чтения неоднозначен`);

  const kept = sorted.filter((source) => {
    if (source.body.trim() === "") {
      problems.push(`«${source.title}» пуст: пропущен`);
      return false;
    }
    return true;
  });

  const seen = new Set<string>();
  const toc: string[] = [];
  for (const source of kept) {
    let id = anchor(source.title);
    if (seen.has(id)) {
      problems.push(`якорь «${id}» занят: два заголовка одинаковы`);
      let n = 2;
      while (seen.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    seen.add(id);
    toc.push(`- [${source.title}](#${id})`);
  }

  const parts = ["# Руководство в одном файле", "", "Собрано из `docs/`. Править этот файл бессмысленно — правят источники.", "", "## Оглавление", "", ...toc, ""];

  for (const source of kept) {
    parts.push(`## ${source.title}`, "", source.body.trim(), "");
  }

  return { text: parts.join("\n"), headings: kept.map((source) => source.title), problems };
}

/**
 * Проверить собранный файл.
 *
 * `links` — якоря, на которые ссылается текст. Якорь без заголовка — битая ссылка
 * внутри собственного файла.
 */
export function check(build_: Build, links: readonly string[]): string[] {
  const problems: string[] = [];
  const anchors = new Set(build_.headings.map(anchor));

  if (build_.headings.length === 0) problems.push("в файле нет ни одного документа");
  if (!build_.text.includes("## Оглавление")) problems.push("нет оглавления: в длинном файле без него ничего не найти");

  for (const link of links) {
    if (!anchors.has(link)) problems.push(`ссылка #${link} ведёт в никуда: такого заголовка нет`);
  }

  return problems;
}

/**
 * Чего собранный файл не делает.
 *
 * Три запрета: главный — не править руками.
 */
export function notDo(): string[] {
  return [
    "не правится руками: он производный, как `INDEX.md`",
    "не ссылается на сайт: всё внутри одного файла",
    "не сортируется по алфавиту: порядок чтения — часть документа",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу обещаний.
 */
export function checks(): string[] {
  return [
    "порядок чтения, а не алфавит",
    "оглавление и ссылки-якоря внутри файла",
    "пустой документ — предупреждение, а не тихая дыра",
  ];
}
