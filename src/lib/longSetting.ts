/**
 * Порог «слишком долго» настраивается человеком (шаг 139).
 *
 * Дефект. Порог был **зашит числом** (4 с, шаг 129), и на слабой машине он врал:
 *
 *  * **слабая машина — другое ожидание**: 6 секунд на её ядре — это норма, а зашитые
 *    4 с превращают норму в «это зависло»;
 *  * **человек знает лучше**: если он привык ждать 15 с, порог в 4 с — это вопросы на
 *    ровном месте, и их начинают игнорировать;
 *  * **настройка без предела — новая беда**: «ждать вечно» возвращает бесконечный
 *    спиннер (134);
 *  * **настройка без названного значения непонятна**: «порог: 6000» — это миллисекунды
 *    или секунды? Число без единицы и без границ не настройка, а поле ввода.
 *
 * Правило: **порог задаёт человек, но в названных границах, и он видит, что выбрал**.
 *
 *  1. **Значение — человека**: сохранённое, а не зашитое.
 *  2. **Границы названы**: от 1 до 60 с. Ниже — вопросы на ровном месте, выше — вечный
 *     спиннер.
 *  3. **Единица и слова**: в поле — секунды и подпись «дольше этого — спрошу, ждать ли».
 *  4. **Кривое значение не ломает порог**: пусто, «abc», минус — берётся прежнее, и
 *     сказано почему.
 *  5. **Порог — не единственный**: у дела свои сроки (134); настройка двигает **общий**
 *     порог «это долго», а не превращает модель в диск.
 *
 * Почему не «подстроить автоматически по машине». Автоподстройка — это гадание о том,
 * чего человек хочет; слабая машина — повод **предложить** больше, а не решать за него.
 */

/** Границы порога, в секундах. */
export const MIN_S = 1;
export const MAX_S = 60;

/** Что выбрал человек. */
export interface Setting {
  /** Порог в секундах. */
  seconds: number;
  /** Почему это значение действует: выбрано, скорректировано или по умолчанию. */
  origin: "chosen" | "clamped" | "default";
}

export const DEFAULT_S = 4;

/** Подпись к полю — единица и смысл, а не «timeout». */
export function hint(): string {
  return `дольше ${MIN_S}–${MAX_S} с — спрошу, ждать ли; по умолчанию ${DEFAULT_S} с`;
}

/**
 * Прочитать значение из поля.
 *
 * Кривое не ломает порог: берётся прежнее, и сказано, почему — молчаливая замена на
 * «по умолчанию» выглядит как сброс настроек.
 */
export function read(raw: string, previous: Setting): { setting: Setting; said: string } {
  const text = raw.trim().replace(",", ".");
  if (text === "") {
    return { setting: previous, said: `пусто — оставляю ${previous.seconds} с` };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    return { setting: previous, said: `«${raw.trim()}» — не число: оставляю ${previous.seconds} с` };
  }
  if (value < MIN_S) {
    // Ниже — вопросы на ровном месте: порог не «очень чуткий», а шумный.
    return { setting: { seconds: MIN_S, origin: "clamped" }, said: `меньше ${MIN_S} с нельзя — ставлю ${MIN_S} с` };
  }
  if (value > MAX_S) {
    // Выше — вечный спиннер (134): граница названа, а не спрятана.
    return { setting: { seconds: MAX_S, origin: "clamped" }, said: `больше ${MAX_S} с нельзя — ставлю ${MAX_S} с: иначе «долго» не наступит никогда` };
  }
  return { setting: { seconds: value, origin: "chosen" }, said: `порог ${value} с: дольше — спрошу, ждать ли` };
}

/** Порог в миллисекундах — то, что нужно проверкам (129). */
export function ms(setting: Setting): number {
  return Math.round(setting.seconds * 1000);
}

/** Что сохранить — одно число, без лишнего. */
export function save(setting: Setting): string {
  return String(setting.seconds);
}

/** Что прочитать из хранилища; мусор — по умолчанию, с объяснением. */
export function load(saved: string | null): { setting: Setting; said: string } {
  if (saved === null || saved.trim() === "") {
    return { setting: { seconds: DEFAULT_S, origin: "default" }, said: `порог по умолчанию: ${DEFAULT_S} с` };
  }
  return read(saved, { seconds: DEFAULT_S, origin: "default" });
}

/**
 * Предложение для слабой машины.
 *
 * Предложение, а не решение: «на этой машине обычно 8 с — поставить?» — человек
 * решает.
 */
export function suggest(weak: boolean, typicalMs: number | null): string {
  if (!weak) return "";
  if (typicalMs === null) return "машина слабая: можно поставить порог больше 4 с — тогда не буду спрашивать зря";
  const seconds = Math.min(MAX_S, Math.max(MIN_S, Math.ceil(typicalMs / 1000) + 1));
  return `машина слабая, на ней обычно ${Math.round(typicalMs / 1000)} с — поставить порог ${seconds} с?`;
}

/** Действует ли порог так, как сказано. */
export function effective(setting: Setting, waitedMs: number): { ask: boolean; said: string } {
  if (waitedMs <= ms(setting)) return { ask: false, said: "" };
  return {
    ask: true,
    said: `дольше ${setting.seconds} с — это долго (${Math.round(waitedMs / 1000)} с). Ждать?`,
  };
}
