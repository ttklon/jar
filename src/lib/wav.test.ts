import { describe, expect, it } from "vitest";
import { encodeWav, prepare, resample, secondsOf, TARGET_RATE, trimSilence } from "./wav";

/**
 * WAV проверяется без микрофона: заголовок и сэмплы — это числа, а не звук.
 */

function ascii(bytes: Uint8Array, from: number, length: number): string {
  return String.fromCharCode(...bytes.slice(from, from + length));
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

describe("WAV", () => {
  it("заголовок описывает ровно то, что внутри", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1]);
    const wav = encodeWav(samples, 16_000);
    const data = view(wav);

    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(ascii(wav, 36, 4)).toBe("data");

    expect(data.getUint16(20, true)).toBe(1); // PCM
    expect(data.getUint16(22, true)).toBe(1); // моно
    expect(data.getUint32(24, true)).toBe(16_000);
    expect(data.getUint16(34, true)).toBe(16); // бит на сэмпл
    expect(data.getUint32(28, true)).toBe(32_000); // байт в секунду

    // Размеры согласованы: иначе движок прочитает половину записи и решит, что так и надо.
    expect(data.getUint32(40, true)).toBe(samples.length * 2);
    expect(data.getUint32(4, true)).toBe(wav.length - 8);
    expect(wav.length).toBe(44 + samples.length * 2);
  });

  it("сэмплы превращаются в 16 бит без переполнения", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2]), 16_000);
    const data = view(wav);

    expect(data.getInt16(44, true)).toBe(0);
    expect(data.getInt16(46, true)).toBe(32767);
    expect(data.getInt16(48, true)).toBe(-32768);
    // За пределами [-1, 1] звук не бывает: обрезаем, а не заворачиваем.
    expect(data.getInt16(50, true)).toBe(32767);
    expect(data.getInt16(52, true)).toBe(-32768);
  });

  it("частота приводится усреднением, а не выбрасыванием сэмплов", () => {
    const samples = new Float32Array(4800).fill(0.5);
    const down = resample(samples, 48_000, TARGET_RATE);

    expect(down.length).toBe(1600);
    expect(down[0]).toBeCloseTo(0.5);

    // Уже нужной частоты — не трогаем: лишнее преобразование только портит звук.
    expect(resample(samples, 16_000, 16_000)).toBe(samples);
  });

  it("тишина по краям обрезается, сплошная тишина — это пусто", () => {
    const samples = new Float32Array([0, 0, 0.4, 0.6, 0.2, 0, 0, 0]);
    const trimmed = trimSilence(samples);

    expect(trimmed.length).toBe(3);
    expect(trimmed[0]).toBeCloseTo(0.4);
    expect(trimmed[1]).toBeCloseTo(0.6);
    expect(trimmed[2]).toBeCloseTo(0.2);

    const silent = trimSilence(new Float32Array(1000));
    expect(silent.length).toBe(0);
  });

  it("готовит запись к отправке и говорит, сколько в ней секунд", () => {
    const samples = new Float32Array(48_000).fill(0.3); // одна секунда на 48 кГц
    const { wav, seconds } = prepare(samples, 48_000);

    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(view(wav).getUint32(24, true)).toBe(TARGET_RATE);
    expect(seconds).toBe(1);
    expect(secondsOf(new Float32Array(24_000))).toBe(1.5);

    // Тишина превращается в пустую запись: отправлять её движку незачем.
    const nothing = prepare(new Float32Array(16_000), 16_000);
    expect(nothing.seconds).toBe(0);
    expect(view(nothing.wav).getUint32(40, true)).toBe(0);
  });
});
