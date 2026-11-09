// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { microphoneAvailable, NO_MIC, startRecording } from "./recorder";

/**
 * Запись проверяется на заглушке графа: важно не «звук», а контракт — накопить куски,
 * остановить микрофон и вернуть WAV, который движок сможет прочитать.
 */

interface FakeProcessor {
  onaudioprocess: ((event: { inputBuffer: { getChannelData(): Float32Array } }) => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

let processor: FakeProcessor;
let closed: ReturnType<typeof vi.fn>;
let stoppedTracks: number;

function stubAudioContext(sampleRate: number): void {
  stoppedTracks = 0;
  closed = vi.fn().mockResolvedValue(undefined);

  class ContextStub {
    sampleRate = sampleRate;
    destination = { name: "destination" };
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }
    createScriptProcessor() {
      processor = {
        onaudioprocess: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      return processor;
    }
    createGain() {
      return {
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }
    close() {
      return closed();
    }
  }

  vi.stubGlobal("AudioContext", ContextStub);
}

function stubMic(): void {
  const stream = {
    getTracks: () => [{ stop: () => (stoppedTracks += 1) }],
  };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  stoppedTracks = 0;
});

describe("запись с микрофона", () => {
  it("без микрофона говорит об этом прямо", async () => {
    expect(microphoneAvailable()).toBe(false);
    await expect(startRecording()).rejects.toThrow(NO_MIC);
  });

  it("отказ в доступе — это «разрешите», а не «не удалось»", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(
          Object.assign(new Error("denied"), { name: "NotAllowedError" }),
        ),
      },
    });

    await expect(startRecording()).rejects.toThrow(/разрешите доступ/);
  });

  it("накапливает звук и возвращает WAV на нужной частоте", async () => {
    stubAudioContext(48_000);
    stubMic();

    const recorder = await startRecording();
    if (!processor.onaudioprocess) throw new Error("обработчик не подключён");

    // Полсекунды «речи» двумя кусками по 12 000 сэмплов (48 кГц).
    const loud = new Float32Array(12_000).fill(0.5);
    processor.onaudioprocess({ inputBuffer: { getChannelData: () => loud } });
    processor.onaudioprocess({ inputBuffer: { getChannelData: () => loud } });

    const recording = await recorder.stop();
    const view = new DataView(
      recording.wav.buffer,
      recording.wav.byteOffset,
      recording.wav.byteLength,
    );

    expect(String.fromCharCode(...recording.wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(16_000);
    // 24 000 сэмплов на 48 кГц — это полсекунды; после приведения к 16 кГц их 8 000.
    expect(view.getUint32(40, true)).toBe(8_000 * 2);
    expect(recording.seconds).toBe(0.5);

    expect(stoppedTracks).toBe(1);
    expect(processor.disconnect).toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
  });

  it("тишина превращается в пустую запись, а не в «ничего не удалось»", async () => {
    stubAudioContext(16_000);
    stubMic();

    const recorder = await startRecording();
    if (!processor.onaudioprocess) throw new Error("обработчик не подключён");

    const silent = new Float32Array(8_000);
    processor.onaudioprocess({ inputBuffer: { getChannelData: () => silent } });

    const recording = await recorder.stop();
    expect(recording.seconds).toBe(0);
    expect(recording.wav.length).toBe(44);

    // Повторная остановка не ломается и не записывает второй раз.
    const again = await recorder.stop();
    expect(again.seconds).toBe(0);
  });
});
