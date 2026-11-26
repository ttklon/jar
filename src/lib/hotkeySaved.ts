/**
 * Шаг 452: проверка занятости горячей клавиши до сохранения.
 *
 * `hotkeyFree` (шаг 446) умеет проверить и объяснить. Здесь — **место сохранения**:
 * то, что видит человек, когда назначает клавишу, и что происходит при отказе.
 *
 * Главная ошибка, которую надо исключить: **сохранили, а оно не работает**.
 * Человек нажимает «назначить», настройка сохраняется, клавиша занята другой
 * программой — и он узнаёт об этом, когда она не сработает. Через неделю.
 *
 * Поэтому: проверка **до** сохранения, ответ всегда словами, а при отказе
 * предлагается **свободная** альтернатива, а не «попробуйте другую».
 */

import { byDefault, check, format, type Combo } from "./hotkeyFree";

/** Что видит человек после «назначить». */
export interface Result {
  /** Сохранено ли. */
  readonly saved: boolean;
  /** Что сказать — всегда, при любом исходе. */
  readonly said: string;
  /** Какая клавиша теперь действует (новая или прежняя). */
  readonly active: Combo;
}

/**
 * Назначить.
 *
 * `taken` — что занято (система + другие программы), `known` — удалось ли
 * проверить.
 */
export function assign(want: Combo, current: Combo, taken: readonly string[], known = true): Result {
  const verdict = check(want, taken, known);
  if (!verdict.ok) {
    return { saved: false, active: current, said: `${verdict.said}. Прежняя клавиша осталась: ${format(current)}` };
  }
  return { saved: true, active: want, said: `${verdict.said}; сохранил` };
}

/**
 * Свободная альтернатива.
 *
 * Перебираем варианты по порядку и **говорим, что проверяли**: «свободна из
 * трёх». Не «попробуйте другую» — человек и так не знает, какая свободна.
 */
export function suggest(taken: readonly string[], known = true): { combo: Combo | null; said: string } {
  const candidates: Combo[] = [
    { mods: ["ctrl", "alt"], key: "space" },
    { mods: ["ctrl", "shift"], key: "space" },
    { mods: ["ctrl", "alt"], key: "z" },
  ];

  for (const candidate of candidates) {
    if (check(candidate, taken, known).ok) {
      return { combo: candidate, said: `свободна: ${format(candidate)} — из трёх проверенных` };
    }
  }
  return { combo: null, said: "свободной клавиши из обычных не нашлось: назначьте свою, я проверю" };
}

/**
 * Что показано в настройках.
 *
 * Действующая клавиша — всегда видна, даже если её не назначали: по умолчанию
 * есть, и человек должен знать, какая.
 */
/**
 * Как клавиша выглядит человеку.
 *
 * `format` — для сравнения (нижний регистр, фиксированный порядок), а на экране
 * нужно «Ctrl+Alt+Space»: подпись на клавише пишется с большой буквы.
 */
export function pretty(combo: Combo): string {
  const names: Record<string, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", win: "Win" };
  const order: ("ctrl" | "alt" | "shift" | "win")[] = ["ctrl", "alt", "shift", "win"];
  const mods = order.filter((mod) => combo.mods.includes(mod)).map((mod) => names[mod]!);
  return [...mods, combo.key === "space" ? "Space" : combo.key.toUpperCase()].join("+");
}

export function shown(current: Combo): string {
  return `сейчас: ${pretty(current)}. Нажмите «изменить», чтобы назначить другую — проверю занятость до сохранения`;
}

/**
 * Что происходит, если проверка недоступна.
 *
 * Честно: назначаем только с подтверждением человека. Не «сохраним молча и
 * посмотрим».
 */
export function whenUnknown(want: Combo): string {
  return `${format(want)}: занятость проверить не удалось. Сохранить с риском, что она не сработает?`;
}

/**
 * Что проверяет тест.
 *
 * Три исхода — сохранено, не сохранено с причиной, не сохранено с альтернативой.
 */
export function cases(): string[] {
  return ["свободна — сохранено", "занята — не сохранено, прежняя осталась", "не проверить — спросим, а не сохраним молча"];
}

/**
 * Что не делает назначение.
 *
 * Три дефекта — все про «сохранили, а не работает».
 */
export function notDo(): string[] {
  return [
    "не сохраняет при отказе проверки: прежняя клавиша остаётся действующей",
    "не теряет действующую клавишу при неудачном назначении",
    "не предлагает «попробуйте другую»: предлагается конкретная свободная",
  ];
}

/** Клавиша по умолчанию — для экрана настроек. */
export function current(): Combo {
  return byDefault();
}
