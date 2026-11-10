// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createVad, rms, DEFAULT_VAD } from "./vad";

/** Кусок нужной длины: синус — это «речь», нули — тишина. */
function frame(amplitude: number, size = 640): Float32Array {
  const samples = new Float32Array(size);
  if (amplitude === 0) return samples;

  for (let index = 0; index < size; index += 1) {
    samples[index] = amplitude * Math.sin((index / size) * Math.PI * 4);
  }
  return samples;
}

const QUIET = frame(0);
const SPEECH = frame(0.3);

describe("громкость куска", () => {
  it("пустой кусок — это ноль, а не деление на ноль", () => {
    expect(rms(new Float32Array(0))).toBe(0);
  });

  it("тишина и речь отличаются на порядок", () => {
    expect(rms(QUIET)).toBe(0);
    expect(rms(SPEECH)).toBeGreaterThan(DEFAULT_VAD.threshold);
    expect(rms(frame(0.001))).toBeLessThan(DEFAULT_VAD.threshold);
  });
});

describe("когда человек говорит", () => {
  it("один громкий кусок — ещё не начало фразы", () => {
    const vad = createVad();
    expect(vad.feed(SPEECH)).toBeNull();
    expect(vad.speaking()).toBe(false);
  });

  it("речь длиной в нужный срок — начало фразы", () => {
    const vad = createVad({ minSpeechMs: 80 });
    const events = [vad.feed(SPEECH), vad.feed(SPEECH)].filter(Boolean);
    expect(events).toEqual(["start"]);
    expect(vad.speaking()).toBe(true);
  });

  it("щелчок не превращается в задачу: короткий всплеск игнорируется", () => {
    const vad = createVad({ minSpeechMs: 200 });
    expect(vad.feed(SPEECH)).toBeNull();
    // Снова тишина — счётчик речи сбрасывается.
    expect(vad.feed(QUIET)).toBeNull();
    expect(vad.feed(SPEECH)).toBeNull();
    expect(vad.speaking()).toBe(false);
  });

  it("пауза между словами не рвёт фразу на куски", () => {
    const vad = createVad({ minSpeechMs: 80, silenceMs: 300 });
    vad.feed(SPEECH);
    expect(vad.feed(SPEECH)).toBe("start");

    // Одна тихая пауза короче silenceMs — фраза продолжается.
    expect(vad.feed(QUIET)).toBeNull();
    expect(vad.speaking()).toBe(true);

    // И ещё одна: 2 / 0.3 — недостаточно, чтобы закончить.
    expect(vad.feed(QUIET)).toBeNull();
    expect(vad.speaking()).toBe(true);
  });

  it("долгая тишина — конец фразы, и ровно один раз", () => {
    const vad = createVad({ minSpeechMs: 80, silenceMs: 120 });
    vad.feed(SPEECH);
    expect(vad.feed(SPEECH)).toBe("start");

    const events = [];
    for (let index = 0; index < 10; index += 1) {
      events.push(vad.feed(QUIET));
    }

    expect(events.filter((event) => event === "end")).toHaveLength(1);
    expect(vad.speaking()).toBe(false);
  });

  it("после конца фразы можно начать следующую", () => {
    const vad = createVad({ minSpeechMs: 80, silenceMs: 120 });
    vad.feed(SPEECH);
    expect(vad.feed(SPEECH)).toBe("start");
    for (let index = 0; index < 5; index += 1) vad.feed(QUIET);

    expect(vad.feed(SPEECH)).toBeNull();
    expect(vad.feed(SPEECH)).toBe("start");
  });

  it("забытый открытым микрофон закрывается по пределу длины", () => {
    const vad = createVad({ minSpeechMs: 40, maxSpeechMs: 200 });
    expect(vad.feed(SPEECH)).toBe("start");

    let ended = false;
    for (let index = 0; index < 20 && !ended; index += 1) {
      ended = vad.feed(SPEECH) === "end";
    }

    expect(ended).toBe(true);
    expect(vad.speaking()).toBe(false);
  });

  it("тихая комната не запускает ничего, сколько бы её ни слушать", () => {
    const vad = createVad();
    for (let index = 0; index < 500; index += 1) {
      expect(vad.feed(frame(0.002))).toBeNull();
    }
    expect(vad.speaking()).toBe(false);
  });
});
