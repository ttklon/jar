import { startRecording } from "./recorder";
import { audioCapture, microphoneCheck as text } from "../i18n/ru";

export interface MicrophoneMeasurement {
  kind: "signal" | "quiet" | "no-frames";
  seconds: number;
  rms: number;
  peak: number;
}

/** Keep numbers only, never samples, WAVs, URLs or a transcript. */
export function createLevelMeter() {
  let count = 0;
  let energy = 0;
  let peak = 0;
  let seconds = 0;
  return {
    feed(frame: Float32Array, rate: number): void {
      if (!Number.isFinite(rate) || rate <= 0) return;
      for (const sample of frame) {
        if (!Number.isFinite(sample)) continue;
        const value = Math.min(1, Math.abs(sample));
        count++;
        seconds += 1 / rate;
        energy += value * value;
        peak = Math.max(peak, value);
      }
    },
    result(): MicrophoneMeasurement {
      const rms = count ? Math.sqrt(energy / count) : 0;
      return { kind: seconds < 0.2 ? "no-frames" : rms < 0.003 ? "quiet" : "signal", seconds, rms, peak };
    },
  };
}

function cancelled(): Error {
  return Object.assign(new Error(audioCapture.cancelled), { name: "AbortError" });
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
  });
}

function withAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    pending.then((value) => {
      signal.removeEventListener("abort", cancel);
      resolve(value);
    }, (reason: unknown) => {
      signal.removeEventListener("abort", cancel);
      reject(reason);
    });
    if (signal.aborted) cancel();
  });
}

/** Explicit local device test, not ASR. No IPC, network, disk or playback. */
export async function checkMicrophone(signal: AbortSignal): Promise<MicrophoneMeasurement> {
  const controller = new AbortController();
  const forward = () => controller.abort(cancelled());
  signal.addEventListener("abort", forward, { once: true });
  if (signal.aborted) forward();
  const deadline = setTimeout(() => controller.abort(new Error(text.timeout)), 30_000);
  const meter = createLevelMeter();
  let recorder: Awaited<ReturnType<typeof startRecording>> | undefined;
  try {
    recorder = await startRecording(undefined, (frame, rate) => {
      if (!controller.signal.aborted) meter.feed(frame, rate);
    }, { signal: controller.signal, retainAudio: false });
    await wait(3_000, controller.signal);
    await withAbort(recorder.stop(), controller.signal);
    if (controller.signal.aborted) throw controller.signal.reason;
    return meter.result();
  } catch (error) {
    throw controller.signal.aborted ? controller.signal.reason : error;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", forward);
    // abort closes tracks synchronously even when AudioContext.close is slow.
    controller.abort(cancelled());
    void recorder?.stop().catch(() => undefined);
  }
}
