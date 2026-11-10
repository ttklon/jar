// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FrameSink, Recorder } from "./recorder";

/**
 * Режим «слушаю всегда» проверяется без микрофона: рекордер подменён, а куски звука
 * подаются руками. Так видно главное — фраза начинается и заканчивается по тишине,
 * разбор запускается сам, и микрофон не остаётся открытым после выключения режима.
 */

let sink: FrameSink | null = null;
let stopped = 0;

const recorder: Recorder = {
  stop: async () => {
    stopped += 1;
    return { wav: new Uint8Array([1, 2, 3]), seconds: 1.5, sampleRate: 16_000 };
  },
};

vi.mock("./recorder", async () => {
  const actual = await vi.importActual<typeof import("./recorder")>("./recorder");
  return {
    ...actual,
    microphoneAvailable: () => true,
    startRecording: vi.fn(async (_rate?: number, onFrame?: FrameSink) => {
      sink = onFrame ?? null;
      return recorder;
    }),
  };
});

const { useVoice } = await import("./useVoice");

/** Кусок «речи» и кусок «тишины»: длина 1024, как у рекордера. */
function speech(amplitude = 0.3): Float32Array {
  const samples = new Float32Array(1024);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = amplitude * Math.sin((index / samples.length) * Math.PI * 4);
  }
  return samples;
}

const quiet = new Float32Array(1024);

function feed(frame: Float32Array) {
  expect(sink).not.toBeNull();
  return act(() => {
    sink?.(frame, 16_000);
  });
}

afterEach(() => {
  cleanup();
  sink = null;
  stopped = 0;
  vi.clearAllMocks();
});

describe("слушаю всегда", () => {
  it("фраза начинается и заканчивается по тишине, без кнопки", async () => {
    const transcribe = vi.fn(async () => "открой папку загрузки");
    const onText = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ always: true, local: { transcribe }, onText, onError }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(sink).not.toBeNull());

    // 64 мс на кусок: несколько кусков речи — начало фразы.
    for (let index = 0; index < 5; index += 1) feed(speech());
    await waitFor(() => expect(result.current.speaking).toBe(true));
    expect(onText).not.toHaveBeenCalled();

    // Тишина длиной больше порога — конец фразы, дальше разбор сам.
    for (let index = 0; index < 20; index += 1) feed(quiet);

    await waitFor(() => expect(onText).toHaveBeenCalledWith("открой папку загрузки"));
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("кашель и шум не превращаются в задачу и не ругаются", async () => {
    const transcribe = vi.fn(async () => "");
    const onText = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ always: true, local: { transcribe }, onText, onError }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(sink).not.toBeNull());

    // Один короткий всплеск — не фраза.
    feed(speech());
    for (let index = 0; index < 30; index += 1) feed(quiet);

    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("выключили режим — микрофон закрыт, разбор не запускается", async () => {
    const transcribe = vi.fn(async () => "лишнее");
    const onText = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ always: true, local: { transcribe }, onText, onError: vi.fn() }),
    );

    act(() => result.current.start());
    await waitFor(() => expect(sink).not.toBeNull());
    for (let index = 0; index < 5; index += 1) feed(speech());
    await waitFor(() => expect(result.current.speaking).toBe(true));

    act(() => result.current.stop());
    await waitFor(() => expect(result.current.listening).toBe(false));
    expect(result.current.speaking).toBe(false);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("без своего движка режим недоступен, и это видно по состоянию", () => {
    const { result } = renderHook(() =>
      useVoice({ always: true, local: null, onText: vi.fn(), onError: vi.fn() }),
    );

    expect(result.current.alwaysSupported).toBe(false);
  });
});
