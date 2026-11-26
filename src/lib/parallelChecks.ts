/**
 * Шаг 483: параллельные проверки по независимым областям.
 *
 * Прогон в пять минут (шаг 481) не получается, если части ждут друг друга: типы
 * ждут тестов, тесты ждут снимка. Но части **независимы** — и это надо не
 * предполагать, а **доказать**.
 *
 * Независимы две части, если:
 *
 *  * они не пишут в один файл;
 *  * одна не читает то, что пишет другая;
 *  * они не делят `node_modules` на запись.
 *
 * Если независимость не доказана — части идут **по порядку**. Параллельный запуск
 * двух частей, которые делят файл, даёт **плавающий** прогон, а плавающий прогон
 * хуже медленного: его начинают перезапускать, а потом не смотреть.
 */

/** Часть прогона. */
export interface Part {
  readonly name: string;
  /** Файлы, в которые пишет. */
  readonly writes: readonly string[];
  /** Файлы, которые читает. */
  readonly reads: readonly string[];
}

/**
 * Можно ли запускать параллельно.
 *
 * Возвращает **пары**, которые нельзя: причина нужна, чтобы её поняли, а не
 * обошли.
 */
export function conflicts(list: readonly Part[]): string[] {
  const out: string[] = [];

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]!;
      const b = list[j]!;

      const sharedWrite = a.writes.filter((path) => b.writes.includes(path));
      if (sharedWrite.length > 0) {
        out.push(`«${a.name}» и «${b.name}» пишут в одно: ${sharedWrite.join(", ")}`);
        continue;
      }

      const aReadsB = a.reads.filter((path) => b.writes.includes(path));
      const bReadsA = b.reads.filter((path) => a.writes.includes(path));
      if (aReadsB.length > 0 || bReadsA.length > 0) {
        out.push(`«${a.name}» и «${b.name}»: одна читает то, что пишет другая (${[...aReadsB, ...bReadsA].join(", ")})`);
      }
    }
  }

  return out;
}

/**
 * Порядок запуска.
 *
 * Волны: в одну волну идут части, между которыми нет конфликта. Число волн — это
 * и есть длина прогона в «последовательностях».
 */
export function waves(list: readonly Part[]): string[][] {
  const result: string[][] = [];
  const left = [...list];

  while (left.length > 0) {
    const wave: Part[] = [];
    for (const part of left) {
      if (wave.every((other) => conflicts([other, part]).length === 0)) wave.push(part);
    }
    // Защита от бесконечности: если ни одна не вошла, берём первую как есть.
    const taken = wave.length > 0 ? wave : [left[0]!];
    result.push(taken.map((part) => part.name));
    for (const part of taken) left.splice(left.indexOf(part), 1);
  }

  return result;
}

/**
 * Сводка.
 *
 * Три числа: частей, волн, конфликтов. Конфликт — не «мелкое», а причина не
 * распараллеливать.
 */
export function summary(list: readonly Part[]): { parts: number; waves: number; said: string } {
  const bad = conflicts(list);
  const w = waves(list);

  const said = bad.length === 0
    ? `частей ${list.length}, волн ${w.length} (${w.map((wave) => wave.join(" ∥ ")).join(" → ")}): общих файлов нет`
    : `частей ${list.length}, волн ${w.length}, но параллельно нельзя: ${bad.join("; ")}`;

  return { parts: list.length, waves: w.length, said };
}

/**
 * Чего параллельность не делает.
 *
 * Три запрета; главный — не «на всякий случай параллельно».
 */
export function notDo(): string[] {
  return [
    "не запускает параллельно то, чью независимость не доказали",
    "не скрывает конфликт: он называется и с файлом",
    "не перезапускает плавающий прогон: плавающий — это дефект, а не «повезло»",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по видам конфликтов.
 */
export function checks(): string[] {
  return [
    "общая запись в файл — конфликт",
    "чтение того, что пишет другая, — конфликт",
    "независимые части идут волнами, и волны посчитаны",
  ];
}
