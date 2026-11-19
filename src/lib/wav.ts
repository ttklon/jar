/**
 * Звук в WAV: то, что можно отдать своему движку распознавания.
 *
 * Почему руками, а не через готовую библиотеку: нужен ровно один формат — моно,
 * 16 бит, 16 кГц, — и он умещается в сто строк. Зато каждая из них проверяема без
 * микрофона: заголовок и преобразование сэмплов — чистые функции.
 *
 * Движок `whisper.cpp` ждёт 16 кГц. Микрофон обычно отдаёт 48 кГц, поэтому здесь есть
 * приведение частоты: без него движок либо откажется, либо распознает «в полтора раза
 * быстрее», и это будет выглядеть как плохое распознавание, а не как наша ошибка.
 */

/** Частота, на которой работает распознавание. */
export const TARGET_RATE = 16_000;

/** Тише этого считаем тишиной: обрезаем, чтобы не гонять воздух. */
export const SILENCE = 0.01;

const HEADER_BYTES = 44;
const BITS = 16;

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

/**
 * Приводит частоту к `to` простым усреднением соседей.
 *
 * Усреднение, а не «взять каждый третий сэмпл»: при прореживании высокие частоты
 * заворачиваются в слышимые, и распознавание получает шум, которого не было.
 */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to || samples.length === 0) return samples;
  if (from < to) return samples;

  const ratio = from / to;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), samples.length);
    let sum = 0;
    for (let at = start; at < end; at += 1) sum += samples[at] ?? 0;
    out[index] = end > start ? sum / (end - start) : 0;
  }

  return out;
}

/**
 * Обрезает тишину по краям. Если тишина везде — возвращает пусто: это не запись, а
 * микрофон, который ничего не услышал.
 */
export function trimSilence(samples: Float32Array, threshold = SILENCE): Float32Array {
  const loud = (value: number) => Math.abs(value) > threshold;

  let start = 0;
  while (start < samples.length && !loud(samples[start] ?? 0)) start += 1;
  if (start === samples.length) return new Float32Array(0);

  let end = samples.length - 1;
  while (end > start && !loud(samples[end] ?? 0)) end -= 1;

  return samples.slice(start, end + 1);
}

/** WAV: моно, 16 бит. Частота — та, в которой сэмплы уже приведены. */
export function encodeWav(samples: Float32Array, sampleRate = TARGET_RATE): Uint8Array {
  const bytes = HEADER_BYTES + samples.length * 2;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  writeAscii(view, 8, "WAVE");

  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // размер блока fmt
  view.setUint16(20, 1, true); // PCM без сжатия
  view.setUint16(22, 1, true); // один канал: речь, стерео не нужно
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // байт в секунду
  view.setUint16(32, 2, true); // байт в кадре
  view.setUint16(34, BITS, true);

  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    // Отрицательная амплитуда и положительная масштабируются по-разному: у -1 ровно
    // 32768 значений, у +1 — 32767.
    const sample = value < 0 ? value * 0x8000 : value * 0x7fff;
    view.setInt16(HEADER_BYTES + index * 2, Math.round(sample), true);
  }

  return new Uint8Array(buffer);
}

/** Сколько секунд в записи — по числу сэмплов и частоте. */
export function secondsOf(samples: Float32Array, sampleRate = TARGET_RATE): number {
  if (sampleRate <= 0) return 0;
  return Math.round((samples.length / sampleRate) * 10) / 10;
}

/**
 * Готовит запись к отправке: приводит частоту, обрезает тишину, кодирует.
 * Пустой результат означает «ничего не сказано» — и это надо сказать человеку.
 */
export function prepare(
  samples: Float32Array,
  from: number,
  to = TARGET_RATE,
): { wav: Uint8Array; seconds: number } {
  const shifted = resample(samples, from, to);
  const trimmed = trimSilence(shifted);
  return { wav: encodeWav(trimmed, to), seconds: secondsOf(trimmed, to) };
}
