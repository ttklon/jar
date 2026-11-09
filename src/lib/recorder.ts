/**
 * Запись с микрофона в WAV — путь, на котором звук не покидает компьютер.
 *
 * Модуль нарочно тонкий: вся арифметика (частота, тишина, заголовок) живёт в `wav.ts`
 * и проверяется без звука. Здесь только то, что требует браузера: разрешение на
 * микрофон, граф, накопление кусков и остановка.
 *
 * Чего здесь нет и почему: обрезки по тишине в реальном времени и потоковой отправки.
 * Сначала пусть работает простой путь «записали — распознали»; потоковая передача
 * нужна, когда распознавание станет локальным и быстрым настолько, что будет
 * успевать за речью.
 */

import { prepare, TARGET_RATE } from "./wav";

/** Нет микрофона — так и говорим, без «не удалось». */
export const NO_MIC = "микрофон в этом окружении недоступен";

export interface Recording {
  wav: Uint8Array;
  /** Длительность записи после обрезки тишины. */
  seconds: number;
  sampleRate: number;
}

export interface Recorder {
  stop(): Promise<Recording>;
}

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
}

interface StreamLike {
  getTracks(): { stop(): void }[];
}

interface MediaDevicesLike {
  getUserMedia(constraints: unknown): Promise<StreamLike>;
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
export async function startRecording(rate = TARGET_RATE): Promise<Recorder> {
  const devices = (navigator as unknown as { mediaDevices?: MediaDevicesLike }).mediaDevices;
  if (!devices || typeof devices.getUserMedia !== "function") {
    throw new Error(NO_MIC);
  }

  let stream: StreamLike;
  try {
    stream = await devices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : String(error);
    throw new Error(
      name === "NotAllowedError"
        ? "микрофон закрыт: разрешите доступ к нему"
        : `микрофон не открылся: ${name}`,
    );
  }

  const Context = (globalThis as unknown as { AudioContext: new (options?: unknown) => ContextLike })
    .AudioContext;
  const context = new Context({ sampleRate: rate });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);

  // Уводим звук в «тишину»: граф должен быть подключён, иначе браузер не станет
  // вызывать обработчик, но слышать себя в колонках человек не должен.
  const silence = context.createGain();
  silence.gain.value = 0;

  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    // Копия обязательна: буфер переиспользуется, и без копии мы запомнили бы пустоту.
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(silence);
  silence.connect(context.destination);

  let stopped = false;

  return {
    stop: async () => {
      if (stopped) {
        return { wav: new Uint8Array(0), seconds: 0, sampleRate: context.sampleRate };
      }
      stopped = true;

      processor.onaudioprocess = null;
      processor.disconnect();
      silence.disconnect();
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
      await context.close();

      const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const samples = new Float32Array(length);
      let at = 0;
      for (const chunk of chunks) {
        samples.set(chunk, at);
        at += chunk.length;
      }

      const { wav, seconds } = prepare(samples, context.sampleRate);
      return { wav, seconds, sampleRate: context.sampleRate };
    },
  };
}
