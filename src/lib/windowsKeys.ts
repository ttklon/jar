/**
 * Шаг 283: Microsoft PowerToys — горячие клавиши и утилиты без обучения.
 *
 * Что взято. PowerToys выигрывает не функциями, а тем, что **не надо учиться**:
 * `Win+Shift+S` — скриншот, `Alt+Space` — окно, `Win+V` — история буфера. Это
 * стандарт Windows, и человек уже знает эти клавиши. Наши сочетания должны жить
 * по тем же правилам.
 *
 * Правила, которые и есть содержание шага:
 *
 *  1. **занимать только свободное.** Если сочетание уже занято Windows или
 *     популярной программой, оно не сработает — и человек решит, что сломано
 *     приложение, а не сочетание;
 *  2. **не менять чужие клавиши молча.** Перехват `Ctrl+C` — это не «удобно», а
 *     поломка всего, что человек делает;
 *  3. **у каждого сочетания есть отказ.** Клавиши не срабатывают, если
 *     приложение, которому они принадлежат, запрещено (шаг 277) или человек их
 *     отключил;
 *  4. **конфликт называется, а не решается сам.** «Занято» с указанием чем —
 *     человек сам выберет другое.
 */

/** Что человек нажал — в виде, независимом от раскладки. */
export interface Combo {
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly shift?: boolean;
  readonly win?: boolean;
  /** Клавиша в нижнем регистре: `k`, `space`, `f1`. */
  readonly key: string;
}

/** Куда ведёт сочетание. */
export interface Binding {
  readonly combo: Combo;
  /** Что делает — словами, а не «действие». */
  readonly does: string;
  /** Что считает занятым: `windows`, `app:chrome`, `none`. */
  readonly taken?: string;
}

/**
 * Сочетания, которые уже заняты Windows и популярными программами.
 *
 * Не «всё, что существует»: только то, что встретится. Список короткий осознанно
 * — длинный список запретов сам становится поводом не делать ничего.
 */
export const TAKEN: readonly { combo: Combo; by: string }[] = [
  { combo: { ctrl: true, key: "c" }, by: "windows: копировать" },
  { combo: { ctrl: true, key: "v" }, by: "windows: вставить" },
  { combo: { ctrl: true, key: "x" }, by: "windows: вырезать" },
  { combo: { ctrl: true, key: "z" }, by: "windows: отменить" },
  { combo: { ctrl: true, key: "a" }, by: "windows: выделить всё" },
  { combo: { alt: true, key: "f4" }, by: "windows: закрыть окно" },
  { combo: { alt: true, key: "tab" }, by: "windows: переключить окно" },
  { combo: { win: true, key: "l" }, by: "windows: заблокировать" },
  { combo: { win: true, key: "s" }, by: "windows: поиск" },
  { combo: { win: true, key: "v" }, by: "windows: история буфера" },
  { combo: { win: true, shift: true, key: "s" }, by: "windows: ножницы" },
  { combo: { ctrl: true, shift: true, key: "t" }, by: "app: браузеры — открыть вкладку" },
];

/**
 * Привести сочетание к сравнимому виду.
 *
 * Порядок модификаторов не важен (`Ctrl+Shift+T` = `Shift+Ctrl+T`), иначе одно и
 * то же сочетание считалось бы разным при разном порядке нажатия.
 */
export function combo(input: Combo): string {
  const parts: string[] = [];
  if (input.ctrl) parts.push("ctrl");
  if (input.alt) parts.push("alt");
  if (input.shift) parts.push("shift");
  if (input.win) parts.push("win");
  parts.push(input.key.toLowerCase());
  return parts.join("+");
}

/** Разобрать строку записи: `Ctrl+Shift+T` → `Combo`. */
export function parse(text: string): Combo | null {
  const words = text
    .toLowerCase()
    .split("+")
    .map((word) => word.trim())
    .filter((word) => word !== "");
  if (words.length === 0) return null;

  const out: { ctrl?: boolean; alt?: boolean; shift?: boolean; win?: boolean; key?: string } = {};
  for (const word of words) {
    if (word === "ctrl" || word === "control") out.ctrl = true;
    else if (word === "alt") out.alt = true;
    else if (word === "shift") out.shift = true;
    else if (word === "win") out.win = true;
    else if (out.key === undefined) out.key = word;
    // Две клавиши без модификатора — не сочетание, а опечатка.
    else return null;
  }
  if (out.key === undefined) return null;
  // Сочетание только из модификаторов — не сочетание.
  if (["ctrl", "alt", "shift", "win"].includes(out.key)) return null;
  return out as Combo;
}

/**
 * Можно ли назначить сочетание.
 *
 * Свободное — да. Занятое — «нет» с названием того, кто занял: человек сам
 * выберет другое, а не будет гадать, почему его клавиши не работают.
 */
export function free(binding: Combo): { ok: boolean; said: string } {
  const key = combo(binding);
  if (!binding.ctrl && !binding.alt && !binding.win) {
    // Без модификатора клавиша должна попадать в поле ввода.
    return { ok: false, said: `${key} — без Ctrl, Alt или Win это обычная клавиша: она нужна для набора текста` };
  }
  const taken = TAKEN.find((item) => combo(item.combo) === key);
  if (taken !== undefined) {
    return { ok: false, said: `${key} уже занято — ${taken.by}` };
  }
  return { ok: true, said: `${key} свободно` };
}

/**
 * Проверить весь набор.
 *
 * Возвращает и занятые, и **дубли между своими**: два действия на одном
 * сочетании — это лотерея, и в ней проигрывает то, которое человек хотел.
 */
export function check(bindings: readonly Binding[]): { ok: boolean; said: string; problems: string[] } {
  const problems: string[] = [];
  const seen = new Map<string, string>();

  for (const binding of bindings) {
    const key = combo(binding.combo);
    const verdict = free(binding.combo);
    if (!verdict.ok) problems.push(`${binding.does}: ${verdict.said}`);

    const previous = seen.get(key);
    if (previous !== undefined) {
      problems.push(`${key}: «${previous}» и «${binding.does}» на одном сочетании — сработает одно, и не то`);
    } else {
      seen.set(key, binding.does);
    }
  }

  return {
    ok: problems.length === 0,
    said:
      problems.length === 0
        ? `все ${bindings.length} сочетаний свободны и не повторяются`
        : `проблем ${problems.length}: ${problems.slice(0, 3).join("; ")}`,
    problems,
  };
}

/**
 * Наши сочетания.
 *
 * Только там, где стандарт Windows не занят: разговор и палитра. Оба — на
 * `Ctrl+Space`/`Ctrl+K`, которые человек угадает, потому что так у всех.
 */
export const OURS: readonly Binding[] = [
  { combo: { ctrl: true, key: "space" }, does: "сказать голосом" },
  { combo: { ctrl: true, key: "k" }, does: "палитра команд" },
  { combo: { ctrl: true, shift: true, key: "space" }, does: "показать, что я услышал" },
];
