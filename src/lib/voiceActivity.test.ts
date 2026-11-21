import { describe, expect, it } from "vitest";
import {
  bandEnergy,
  classify,
  createHistory,
  flatness,
  peakiness,
  variability,
} from "./voiceActivity";

/** Ровный шум: все полосы примерно равны. */
const noiseBands = (level = 0.05): number[] =>
  Array.from({ length: 16 }, () => level * (1 + (Math.random() - 0.5) * 0.1));

/** Речь: несколько горбов (форманты) на низком фоне. */
const speechBands = (): number[] => {
  const bands = Array.from({ length: 16 }, () => 0.002);
  bands[2] = 0.4;
  bands[4] = 0.25;
  bands[7] = 0.08;
  return bands;
};

describe("речь или шум: форма спектра, а не громкость", () => {
  it("ровный шум — это шум, даже когда он громкий", () => {
    // Именно этого не умеет порог по громкости: громкий шум — не речь.
    const bands = noiseBands(0.5);
    expect(flatness(bands)).toBeGreaterThan(0.8);
    expect(classify(bands, 0.5, [0.5, 0.5, 0.5])).toBe("noise");
  });

  it("тихая речь слышна, хотя шум громче", () => {
    const bands = speechBands();
    // Меняющийся уровень: слоги, а не ровный гул.
    expect(classify(bands, 0.02, [0.01, 0.03, 0.015])).toBe("speech");
    // И даже ровно протянутый гласный — речь: структура сильная сама по себе.
    expect(classify(bands, 0.02, [0.02, 0.02, 0.02])).toBe("speech");
  });

  it("плоскостность различает структуру, а не уровень", () => {
    // Умножение на константу — это громкость, и она не должна менять решение.
    const quiet = flatness(speechBands());
    const loud = flatness(speechBands().map((band) => band * 1000));
    expect(loud).toBeCloseTo(quiet, 5);
  });

  it("тишина не считается речью, сколько бы полос ни было", () => {
    expect(classify(speechBands(), 0.0001, [0.0001])).toBe("silence");
    expect(classify([], 0)).toBe("silence");
  });

  it("ровный гул на одном уровне не становится речью от громкости", () => {
    // «Слушаю всегда» с таким порогом не откроет фразу на улице.
    const history = [0.3, 0.3, 0.3, 0.3];
    expect(classify(noiseBands(0.3), 0.3, history)).toBe("noise");
  });

  it("один щелчок не проходит: широкополосный всплеск — не речь", () => {
    // Щелчок — ровный по полосам, как шум: структуры нет.
    const click = Array.from({ length: 16 }, () => 0.6);
    expect(classify(click, 0.6, [0.001, 0.001])).toBe("noise");
  });

  it("изменчивость считается по истории и не зависит от масштаба", () => {
    expect(variability([1, 1, 1, 1])).toBe(0);
    expect(variability([1, 3, 1, 3])).toBeGreaterThan(0.4);
    // Тихо и громко с одинаковым рисунком — одинаково изменчиво.
    expect(variability([0.01, 0.03, 0.01])).toBeCloseTo(variability([10, 30, 10]), 5);
  });

  it("пики: у речи горбы, у шума ковёр", () => {
    expect(peakiness(speechBands())).toBeGreaterThan(0);
    expect(peakiness(noiseBands())).toBe(0);
    // Пустой спектр не роняет проверку.
    expect(peakiness([])).toBe(0);
  });

  it("история ограничена: старый шум не сглаживает новую речь", () => {
    const history = createHistory(3);
    history.push(0.5);
    history.push(0.5);
    history.push(0.5);
    history.push(0.01);
    // В истории остались только последние три: длинная память сделала бы
    // изменчивость незаметной.
    expect(history.levels()).toEqual([0.5, 0.5, 0.01]);
    history.reset();
    expect(history.levels()).toEqual([]);
  });

  it("чистый тон даёт горб в одной полосе, шум — ровный ковёр", () => {
    // 440 Гц при 16 кГц: ожидаем горб во второй полосе и тишину в остальных.
    const rate = 16000;
    const tone = new Float32Array(512);
    for (let index = 0; index < tone.length; index += 1) {
      tone[index] = Math.sin((2 * Math.PI * 440 * index) / rate);
    }
    const toneBands = bandEnergy(tone, { bands: 16, sampleRate: rate });
    expect(peakiness(toneBands)).toBeGreaterThan(0);
    // Тон — это структура, а не шум: решение должно быть «речь», а не «шум».
    expect(flatness(toneBands)).toBeLessThan(0.5);

    // Ровный шум раскладывается почти одинаково по всем полосам.
    const noise = new Float32Array(512);
    let seed = 12345;
    for (let index = 0; index < noise.length; index += 1) {
      // Детерминированный псевдошум: тест не должен зависеть от Math.random.
      seed = (seed * 1103515245 + 12345) % 2147483648;
      noise[index] = (seed / 2147483648 - 0.5) * 0.4;
    }
    expect(flatness(bandEnergy(noise))).toBeGreaterThan(0.6);
  });

  it("пустой кусок не роняет разбор", () => {
    expect(bandEnergy(new Float32Array(0)).every((band) => band === 0)).toBe(true);
    expect(bandEnergy(new Float32Array(4), { bands: 3 })).toHaveLength(3);
  });
});
