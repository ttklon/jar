// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkMicrophone, createLevelMeter } from "./microphoneCheck";
import { startRecording, type FrameSink } from "./recorder";

vi.mock("./recorder", () => ({ startRecording: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("измерение сигнала без хранения записи", () => {
  it("отличает сигнал, тишину и отсутствие кадров", () => {
    const meter = createLevelMeter();
    expect(meter.result().kind).toBe("no-frames");
    meter.feed(new Float32Array(8000), 16000);
    expect(meter.result().kind).toBe("quiet");
    meter.feed(new Float32Array(8000).fill(0.5), 16000);
    expect(meter.result().kind).toBe("signal");
    expect(meter.result().seconds).toBeCloseTo(1);
    expect(meter.result().peak).toBe(0.5);
  });

  it("не принимает NaN, бесконечность и слишком короткий поток за успех", () => {
    const meter = createLevelMeter();
    meter.feed(new Float32Array([NaN, Infinity, -Infinity]), 16000);
    meter.feed(new Float32Array(8000).fill(0.5), 0);
    expect(meter.result()).toMatchObject({ kind: "no-frames", rms: 0, peak: 0 });
    meter.feed(new Float32Array(10).fill(1), 16000);
    expect(meter.result().kind).toBe("no-frames");
  });
});

describe("ограниченный локальный тест устройства", () => {
  function recording(frame?: Float32Array) {
    const stop = vi.fn().mockResolvedValue({ wav: new Uint8Array(44), seconds: 0, sampleRate: 16000 });
    vi.mocked(startRecording).mockImplementation(async (_rate, sink?: FrameSink) => {
      if (frame) sink?.(frame, 16000);
      return { stop };
    });
    return stop;
  }

  it("держит захват 3 секунды, просит не хранить аудио, не использует сеть", async () => {
    vi.useFakeTimers();
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    const stop = recording(new Float32Array(8000).fill(0.25));
    const promise = checkMicrophone(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(2999);
    expect(stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toMatchObject({ kind: "signal", peak: 0.25 });
    expect(startRecording).toHaveBeenCalledWith(undefined, expect.any(Function), {
      signal: expect.any(AbortSignal), retainAudio: false,
    });
    expect(stop).toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("молчание и отсутствие кадров не становятся проверенным голосом", async () => {
    vi.useFakeTimers(); recording();
    const promise = checkMicrophone(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(promise).resolves.toMatchObject({ kind: "no-frames" });
  });

  it("отмена во время измерения останавливает рекордер и очищает таймеры", async () => {
    vi.useFakeTimers(); const stop = recording();
    const controller = new AbortController();
    const promise = checkMicrophone(controller.signal);
    const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await assertion;
    expect(stop).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("отказ доступа сохраняет причину и не оставляет таймер", async () => {
    vi.useFakeTimers();
    vi.mocked(startRecording).mockRejectedValueOnce(new Error("микрофон закрыт"));
    await expect(checkMicrophone(new AbortController().signal)).rejects.toThrow("микрофон закрыт");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("зависшее закрытие ограничено 30 секундами, а не ложным успехом", async () => {
    vi.useFakeTimers();
    const stop = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.mocked(startRecording).mockResolvedValueOnce({ stop });
    const promise = checkMicrophone(new AbortController().signal);
    const assertion = expect(promise).rejects.toThrow(/30 секунд/);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
