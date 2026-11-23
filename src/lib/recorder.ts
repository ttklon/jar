/**
 * Запись с микрофона в WAV — путь, на котором звук не покидает компьютер.
 *
 * Модуль нарочно тонкий: вся арифметика (частота, тишина, заголовок) живёт в `wav.ts`
 * и проверяется без звука. Здесь только то, что требует браузера: разрешение на
 * микрофон, граф, накопление кусков и остановка.
 *
 * Куски отдаются наружу (`FrameSink`), но решений о том, когда человек заговорил, здесь
 * нет: это `vad.ts`, и он проверяется без микрофона.
 *
 * Чего здесь нет и почему: потоковой отправки звука.
 * Сначала пусть работает простой путь «записали — распознали»; потоковая передача
 * нужна, когда распознавание станет локальным и быстрым настолько, что будет
 * успевать за речью.
 */

import { audioCapture as text } from "../i18n/ru";
import { prepare, TARGET_RATE } from "./wav";

/** Нет микрофона — так и говорим, без «не удалось». */
export const NO_MIC = text.unavailable;

export interface Recording {
  wav: Uint8Array;
  /** Длительность записи после обрезки тишины. */
  seconds: number;
  sampleRate: number;
}

export interface Recorder {
  stop(): Promise<Recording>;
}

/**
 * Что делать с каждым куском звука по мере записи.
 *
 * Нужен режиму «слушаю всегда»: пока пишем, кто-то должен решать, началась ли фраза.
 * Возвращённое `false` прекращает сбор кадров. Владелец обязан вызвать stop()
 * вне аудиоколбэка, чтобы закрыть граф и микрофон.
 */
export type FrameSink = (frame: Float32Array, sampleRate: number) => boolean | void;


interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

interface ProcessorLike {
  onaudioprocess: ((event: { inputBuffer: AudioBufferLike }) => void) | null;
  connect(node: unknown): void;
  disconnect(): void;
}

interface GainLike {
  gain: { value: number };
  connect(node: unknown): void;
  disconnect(): void;
}

interface ContextLike {
  sampleRate: number;
  destination: unknown;
  createMediaStreamSource(stream: unknown): { connect(node: unknown): void; disconnect(): void };
  createScriptProcessor(size: number, input: number, output: number): ProcessorLike;
  createGain(): GainLike;
  close(): Promise<void>;
  resume?(): Promise<void>;
}

interface StreamLike {
  getTracks(): { stop(): void }[];
}

interface MediaDevicesLike {
  getUserMedia(constraints: unknown): Promise<StreamLike>;
  /**
   * Список устройств (шаг 54). Необязателен: браузер может его не дать, и это
   * не повод не работать — тогда берём системное устройство по умолчанию.
   */
  enumerateDevices?(): Promise<
    { kind?: string; deviceId?: string; label?: string }[]
  >;
}

/**
 * Устройства ввода звука и то, какое из них сейчас по умолчанию (шаг 54).
 *
 * Нужно, чтобы подключённая гарнитура подхватывалась без перезапуска, а пропажа
 * прежнего микрофона была сказана словами, а не молчанием. Ошибку чтения
 * глотаем: список — подсказка, а не условие записи.
 */
export async function inputDevices(): Promise<{
  inputs: { id: string; label: string }[];
  defaultId: string | null;
}> {
  const devices = (navigator as unknown as { mediaDevices?: MediaDevicesLike }).mediaDevices;
  if (typeof devices?.enumerateDevices !== "function") return { inputs: [], defaultId: null };
  try {
    const all = await devices.enumerateDevices();
    const inputs = all
      .filter((device) => device.kind === "audioinput" && device.deviceId)
      .map((device) => ({ id: device.deviceId ?? "", label: device.label ?? "" }));
    // Браузер не говорит, какое устройство по умолчанию, но **ставит его
    // первым**. Это единственный доступный признак, и он верный.
    return { inputs, defaultId: inputs[0]?.id ?? null };
  } catch {
    return { inputs: [], defaultId: null };
  }
}

/** Есть ли микрофон, за которым можно пойти. */
export function microphoneAvailable(): boolean {
  const devices = (navigator as unknown as { mediaDevices?: MediaDevicesLike }).mediaDevices;
  return typeof devices?.getUserMedia === "function";
}

/**
 * Начинает запись. Ошибки называют причину: «нет доступа» и «нет микрофона» — это
 * разные вещи, и человеку нужно знать, какую из них чинить.
 */
export interface CaptureOptions {
  signal?: AbortSignal;
  /** Diagnostic mode: inspect frames but never retain audio chunks or a waveform. */
  retainAudio?: boolean;
}

function aborted(): Error {
  return Object.assign(new Error(text.cancelled), { name: "AbortError" });
}

function abortable(pending: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted());
    signal?.addEventListener("abort", cancel, { once: true });
    pending.then(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, (error: unknown) => {
      signal?.removeEventListener("abort", cancel);
      reject(error);
    });
  });
}

/** getUserMedia cannot be aborted by the browser API: release late grants ourselves. */
async function openStream(devices: MediaDevicesLike, signal?: AbortSignal): Promise<StreamLike> {
  if (signal?.aborted) throw aborted();
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted());
    signal?.addEventListener("abort", cancel, { once: true });
    let pending: Promise<StreamLike>;
    try {
      pending = devices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (error) {
      signal?.removeEventListener("abort", cancel);
      reject(error);
      return;
    }
    pending.then((stream) => {
      signal?.removeEventListener("abort", cancel);
      if (signal?.aborted) { stopTracks(stream); reject(aborted()); }
      else resolve(stream);
    }, (error: unknown) => {
      signal?.removeEventListener("abort", cancel);
      reject(error);
    });
  });
}

function stopTracks(stream: StreamLike): void {
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* Continue releasing the remaining tracks. */ }
  }
}

export async function startRecording(
  rate = TARGET_RATE,
  onFrame?: FrameSink,
  options: CaptureOptions = {},
): Promise<Recorder> {
  const devices = (navigator as unknown as { mediaDevices?: MediaDevicesLike }).mediaDevices;
  if (!devices || typeof devices.getUserMedia !== "function") throw new Error(NO_MIC);
  let stream: StreamLike;
  try { stream = await openStream(devices, options.signal); }
  catch (error) {
    const name = error instanceof Error ? error.name : String(error);
    if (name === "AbortError") throw error;
    throw new Error(name === "NotAllowedError" ? text.denied
      : name === "NotFoundError" ? text.missing
      : name === "NotReadableError" ? text.busy : text.failed(name));
  }

  let context: ContextLike | undefined;
  let source: ReturnType<ContextLike["createMediaStreamSource"]> | undefined;
  let processor: ProcessorLike | undefined;
  let silence: GainLike | undefined;
  let stopped = false;
  const chunks: Float32Array[] = [];
  const cancel = () => { chunks.length = 0; void release().catch(() => undefined); };
  // Track release is synchronous; a slow/failed AudioContext.close must not retain it.
  async function release(): Promise<void> {
    if (stopped) return;
    stopped = true;
    options.signal?.removeEventListener("abort", cancel);
    if (processor) processor.onaudioprocess = null;
    for (const node of [processor, silence, source]) {
      try { node?.disconnect(); } catch { /* Still close the device and other nodes. */ }
    }
    stopTracks(stream);
    await context?.close();
  }

  try {
    if (options.signal?.aborted) throw aborted();
    const Context = (globalThis as unknown as { AudioContext?: new (options?: unknown) => ContextLike }).AudioContext;
    if (!Context) throw new Error(text.graph);
    context = new Context({ sampleRate: rate });
    const activeContext = context;
    source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(1024, 1, 1);
    const activeProcessor = processor;
    silence = context.createGain();
    silence.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (stopped) return;
      const copy = new Float32Array(event.inputBuffer.getChannelData(0));
      if (options.retainAudio !== false) chunks.push(copy);
      // false stops frame collection; the caller still closes the recorder outside
      // the audio callback (the VAD path schedules that close explicitly).
      if (onFrame?.(copy, activeContext.sampleRate) === false) activeProcessor.onaudioprocess = null;
    };
    source.connect(processor);
    processor.connect(silence);
    silence.connect(context.destination);
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) throw aborted();
    await abortable(context.resume?.() ?? Promise.resolve(), options.signal);
    if (options.signal?.aborted || stopped) throw aborted();
  } catch (error) {
    await release().catch(() => undefined);
    throw error;
  }

  const sampleRate = context.sampleRate;
  return {
    stop: async () => {
      if (stopped) return { wav: new Uint8Array(0), seconds: 0, sampleRate };
      await release();
      const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const samples = new Float32Array(length);
      let at = 0;
      for (const chunk of chunks) { samples.set(chunk, at); at += chunk.length; }
      chunks.length = 0;
      const { wav, seconds } = prepare(samples, sampleRate);
      return { wav, seconds, sampleRate };
    },
  };
}
