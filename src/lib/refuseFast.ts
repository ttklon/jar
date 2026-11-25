/**
 * Шаг 286: VS Code — палитра команд и предсказуемые отказы.
 *
 * Что взято у VS Code. Палитра команд (`Ctrl+Shift+P`) выигрывает не поиском, а
 * тем, что **показывает и недоступное**: команда видна, но серая, и рядом
 * написано, почему она сейчас не работает. Это лучше, чем спрятать: спрятанное
 * человек ищет и решает, что функции нет.
 *
 * Что не взято:
 *
 *  * **сотни команд в списке.** У VS Code палитра — это весь редактор. У нас
 *    команд десятки, и список из сотни строк превращает выбор в чтение;
 *  * **отказ после нажатия.** У VS Code бывает: нажал — и узнал, что нельзя.
 *    Наш отказ приходит **до** нажатия, в строке, и это то же правило, что в
 *    шаге 87, но применённое к списку, а не к ответу.
 *
 * И главное, что берётся именно у VS Code: **отказ предсказуем**. Одна и та же
 * команда при одинаковых обстоятельствах отказывает одинаково и одинаковыми
 * словами. Мерцающий отказ — «то работает, то нет» — хуже отсутствия функции:
 * человек перестаёт верить списку целиком.
 */

/** Команда в палитре. */
export interface Command {
  /** Устойчивый ключ: по нему команду находят, а не по позиции. */
  readonly id: string;
  readonly title: string;
  /** Что делает — словами, в строке, до нажатия. */
  readonly does: string;
  /** Можно ли сейчас. `false` — команда видна, но серая. */
  readonly ok: boolean;
  /** Почему нельзя: одна причина, короткая. Пусто, если можно. */
  readonly why: string;
  /** Куда ведёт отказ: что сделать, чтобы стало можно. */
  readonly next: string;
}

/**
 * Строка палитры.
 *
 * Недоступная команда **не исчезает**: спрятанное человек ищет и решает, что
 * функции нет.
 */
export interface Row {
  readonly command: Command;
  /** Что показать справа: причина отказа или что команда сделает. */
  readonly note: string;
  /** Можно ли нажать. */
  readonly enabled: boolean;
}

/** Построить строки: доступные сначала, недоступные — следом, но видны. */
export function rows(commands: readonly Command[]): Row[] {
  const out = commands.map((command) => ({
    command,
    note: command.ok ? command.does : `${command.why}${command.next === "" ? "" : ` — ${command.next}`}`,
    enabled: command.ok,
  }));
  // Сортировка устойчивая и по одному признаку: недоступное вниз. Внутри —
  // исходный порядок, иначе список прыгает между открытиями и человек жмёт не то.
  return [...out.filter((row) => row.enabled), ...out.filter((row) => !row.enabled)];
}

/**
 * Нажать на строку.
 *
 * Отказ приходит тем же текстом, что был в строке, — иначе человек читает одно,
 * а получает другое, и перестаёт читать строки.
 */
export function press(row: Row): { run: boolean; said: string } {
  if (!row.enabled) {
    return {
      run: false,
      said: `${row.command.title}: ${row.command.why}${row.command.next === "" ? "" : ` — ${row.command.next}`}`,
    };
  }
  return { run: true, said: row.command.does };
}

/**
 * Сколько команд в палитре.
 *
 * Тридцать — не «сколько поместится»: палитра на сотню строк превращает выбор в
 * чтение, а поиск по ней — в угадывание.
 */
export const CROWDED = 30;

/** Что не так со списком команд, если что-то не так. */
export function audit(commands: readonly Command[]): { ok: boolean; said: string } {
  if (commands.length > CROWDED) {
    return {
      ok: false,
      said: `команд ${commands.length} — это уже чтение, а не выбор; в палитре должно быть до ${CROWDED}`,
    };
  }
  const noReason = commands.filter((command) => !command.ok && command.why.trim() === "");
  if (noReason.length > 0) {
    return {
      ok: false,
      said: `недоступные без причины: ${noReason.map((command) => command.title).join(", ")} — серое без объяснения читается как поломка`,
    };
  }
  const deadEnd = commands.filter((command) => !command.ok && command.next.trim() === "");
  if (deadEnd.length === commands.filter((command) => !command.ok).length && commands.some((command) => !command.ok)) {
    return {
      ok: true,
      said: "все недоступные назвали причину; ни одна не говорит, что сделать, — это тупик, но честный",
    };
  }
  return { ok: true, said: `команд ${commands.length}, недоступных ${commands.filter((command) => !command.ok).length}` };
}

/**
 * Одинаковые обстоятельства — одинаковый отказ.
 *
 * Проверяется не «функция стабильна», а что строка и нажатие говорят **одно и
 * то же**: расхождение между ними — самая частая причина недоверия к палитре.
 */
export function predictable(commands: readonly Command[]): { ok: boolean; said: string } {
  for (const row of rows(commands)) {
    const first = press(row).said;
    const second = press(row).said;
    if (first !== second) {
      return { ok: false, said: `${row.command.title}: отказ меняется от нажатия к нажатию` };
    }
    if (!row.enabled && !first.includes(row.command.why)) {
      return { ok: false, said: `${row.command.title}: в строке одна причина, при нажатии другая` };
    }
  }
  return { ok: true, said: "отказы одинаковы в строке и при нажатии" };
}
