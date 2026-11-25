/**
 * Шаг 292: уведомление об авторстве — то, что требует свободная лицензия.
 *
 * Шаг 291 сказал «можно, сохранив уведомление». Но «сохранить уведомление» на
 * практике означает три вещи, и все три обычно забываются:
 *
 *  1. **Назвать авторов.** Не «MIT License», а имя и год из файла лицензии.
 *  2. **Дать текст лицензии целиком** — ссылка «см. на сайте» не годится, если
 *     приложение работает без сети.
 *  3. **Положить туда, где человек найдёт**: раздел «О программе» / окно о
 *     программе, а не файл в установочной папке.
 *
 * Это не юридическая консультация, а проверка полноты: мелочь, которую пропускают
 * чаще всего — **год** (или его подставляют текущий, что неверно: год — из
 * уведомления автора).
 */

/** Что требует лицензия от нашего приложения. */
export interface Requirement {
  /** Чей код. */
  readonly by: string;
  /** Год из уведомления автора — не сегодняшний. */
  readonly year: number;
  readonly license: "mit" | "apache" | "bsd";
  /** Полный текст, а не ссылка. */
  readonly text: string;
}

/** Что покажем в «О программе». */
export interface Notice {
  readonly title: string;
  readonly body: string;
  readonly ok: boolean;
  readonly missing: string[];
}

/**
 * Собрать уведомление.
 *
 * `today` — не для подстановки года, а чтобы отделить «старый год» (нормально)
 * от «будущего года» (опечатка) без часов внутри функции.
 */
export function notice(req: Requirement, linksOnly: boolean, today: number): Notice {
  const missing: string[] = [];

  if (req.by.trim() === "") missing.push("не назван автор");
  if (req.year > today) missing.push("год из будущего — похоже на опечатку");
  if (req.text.trim().length < 40) missing.push("текста лицензии нет — ссылка не заменяет текст");
  if (linksOnly) missing.push("ссылка на сайт не годится: приложение работает без сети");

  const title = `${req.by} (${req.year})`;
  const body =
    missing.length === 0
      ? `${title} — ${req.license.toUpperCase()}\n\n${req.text.trim()}`
      : `уведомление неполное: ${missing.join("; ")}`;

  return { title, body, ok: missing.length === 0, missing };
}

/** Где это должно лежать, чтобы человек нашёл. */
export function whereItLives(): string {
  return "раздел «О программе», а не файл в папке установки";
}

/**
 * Чего требует каждая лицензия сверх текста.
 *
 * Разница важна: Apache требует ещё и «изменённые файлы помечены».
 */
export function extraFor(license: Requirement["license"]): string[] {
  if (license === "apache") {
    return ["сохранить уведомление", "пометить изменённые файлы", "не использовать товарные знаки автора"];
  }
  if (license === "bsd") return ["сохранить уведомление", "не использовать имя автора в рекламе без разрешения"];
  return ["сохранить уведомление"];
}

/**
 * Проверка сборки: все ли уведомления полные.
 *
 * Сборка без уведомлений — не ошибка компиляции, поэтому и не замечается.
 */
export function buildCheck(notices: readonly Notice[]): { ok: boolean; said: string } {
  const bad = notices.filter((item) => !item.ok);
  if (bad.length === 0) {
    return { ok: true, said: `уведомлений ${notices.length}, все полные — показаны в «О программе»` };
  }
  return {
    ok: false,
    said: `неполных ${bad.length} из ${notices.length}: ${bad.map((item) => item.title).join(", ")}`,
  };
}
