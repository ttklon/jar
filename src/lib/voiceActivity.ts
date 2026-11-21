/**
 * Речь или шум: не громкость, а форма спектра.
 *
 * Простой порог по громкости (`vad.ts`) не отличает речь от улицы: шум дороги и
 * голос человека рядом с микрофоном дают одинаковый RMS. Отсюда оба неприятных
 * случая сразу — шум запускает фразу, а тихая речь теряется.
 *
 * Что действительно отличает речь: у неё **энергия сосредоточена в немногих
 * полосах** и она **меняется** во времени (слоги, паузы, ударения). У шума
 * энергия размазана ровно. Отсюда три признака, и все три считаются над числами
 * без браузера:
 *
 *  * **плоскостность спектра** (spectral flatness): отношение среднего
 *    геометрического к среднему арифметическому по полосам. У шума близко к 1, у
 *    речи — заметно меньше;
 *  * **изменчивость**: насколько энергия скачет от куска к куску. Шум ровный,
 *    речь — нет;
 *  * **пики над полом**: сколько полос заметно выше медианы. У речи есть
 *    «горбы» (форманты), у шума — равномерный ковёр.
 *
 * Здесь нет ни микрофона, ни FFT из браузера: на вход идёт уже разложенная по
 * полосам энергия. Так правило проверяется синтетическим сигналом, а не «на слух».
 */

/** Разложение куска на полосы: массив энергий (не амплитуд) по возрастанию частоты. */
export type Bands = number[];

/**
 * Плоскостность спектра: 1 — идеально ровный шум, меньше — выраженная структура.
 *
 * Считается в логарифмах, потому что энергии отличаются на порядки; иначе одна
 * громкая полоса делает результат нулём при любом шуме.
 */
export function flatness(bands: Bands): number {
  const usable = bands.filter((band) => Number.isFinite(band) && band > 0);
  if (usable.length === 0) return 1;

  const logs = usable.map((band) => Math.log(band));
  const meanLog = logs.reduce((sum, value) => sum + value, 0) / logs.length;
  const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;

  const ratio = Math.exp(meanLog) / mean;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Сколько полос заметно выше медианы — форма спектра, а не уровень.
 *
 * У речи есть горбы: одна-две полосы в разы громче остальных. У шума все полосы
 * примерно равны, и медиана почти совпадает с каждой из них.
 */
export function peakiness(bands: Bands): number {
  const usable = bands.filter((band) => Number.isFinite(band) && band >= 0);
  if (usable.length === 0) return 0;

  const sorted = [...usable].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (middle <= 0) {
    // Медиана нулевая: либо тишина, либо всё в одной полосе.
    const loudest = sorted[sorted.length - 1] ?? 0;
    return loudest > 0 ? 1 : 0;
  }

  const loud = usable.filter((band) => band > middle * 2).length;
  return loud / usable.length;
}

/**
 * Изменчивость энергии между кусками: 0 — ровно, 1 — сильно скачет.
 *
 * Считается по истории уровней, а не по одному куску: «скачет» имеет смысл
 * только в сравнении с предыдущими.
 */
export function variability(levels: number[]): number {
  const usable = levels.filter((level) => Number.isFinite(level) && level >= 0);
  if (usable.length < 2) return 0;

  const mean = usable.reduce((sum, level) => sum + level, 0) / usable.length;
  if (mean <= 0) return 0;

  const deviation =
    usable.reduce((sum, level) => sum + Math.abs(level - mean), 0) / usable.length;
  return Math.min(1, deviation / mean);
}

/** Что решили про кусок. */
export type Verdict = "speech" | "noise" | "silence";

/**
 * Пороги. Не список «все условия сразу», а шкала: структура спектра — главный
 * признак, изменчивость — подтверждающий.
 *
 * Почему не «все три признака обязательны»: ровный гласный звук (человек тянет
 * «а-а-а») имеет яркую структуру, но почти не меняется — и строгое «и» отвергло
 * бы живую речь. Это нашлось пробой на синтетическом сигнале, а не на слух.
 */
export const DEFAULTS = {
  /** Ниже этого уровня (RMS) — тишина, дальше не смотрим. */
  silence: 0.006,
  /** Плоскостность ниже этого — структура есть; выше — ровный ковёр. */
  flat: 0.55,
  /** Структуры достаточно самой по себе, без изменчивости. */
  structureStrong: 0.45,
  /** Изменчивость, ниже которой считаем источник ровным. */
  change: 0.25,
  /** Доля «горбов», выше которой это щелчок или музыка, а не речь. */
  peaks: 0.9,
} as const;

export interface ActivityOptions {
  silence?: number;
  flat?: number;
  change?: number;
  peaks?: number;
}

/**
 * Решение по одному куску с учётом истории.
 *
 * Два шага, и оба объяснимы человеку:
 *
 * 1. **Есть ли структура.** Плоскостность 1 — ровный шум (улица, вентилятор);
 *    заметно меньше — в спектре есть горбы, а значит источник не «ковёр».
 * 2. **Если структура слабая** — выручает изменчивость: живая речь скачет по
 *    уровню, ровный гул нет.
 *
 * Цена ошибки несимметрична: принять гудок за речь хуже, чем пропустить кусок
 * речи. Поэтому изменчивость только помогает структуре, а не заменяет её.
 */
export function classify(
  bands: Bands,
  level: number,
  history: number[] = [],
  options: ActivityOptions = {},
): Verdict {
  const settings = { ...DEFAULTS, ...options };

  if (!Number.isFinite(level) || level < settings.silence) return "silence";

  const flat = flatness(bands);
  const structure = 1 - flat;
  const peaks = peakiness(bands);
  const change = variability([...history, level]);

  // Щелчок и музыка: горбов почти нет, зато все полосы громкие сразу.
  if (peaks > settings.peaks && structure < 0.3) return "noise";

  // Сильная структура говорит сама за себя — даже у ровного гласного.
  if (structure >= settings.structureStrong) return "speech";

  // Слабая структура плюс изменчивость: шумная комната с речью, где шум
  // размывает горбы, но слоги всё равно слышны.
  if (structure >= 0.25 && change >= settings.change) return "speech";

  return "noise";
}

/**
 * Накопитель истории уровней: последние N кусков.
 *
 * Ограничен нарочно: «скачет» — это про последнюю секунду-две, а не про весь
 * разговор. Длинная история сглаживает изменчивость и делает шум похожим на речь.
 */
export function createHistory(size = 12): {
  push: (level: number) => number[];
  reset: () => void;
  levels: () => number[];
} {
  let levels: number[] = [];

  return {
    push(level: number): number[] {
      levels = [...levels, level].slice(-size);
      return levels;
    },
    reset(): void {
      levels = [];
    },
    levels: () => levels,
  };
}

/**
 * Полосовой фильтр: кусок звука → энергии по полосам.
 *
 * Своё ДПФ на коротком окне, а не `AnalyserNode`: тот отдаёт готовый спектр, но
 * только в живом браузере, и правило нельзя было бы проверить тестом. Окно 512
 * точек при 16 кГц — это 32 мс, 16 полос по 250 Гц: достаточно, чтобы увидеть
 * горбы речи, и достаточно дёшево, чтобы считать на каждом куске.
 *
 * Полосы — это суммы |X[k]|², а не амплитуды: энергия складывается, а фазы
 * разных частот гасили бы друг друга.
 */
export function bandEnergy(
  samples: Float32Array,
  options: { bands?: number; sampleRate?: number } = {},
): Bands {
  const count = options.bands ?? 16;
  const size = 512;
  const n = Math.min(size, samples.length);
  if (n === 0 || count <= 0) return new Array(count).fill(0);

  const bins = size / 2;
  const energy = new Array(bins).fill(0);

  for (let k = 0; k < bins; k += 1) {
    let real = 0;
    let imaginary = 0;
    for (let t = 0; t < n; t += 1) {
      const angle = (2 * Math.PI * k * t) / size;
      // Окно Ханна: без него края куска дают ложные «горбы».
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / (n - 1 || 1));
      const value = (samples[t] ?? 0) * window;
      real += value * Math.cos(angle);
      imaginary -= value * Math.sin(angle);
    }
    energy[k] = real * real + imaginary * imaginary;
  }

  // Группируем в полосы: речь живёт в первых килогерцах, выше — тише.
  const per = Math.max(1, Math.floor(bins / count));
  const out: number[] = [];
  for (let band = 0; band < count; band += 1) {
    let sum = 0;
    for (let index = band * per; index < Math.min(bins, (band + 1) * per); index += 1) {
      sum += energy[index] ?? 0;
    }
    out.push(sum / per);
  }
  return out;
}
