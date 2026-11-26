/**
 * Шаг 198: ошибки объявляются экранному диктору.
 *
 * Ошибка, которая видна, но не объявлена, для человека с диктором **не
 * существует**: он слышит «всё хорошо», а на экране красное. Поэтому у каждого
 * сообщения две стороны:
 *
 *  * **видимая** — `role="alert"` для важного (`aria-live="assertive"`) и
 *    `aria-live="polite"` для обычного;
 *  * **слышимая** — текст, у которого есть всё, что нужно для смысла: что случилось
 *    и что делать, но **без иконок и без «Подробнее»** — диктор не читает значки.
 *
 * И правило, которое ловят тестом: **важное — assertive, обычное — polite**, и
 * наоборот. Если всё assertive, диктор перебивает сам себя и человек перестаёт
 * слушать; если всё polite, ошибка ждёт конца чужой фразы.
 */

/** Сообщение. */
export interface Notice {
  /** Текст для человека — он же для диктора. */
  readonly text: string;
  /** Насколько важно: ошибка требует внимания. */
  readonly level: "ошибка" | "предупреждение" | "подсказка";
  /** Что делать — для ошибки обязательно. */
  readonly todo?: string;
}

/** Что должно быть в разметке. */
export interface Aria {
  readonly role: "alert" | "status";
  readonly live: "assertive" | "polite";
  /** Метка для диктора — сам текст, без значков. */
  readonly label: string;
}

/**
 * Разметка для сообщения.
 *
 * Ошибка — `alert` + `assertive`; остальное — `status` + `polite`. Метка — текст и,
 * у ошибки, «что делать»: диктор читает одну строку, а не две кнопки.
 */
export function aria(notice: Notice): Aria {
  const urgent = notice.level === "ошибка";
  const label = notice.todo === undefined || notice.todo.trim() === "" ? notice.text : `${notice.text}. Что сделать: ${notice.todo}`;

  return {
    role: urgent ? "alert" : "status",
    live: urgent ? "assertive" : "polite",
    label: label.replace(/\s+/g, " ").trim(),
  };
}

/**
 * Что не так с сообщением.
 *
 * Нарушения: пустой текст, ошибка без «что делать», значок или «Подробнее» в тексте
 * (диктор прочтёт «стрелка вниз подробнее»).
 */
export function check(notice: Notice): string[] {
  const problems: string[] = [];

  if (notice.text.trim() === "") problems.push("пустое сообщение: диктору нечего объявлять");
  if (notice.level === "ошибка" && (notice.todo ?? "").trim() === "") problems.push(`«${notice.text}»: ошибка без «что делать» — человек слышит проблему и не слышит выход`);
  // `\b` с кириллицей не работает — ищем подстроку.
  if (/[↓↑→←✓✗★☆•]|подробнее/i.test(notice.text)) problems.push(`«${notice.text}»: значок или «подробнее» в тексте — диктор прочтёт это вслух`);

  return problems;
}

/**
 * Очередь объявлений.
 *
 * Три правила: важное — сразу, обычное — по одному, повторы — не чаще раза.
 * Диктор, которому подают три подсказки подряд, не даёт дослушать ни одну.
 */
export function queue(notices: readonly Notice[]): { first: string | null; rest: number; said: string } {
  const urgent = notices.filter((notice) => notice.level === "ошибка");
  if (urgent.length > 0) {
    return { first: urgent[0]?.text ?? null, rest: notices.length - 1, said: `сразу объявляется ошибка «${urgent[0]?.text ?? ""}», остальное — после` };
  }

  const unique = [...new Set(notices.map((notice) => notice.text))];
  return { first: unique[0] ?? null, rest: unique.length - 1, said: unique.length === 0 ? "объявлять нечего" : `по одной: ${unique.length} сообщений, повторы не читаются` };
}

/**
 * Чего это не делает.
 *
 * Три запрета; главный — не всё urgent.
 */
export function notDo(): string[] {
  return [
    "не объявляет всё важным: диктор начнёт перебивать сам себя",
    "не читает значки и «Подробнее»: в метке только смысл",
    "не повторяет одно и то же: повтор отнимает у человека время",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по числу правил.
 */
export function checks(): string[] {
  return [
    "ошибка — alert/assertive, остальное — status/polite",
    "у ошибки в метке есть «что делать»",
    "значки и «подробнее» в объявление не попадают",
  ];
}
