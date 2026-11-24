/**
 * Порядок шагов не зависит от порядка в файле, а от зависимостей (шаг 112).
 *
 * Дефект. Шаги плана выполняются **как записаны**, а зависимости между ними нигде
 * не описаны:
 *
 *  * **неправильный порядок — потеря данных**: «переместить отчёт в архив» идёт
 *    раньше «создать архив», и перемещение падает или, хуже, кладёт файл в
 *    случайное место;
 *  * **порядок держится на памяти автора**: почему шаги стоят так, не написано, и
 *    перестановка при правке ломает сценарий молча;
 *  * **скрытые зависимости невидимы**: второй шаг берёт путь из первого, но об этом
 *    можно узнать только по совпадению имён параметров;
 *  * **одинаковый результат при разном порядке**: два шага трогают одну папку, и
 *    исход зависит от того, кто первый.
 *
 * Правило: **порядок — следствие зависимостей, и он назван**.
 *
 *  1. **Зависимость — это факт про шаг**, а не про место в файле: «этот шаг нужно
 *     N после того», где N — шаг или вид ресурса.
 *  2. **Порядок вычисляется** и показывается человеку: «шаг «создать архив» —
 *     раньше, потому что «переместить отчёт» пишет в него».
 *  3. **Круг — отказ целиком**, а не «как получится»: сценарий, который нельзя
 *     упорядочить, не выполняется наполовину.
 *  4. **Равные шаги сохраняют порядок файла**: если зависимости не связывают, порядок
 *     из файла — законный (устойчивая сортировка), но это **сказано**.
 *  5. **Независимые шаги не переставляются ради красоты**: перестановка без причины
 *     — это изменение, которое никто не просил.
 *
 * Почему не «выполнять в порядке записи и надеяться». Порядок записи — это порядок,
 * в котором кто-то набирал текст; он не знает про зависимости и потому не может
 * быть правильным по построению.
 */

/** Шаг с названными зависимостями. */
export interface Node {
  /** Что делает — словами. */
  what: string;
  /** Адрес руки: `домен|глагол|объект`. */
  tool: string;
  /** Индексы шагов, которые обязаны быть **до** этого (в исходном массиве). */
  after: number[];
  /** Ресурсы, которые шаг **пишет**: `folder:D:\Архив`, `file:D:\a.txt`. */
  writes: string[];
  /** Ресурсы, которые шаг **читает**. */
  reads: string[];
}

/**
 * Зависимости, выведенные из ресурсов.
 *
 * Если шаг A пишет ресурс, который шаг B читает, B идёт после A. Это **тот же**
 * факт, что связи параметров в шаге 108, но выраженный ресурсами: читать файл
 * раньше, чем он создан, — не ошибка в порядке, а невозможность.
 */
export function fromResources(nodes: readonly Node[]): { after: number[][]; why: string[] } {
  const after: number[][] = nodes.map((node) => [...node.after]);
  const why: string[] = [];

  nodes.forEach((reader, readIndex) => {
    nodes.forEach((writer, writeIndex) => {
      if (readIndex === writeIndex) return;
      const shared = writer.writes.filter((resource) => reader.reads.includes(resource));
      if (shared.length === 0) return;
      if (after[readIndex]?.includes(writeIndex)) return;
      after[readIndex]?.push(writeIndex);
      why.push(
        `шаг ${readIndex + 1} («${reader.what}») после шага ${writeIndex + 1} («${writer.what}»): читает ${shared.join(", ")}, который тот пишет`,
      );
    });
  });

  return { after, why };
}

/** Результат упорядочивания. */
export interface Ordered {
  /** Шаги в правильном порядке (сами узлы, не индексы). */
  steps: Node[];
  /** Порядок исходных индексов — чтобы экран не искал шаги заново. */
  indexes: number[];
  /** Почему такой порядок — по строке на каждую перестановку. */
  why: string[];
  /** Ошибки: круг или ссылка мимо. */
  errors: string[];
}

/**
 * Упорядочить по зависимостям.
 *
 * Устойчиво: при равных зависимостях сохраняется порядок файла. Это не «мелочь» —
 * иначе две независимые правки одного плана дают разный порядок, и diff становится
 * бесполезным.
 */
export function order(nodes: readonly Node[]): Ordered {
  const errors: string[] = [];
  const { after, why } = fromResources(nodes);

  // Ссылки мимо массива — ошибка, названная, а не проглоченная.
  after.forEach((list, index) => {
    for (const dep of list) {
      if (dep < 0 || dep >= nodes.length) {
        errors.push(`шаг ${index + 1} ссылается на несуществующий шаг ${dep + 1}`);
      }
    }
  });
  if (errors.length > 0) return { steps: [], indexes: [], why, errors };

  const placed: number[] = [];
  const state = new Map<number, "visiting" | "done">();
  let cycle = false;

  const visit = (index: number): void => {
    const mark = state.get(index);
    if (mark === "done") return;
    if (mark === "visiting") {
      cycle = true;
      return;
    }
    state.set(index, "visiting");
    for (const dep of after[index] ?? []) visit(dep);
    state.set(index, "done");
    placed.push(index);
  };

  for (let index = 0; index < nodes.length; index += 1) visit(index);

  if (cycle) {
    return {
      steps: [],
      indexes: [],
      why,
      errors: ["шаги зависят друг от друга по кругу — упорядочить нельзя, и выполнять половину нельзя тоже"],
    };
  }

  // Объяснение: только те перестановки, которые отличаются от порядка файла.
  const moved = placed
    .map((index, position) => ({ index, position }))
    .filter((item) => item.index !== item.position)
    .map((item) => `«${nodes[item.index]?.what ?? ""}» стоит ${item.position + 1}-м, а не ${item.index + 1}-м`);

  return { steps: placed.map((index) => nodes[index]!).filter(Boolean), indexes: placed, why: [...why, ...moved], errors: [] };
}

/**
 * Что сказать человеку.
 *
 * Порядок **назван**, а не просто применён: иначе человек видит шаги не в том
 * порядке, в котором писал, и считает это ошибкой.
 */
export function say(got: Ordered): string[] {
  if (got.errors.length > 0) return got.errors.map((error) => `не выполню: ${error}`);
  if (got.steps.length === 0) return ["шагов нет"];
  const lines = [`порядок: ${got.steps.length} шагов, вычисленный по зависимостям`];
  for (const reason of got.why) lines.push(`почему: ${reason}`);
  if (got.why.length === 0) lines.push("зависимостей нет — порядок как записан, и это законно");
  return lines;
}

/**
 * Сильная ли зависимость.
 *
 * «Читает то, что тот пишет» — сильная: без неё шаг невозможен. «Тот же ресурс, но
 * только чтение» — слабая: порядок не важен, и переставлять незачем.
 */
export function strongAt(nodes: readonly Node[], index: number): boolean {
  const reader = nodes[index];
  if (reader === undefined) return false;
  return nodes.some(
    (writer, writeIndex) => writeIndex !== index && writer.writes.some((resource) => reader.reads.includes(resource)),
  );
}
