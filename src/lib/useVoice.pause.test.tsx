// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FrameSink, Recorder } from "./recorder";

/**
 * Отправка по паузе: кнопку держим, фраза за фразой уходит сама, как только человек
 * замолчал. Так разговор перестаёт быть рацией: пока он думает, ему не надо держать палец.
 */

let sink: FrameSink | null = null;
let opened = 0;

const recorder = (): Recorder => ({
  stop: async () => {
    opened += 1;
    // Разные записи — чтобы видно было, что это разные фразы, а не одна.
    return { wav: new Uint8Array([opened]), seconds: 1.0, sampleRate: 16_000 };
  },
});

vi.mock("./recorder", async () => {
  const actual = await vi.importActual<typeof import("./recorder")>("./recorder");
  return {
    ...actual,
    microphoneAvailable: () => true,
    startRecording: vi.fn(async (_rate?: number, onFrame?: FrameSink) => {
      sink = onFrame ?? null;
      return recorder();
    }),
  };
});

const { useVoice } = await import("./useVoice");

function speech(amplitude = 0.3): Float32Array {
  const samples = new Float32Array(1024);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin((index / samples.length) * Math.PI * 4);
  }
  return samples;
}

const quiet = new Float32Array(1024);

function feed(frame: Float32Array) {
  act(() => {
    sink?.(frame, 16_000);
  });
}

afterEach(() => {
  cleanup();
  sink = null;
  opened = 0;
  vi.clearAllMocks();
});

describe("отправка по паузе при удержании", () => {
  it("отпускать не нужно: замолчал — фраза ушла, микрофон слушает дальше", async () => {
    const transcribe = vi
      .fn()
      .mockResolvedValueOnce("открой почту")
      .mockResolvedValueOnce("и покажи календарь");
    const onText = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ local: { transcribe }, onText, onError: vi.fn() }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(sink).not.toBeNull());

    // Первая фраза: речь, потом тишина.
    for (let index = 0; index < 5; index += 1) feed(speech());
    for (let index = 0; index < 20; index += 1) feed(quiet);

    await waitFor(() => expect(onText).toHaveBeenCalledWith("открой почту"));

    // Кнопку никто не отпускал — микрофон слушает следующую фразу.
    expect(result.current.listening).toBe(true);

    await waitFor(() => expect(sink).not.toBeNull());
    for (let index = 0; index < 5; index += 1) feed(speech());
    for (let index = 0; index < 20; index += 1) feed(quiet);

    await waitFor(() => expect(onText).toHaveBeenCalledWith("и покажи календарь"));
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(result.current.listening).toBe(true);
  });

  it("отпустил — текущая фраза уходит, и слушание прекращается", async () => {
    const transcribe = vi.fn().mockResolvedValue("поставь будильник");
    const onText = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ local: { transcribe }, onText, onError: vi.fn() }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(sink).not.toBeNull());

    act(() => result.current.stop());

    await waitFor(() => expect(onText).toHaveBeenCalledWith("поставь будильник"));
    expect(result.current.listening).toBe(false);
  });

  it("без своего движка пауз не бывает: системное распознавание однократное", () => {
    const onText = vi.fn();
    const { result } = renderHook(() =>
      useVoice({ local: null, pauseSend: true, onText, onError: vi.fn() }),
    );

    act(() => result.current.start());
    act(() => result.current.stop());

    // Микрофон системного распознавания открыт и закрыт; записей своего движка нет.
    expect(onText).not.toHaveBeenCalled();
  });
});
